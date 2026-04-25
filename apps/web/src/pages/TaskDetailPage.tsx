import { FormEvent, type ClipboardEvent as ReactClipboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  LEGACY_STATE_TO_STATUS_ID,
  INBOX_COMPONENTS,
  STATE_META,
  STRUCTURE_META,
  TEMPLATE_META,
  type Analytics,
  type AppData,
  type ApprovalLine,
  type ApprovalPolicy,
  type DecisionType,
  type FormFieldType,
  type InboxComponent,
  type Member,
  type Mention,
  type Note,
  type NotificationSettings,
  type Role,
  type Task,
  type TaskAttachment,
  type TaskState,
  type Template,
  type TemplateType,
  type ThreadComment,
  type TimelineEvent,
  type Unit,
  type UnitMember,
  type UnitMemberRole
} from "@hwe/shared";
import { Badge, Centered, FilterShell, Meta, MetaWithHint, PageHeader, PanelHeader, PanelTitle, Select, Tabs } from "../components/ui";
import { request } from "../lib/api";
import { go } from "../lib/router";
import type { TaskDetail, TaskView } from "../lib/viewTypes";
import { TaskViewTabs } from "../features/tasks/TaskViewTabs";
import {
  TASK_DESCRIPTION_FIELD_KEY,
  buildTaskBreadcrumb,
  decisionActions,
  decisionHint,
  decisionLabel,
  densitySignal,
  elapsed,
  eventLabel,
  formatDate,
  formatFailure,
  hasChangedSinceSeen,
  isBacklogTask,
  isDueToday,
  memberName,
  pct,
  priorityLabel,
  profileDisplayName,
  roleLabel,
  shortText,
  states,
  taskAccessOf,
  templateLabel,
  templateOrder,
  templateTone,
  templateTypes,
  useDebouncedEffect,
  type TaskAccessLevel,
  type TaskViewMode
} from "../lib/domain";

export function TaskWorkspace({ taskId, me, templates, onReload }: { taskId: string; me: Member; templates: Template[]; onReload: () => Promise<void> }) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [decision, setDecision] = useState<{ toState: TaskState; decisionType: DecisionType; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState({ title: "" });
  const [autoSaving, setAutoSaving] = useState(false);
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const loadedTaskId = useRef<string | null>(null);

  const load = async () => {
    try {
      setDetail(await request<TaskDetail>(`/api/tasks/${taskId}`));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("TASK_NOT_FOUND")) {
        go("/tasks");
        return;
      }
      throw err;
    }
  };

  useEffect(() => {
    void load().catch((err) => {
      setActionError(
        err instanceof Error
          ? err.message
          : formatFailure("태스크 조회 실패", "대상 정보를 불러오지 못했습니다", "잠시 후 다시 시도하세요")
      );
    });
  }, [taskId]);

  useEffect(() => {
    if (!detail) return;
    setTaskDraft({ title: detail.task.title });
    loadedTaskId.current = detail.task.id;
  }, [detail?.task.id, detail?.task.title]);

  const task = detail?.task;

  const saveTask = async (nextDraft = taskDraft, quiet = false) => {
    if (!nextDraft.title.trim() || !detail || !task) return;
    if (detail.permissions?.canEditTask === false) return;
    if (nextDraft.title === detail.task.title) return;
    try {
      if (quiet) setAutoSaving(true);
      else setBusy(true);
      setActionError(null);
      await request(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(nextDraft) });
      await Promise.all([load(), onReload()]);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : formatFailure("태스크 저장 실패", "변경사항이 반영되지 않았습니다", "입력값과 권한을 확인한 뒤 다시 저장하세요")
      );
    } finally {
      if (quiet) setAutoSaving(false);
      else setBusy(false);
    }
  };

  useDebouncedEffect(() => {
    if (!detail || loadedTaskId.current !== detail.task.id) return;
    if (detail.permissions?.canEditTask === false) return;
    if (taskDraft.title === detail.task.title) return;
    void saveTask(taskDraft, true);
  }, [taskDraft.title, detail?.task.id], 1100);

  if (!detail || !task) return <Centered><div className="loader" /></Centered>;

  const { parent, notes, attachments = [], referenceableNotes = notes, referenceableTasks = [task], comments, timeline, members, children, permissions } = detail;
  const fallbackCanEdit = me.role === "ADMIN" || me.role === "SUPER_ADMIN" || task.ownerId === me.id || task.assigneeIds.includes(me.id);
  const canEditTask = permissions?.canEditTask ?? fallbackCanEdit;
  const canEditForm = permissions?.canEditForm ?? fallbackCanEdit;
  const permissionStatus = canEditTask
    ? "편집 가능 · 담당자, 소유자, 유닛 오너 또는 관리자"
    : "읽기 전용 · 제목, 담당자, 공유, 기한, 우선순위, 상태는 담당자/소유자/유닛 오너만 수정";
  const changed = hasChangedSinceSeen(task, parent, me.id);
  const canApprove = ["OWNER", "ADMIN", "SUPER_ADMIN"].includes(me.role);
  const canDeleteTask = me.role === "ADMIN" || me.role === "SUPER_ADMIN" || task.ownerId === me.id;
  const latestDecisionEvent = timeline.find((event) =>
    ["APPROVAL_REQUESTED", "APPROVAL_APPROVED", "APPROVAL_REJECTED"].includes(event.type)
  );
  const pendingApproval = (task.workflowStatusId ?? "").includes("pending");
  const decisionStageLabel = pendingApproval
    ? "승인 대기"
    : latestDecisionEvent?.type === "APPROVAL_APPROVED"
      ? "승인 완료"
      : latestDecisionEvent?.type === "APPROVAL_REJECTED"
        ? "반려 완료"
        : latestDecisionEvent?.type === "APPROVAL_REQUESTED"
          ? "검토 진행"
          : "일반 전이";
  const approvalPayload = latestDecisionEvent?.payload ?? {};
  const approvalLineCount = Number(approvalPayload.approvalLineCount ?? 0);
  const finalApproverId = typeof approvalPayload.finalApproverId === "string" ? approvalPayload.finalApproverId : null;
  const transitionApprovalEnabled = Boolean(approvalPayload.transitionApprovalEnabled);
  const finalApproverName = finalApproverId ? memberName(members, finalApproverId) : null;

  const deleteTask = async () => {
    if (!canDeleteTask || !window.confirm("이 태스크와 하위 태스크, 노트, 스레드, 타임라인을 삭제할까요?")) return;
    try {
      setBusy(true);
      setActionError(null);
      await request(`/api/tasks/${task.id}`, { method: "DELETE" });
      await onReload();
      go("/tasks");
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : formatFailure("태스크 삭제 실패", "대상 태스크가 그대로 유지됩니다", "권한과 하위 구조를 확인한 뒤 다시 시도하세요")
      );
    } finally {
      setBusy(false);
    }
  };

  const transition = async (payload: { toState: TaskState; decisionType: DecisionType; reason: string; referencedNoteIds: string[] }) => {
    try {
      setBusy(true);
      setActionError(null);
      await request(`/api/tasks/${task.id}/transition`, { method: "POST", body: JSON.stringify(payload) });
      await Promise.all([load(), onReload()]);
      setDecision(null);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : formatFailure("상태 전이 처리 실패", "상태와 타임라인이 변경되지 않았습니다", "사유와 참조 노트를 확인한 뒤 다시 시도하세요")
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-stack">
      <div className="decision-layout">
        <div className="main-column">
          <div className="task-heading">
            <div className="task-heading-top">
              <nav className="task-breadcrumb" aria-label="태스크 경로">
                {buildTaskBreadcrumb(task, referenceableTasks).map((node, index, rows) => (
                  <span key={node.id}>
                    <button className={`breadcrumb-link ${node.id === task.id ? "current" : ""}`} onClick={() => go(`/tasks/${node.id}`)}>
                      {node.title}
                    </button>
                    {index < rows.length - 1 && <i>›</i>}
                  </span>
                ))}
              </nav>
              <div className="task-heading-top-actions">
                <button className="back-link" onClick={() => go("/tasks")}>목록으로</button>
                <div className="task-danger-menu">
                  <button className="button secondary more-icon-btn" onClick={() => setTaskMenuOpen((prev) => !prev)} aria-label="태스크 메뉴">⋯</button>
                  {taskMenuOpen && (
                    <div className="next-action-menu compact-menu">
                      <button
                        className="next-action-item danger"
                        disabled={busy || !canDeleteTask}
                        title={
                          canDeleteTask
                            ? "태스크 삭제"
                            : "삭제 불가: 현재 사용자는 삭제 권한이 없습니다. 소유자이거나 관리자 권한일 때 삭제할 수 있습니다."
                        }
                        onClick={() => void deleteTask()}
                      >
                        <strong>태스크 삭제</strong>
                        <small>하위 태스크, 노트, 스레드, 타임라인 포함</small>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="task-title-row">
              <input
                className="task-title-input"
                value={taskDraft.title}
                maxLength={120}
                disabled={!canEditTask}
                title={canEditTask ? "태스크 제목" : "읽기 전용: 담당자, 소유자 또는 유닛 오너만 제목을 수정할 수 있습니다."}
                onChange={(event) => setTaskDraft((prev) => ({ ...prev, title: event.target.value }))}
                onBlur={() => void saveTask(taskDraft, true)}
                aria-label="태스크 제목"
              />
              <div className="task-heading-actions">
                <span className={`save-indicator ${actionError ? "error" : autoSaving ? "saving" : "saved"}`}>
                  {actionError ? "Error" : autoSaving ? "Saving" : "Saved"}
                </span>
                {actionError && <button className="button secondary task-head-button" onClick={() => setTaskDraft({ title: task.title })}>되돌리기</button>}
              </div>
            </div>
            <div className="task-status-strip">
              <Badge tone={templateTone(task.templateType)}>{templateLabel(task.templateType)}</Badge>
              <Badge tone={STRUCTURE_META[task.structureState].tone}>{STRUCTURE_META[task.structureState].label}</Badge>
              <Badge tone={STATE_META[task.currentState].tone}>{STATE_META[task.currentState].label}</Badge>
              <span>notes {notes.length}</span>
              <span>threads {comments.length}</span>
              <span>children {children.length}</span>
            </div>
            <div className={`permission-strip ${canEditTask ? "editable" : "readonly"}`}>
              <strong>{canEditTask ? "편집 가능" : "읽기 전용"}</strong>
              <span>{permissionStatus}</span>
              {!canEditForm && <em>양식 산출물도 읽기 전용</em>}
            </div>
            <div className={`permission-strip ${pendingApproval ? "readonly" : "editable"}`}>
              <strong>합의/승인 단계</strong>
              <span>{decisionStageLabel}</span>
              {latestDecisionEvent?.reason ? <em>최근 사유: {shortText(latestDecisionEvent.reason, 80)}</em> : null}
              <em>
                {transitionApprovalEnabled || task.approvalPolicyId
                  ? `정책 ${task.approvalPolicyId ? "연결" : "미지정"} · 승인 라인 ${approvalLineCount}`
                  : "승인 게이트 비활성"}
              </em>
              {finalApproverName ? <em>최종 승인자: {finalApproverName}</em> : null}
            </div>
            {task.policyReviewRequired ? (
              <div className="permission-strip readonly">
                <strong>정책 재검토 필요</strong>
                <span>{task.policyReviewReason ?? "템플릿 전환 후 승인정책/워크플로우 정합성 확인이 필요합니다."}</span>
              </div>
            ) : null}
            <SystemFieldsPanel
              task={task}
              members={members}
              templates={templates}
              referenceableTasks={referenceableTasks}
              children={children}
              canEditTask={canEditTask}
              canApprove={canApprove}
              childrenCount={children.length}
              notes={notes}
              comments={comments}
              onOpenDecision={setDecision}
              approvalModeHint={typeof approvalPayload.approvalMode === "string" ? approvalPayload.approvalMode : null}
              onReload={load}
            />
          </div>
          {changed && parent && (
            <div className="change-banner">
              <strong>{parent.title}</strong>
              <span>상위 결정 대상이 마지막 방문 이후 업데이트되었습니다.</span>
              <button className="button secondary" onClick={() => go(`/tasks/${parent.id}`)}>확인</button>
            </div>
          )}
          <FormOutput task={task} attachments={attachments} canEditForm={canEditForm} onReload={load} />
          <AttachmentsSection taskId={task.id} attachments={attachments} canEdit={canEditTask} onReload={load} />
          <NotesSection taskId={task.id} notes={notes} attachments={attachments} members={members} onReload={load} />
        </div>

        <TaskRightPanel
          taskId={task.id}
          task={task}
          referenceableTasks={referenceableTasks}
          notes={referenceableNotes}
          tasks={referenceableTasks}
          comments={comments}
          members={members}
          timeline={timeline}
          me={me}
          onReload={load}
        />
      </div>

      {decision && (
        <DecisionModal
	          decision={decision}
	          notes={referenceableNotes}
          busy={busy}
          onClose={() => setDecision(null)}
          onSubmit={transition}
        />
      )}
    </section>
  );
}

function TaskRightPanel({
  taskId,
  task,
  referenceableTasks,
  notes,
  tasks,
  comments,
  members,
  timeline,
  me,
  onReload
}: {
  taskId: string;
  task: TaskView;
  referenceableTasks: TaskView[];
  notes: Note[];
  tasks: TaskView[];
  comments: ThreadComment[];
  members: Member[];
  timeline: TimelineEvent[];
  me: Member;
  onReload: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"thread" | "timeline">(() => {
    const value = new URLSearchParams(window.location.search).get("rt");
    return value === "timeline" ? "timeline" : "thread";
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (tab === "thread") url.searchParams.delete("rt");
    else url.searchParams.set("rt", tab);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [tab]);
  return (
    <aside className="task-right-panel">
      <TaskContextMiniMap task={task} referenceableTasks={referenceableTasks} />
      <Tabs
        variant="panel"
        value={tab}
        onChange={(value) => setTab(value as typeof tab)}
        tabs={[
          { value: "thread", label: "논의", count: comments.length },
          { value: "timeline", label: "변경 기록", count: timeline.length }
        ]}
      />
      <div className="task-right-content">
        {tab === "thread" ? (
          <ThreadPanel taskId={taskId} notes={notes} tasks={tasks} comments={comments} members={members} me={me} onReload={onReload} />
        ) : (
          <TimelinePanel timeline={timeline} notes={notes} members={members} />
        )}
      </div>
    </aside>
  );
}

function TaskDependencyImpactPanel({ task, referenceableTasks }: { task: TaskView; referenceableTasks: TaskView[] }) {
  const graph = useMemo(() => {
    const byId = new Map(referenceableTasks.map((row) => [row.id, row]));
    const parent = task.parentId ? byId.get(task.parentId) ?? null : null;
    const children = referenceableTasks.filter((row) => row.parentId === task.id);

    const ancestors: TaskView[] = [];
    const visited = new Set<string>([task.id]);
    let cursor = parent;
    while (cursor && !visited.has(cursor.id)) {
      ancestors.push(cursor);
      visited.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) ?? null : null;
    }

    const descendants: TaskView[] = [];
    const queue = [...children];
    const seen = new Set<string>(queue.map((row) => row.id));
    while (queue.length) {
      const node = queue.shift()!;
      descendants.push(node);
      const next = referenceableTasks.filter((row) => row.parentId === node.id);
      next.forEach((row) => {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          queue.push(row);
        }
      });
    }
    return { parent, children, ancestors, descendants };
  }, [referenceableTasks, task.id, task.parentId]);

  const impactTone = graph.descendants.length >= 8 ? "high" : graph.descendants.length >= 3 ? "medium" : "low";
  const impactLabel = impactTone === "high" ? "HIGH" : impactTone === "medium" ? "MEDIUM" : "LOW";
  return (
    <div className="task-dependency-panel">
      <div className="task-context-head task-dependency-head">
        <strong>의존성/영향 범위</strong>
        <small>Risk {impactLabel}</small>
      </div>
      <p className="task-dependency-caption">Depends on (선행) / Blocks & Affects (후행 영향)</p>
      <div className="task-dependency-metrics">
        <span><i>⛓</i>Depends on {graph.parent ? "1" : "0"}</span>
        <span><i>⛔</i>Blocks {graph.children.length}</span>
        <span><i>↘</i>Affected {graph.descendants.length}</span>
      </div>
      <div className="task-dependency-group">
        <h5><i>⛓</i>Depends on (Upstream)</h5>
        {graph.parent ? (
          <button className="task-dependency-item" onClick={() => go(`/tasks/${graph.parent!.id}`)} title={graph.parent.title}>
            <b>{graph.parent.title}</b>
            <small>이 태스크가 선행 완료를 기다리는 항목</small>
          </button>
        ) : (
          <p className="muted">선행 의존성이 없습니다 (No upstream dependency).</p>
        )}
        {graph.ancestors.length > 1 && (
          <p className="muted">Upstream chain: {graph.ancestors.length} steps</p>
        )}
      </div>
      <div className="task-dependency-group">
        <h5><i>↘</i>Blocks / Affected (Downstream)</h5>
        {graph.children.length ? (
          <div className="task-dependency-list">
            {graph.children.slice(0, 6).map((child) => (
              <button key={child.id} className="task-dependency-item" onClick={() => go(`/tasks/${child.id}`)} title={child.title}>
                <b>{child.title}</b>
                <small>이 태스크 완료가 필요한 직접 후행 항목</small>
              </button>
            ))}
            {graph.children.length > 6 && (
              <p className="muted">+{graph.children.length - 6} more downstream tasks</p>
            )}
          </div>
        ) : (
          <p className="muted">직접 후행 영향 항목이 없습니다 (No downstream impact).</p>
        )}
      </div>
    </div>
  );
}

function TaskContextMiniMap({ task, referenceableTasks }: { task: TaskView; referenceableTasks: TaskView[] }) {
  const parent = task.parentId ? referenceableTasks.find((row) => row.id === task.parentId) ?? null : null;
  const children = referenceableTasks.filter((row) => row.parentId === task.id);
  const childPreview = children;
  const mapInnerWidth = 320;
  const mapPad = 12;
  const nodeTitleFontSize = childPreview.length >= 6 ? 10 : childPreview.length >= 3 ? 11 : 12;
  const parentNode = { x: mapPad, y: 12, w: 112, h: 38 };
  const currentNode = { x: Math.round((mapInnerWidth - 136) / 2), y: 78, w: 136, h: 46 };
  const childNodeWidth = 92;
  const childNodeHeight = 40;
  const childX = mapInnerWidth - childNodeWidth - mapPad;
  const childGapY = 42;
  const childStartY = currentNode.y + 16;
  const childPositions = childPreview.map((_, index) => ({ x: childX, y: childStartY + index * childGapY, w: childNodeWidth, h: childNodeHeight }));
  const leafNode = { x: childX, y: currentNode.y + 22, w: childNodeWidth, h: childNodeHeight };
  const visibleRects = [
    parent ? parentNode : parentNode,
    currentNode,
    ...(childPreview.length ? childPositions : [leafNode])
  ];
  const bounds = visibleRects.reduce(
    (acc, rect) => ({
      minX: Math.min(acc.minX, rect.x),
      minY: Math.min(acc.minY, rect.y),
      maxX: Math.max(acc.maxX, rect.x + rect.w),
      maxY: Math.max(acc.maxY, rect.y + rect.h)
    }),
    { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: 0, maxY: 0 }
  );
  const padding = 12;
  const viewBox = `${bounds.minX - padding} ${bounds.minY - padding} ${bounds.maxX - bounds.minX + padding * 2} ${bounds.maxY - bounds.minY + padding * 2}`;
  const mapPixelHeight = Math.max(152, bounds.maxY - bounds.minY + padding * 2);
  const parentHasEdge = Boolean(parent);
  const childHasEdge = childPreview.length > 0;
  return (
    <section className="panel task-context-minimap">
      <div className="task-context-head">
        <strong>관계/구조 맥락</strong>
        <small>1-depth</small>
      </div>
      <div className="task-context-map" style={{ height: `${mapPixelHeight}px` }} role="img" aria-label="태스크 상하위 맥락 미니맵">
        <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
          <path
            className={`task-context-edge ${parentHasEdge ? "solid" : "dashed"}`}
            d={`M ${parentNode.x + parentNode.w} ${parentNode.y + parentNode.h / 2} C ${parentNode.x + parentNode.w + 28} ${parentNode.y + parentNode.h / 2}, ${currentNode.x - 24} ${currentNode.y + 12}, ${currentNode.x} ${currentNode.y + 12}`}
          />
          {childHasEdge
            ? childPositions.map((pos, index) => (
              <path
                key={`edge-${index}`}
                className="task-context-edge solid"
                d={`M ${currentNode.x + currentNode.w} ${currentNode.y + currentNode.h / 2} C ${currentNode.x + currentNode.w + 22} ${currentNode.y + currentNode.h / 2 + 6}, ${pos.x - 14} ${pos.y + pos.h / 2 - 4}, ${pos.x} ${pos.y + pos.h / 2}`}
              />
            ))
            : (
              <path
                className="task-context-edge dashed"
                d={`M ${currentNode.x + currentNode.w} ${currentNode.y + currentNode.h / 2} C ${currentNode.x + currentNode.w + 22} ${currentNode.y + currentNode.h / 2 + 6}, ${leafNode.x - 14} ${leafNode.y + leafNode.h / 2 - 4}, ${leafNode.x} ${leafNode.y + leafNode.h / 2}`}
              />
            )}
        </svg>
        {parent ? (
          <button
            className="task-context-node rf-node parent"
            style={{ left: parentNode.x, top: parentNode.y, width: parentNode.w, height: parentNode.h }}
            onClick={() => go(`/tasks/${parent.id}`)}
            title={parent.title}
          >
            <b style={{ fontSize: `${nodeTitleFontSize}px` }}>{parent.title}</b>
          </button>
        ) : (
          <div className="task-context-empty parent" style={{ left: parentNode.x, top: parentNode.y, width: parentNode.w, height: parentNode.h }}>루트</div>
        )}
        <div className="task-context-node rf-node current" style={{ left: currentNode.x, top: currentNode.y, width: currentNode.w, height: currentNode.h }}>
          <b style={{ fontSize: `${nodeTitleFontSize}px` }}>{task.title}</b>
        </div>
        {childPreview.length ? (
          childPreview.map((child, index) => {
            const pos = childPositions[index];
            return (
              <button
                key={child.id}
                className="task-context-node rf-node child"
                style={{ left: pos.x, top: pos.y, width: pos.w, height: pos.h }}
                onClick={() => go(`/tasks/${child.id}`)}
                title={child.title}
              >
                <b style={{ fontSize: `${nodeTitleFontSize}px` }}>{child.title}</b>
              </button>
            );
          })
        ) : (
          <div className="task-context-empty child" style={{ left: leafNode.x, top: leafNode.y, width: leafNode.w, height: leafNode.h }}>리프</div>
        )}
      </div>
      <div className="task-context-summary">
        <span>head {parent ? "1" : "0"}</span>
        <span>tail {children.length}</span>
      </div>
      <TaskDependencyImpactPanel task={task} referenceableTasks={referenceableTasks} />
    </section>
  );
}

function SystemFieldsPanel({
  task,
  members,
  templates,
  referenceableTasks,
  children,
  canEditTask,
  canApprove,
  childrenCount,
  notes,
  comments,
  onOpenDecision,
  approvalModeHint,
  onReload
}: {
  task: TaskView;
  members: Member[];
  templates: Template[];
  referenceableTasks: TaskView[];
  children: TaskView[];
  canEditTask: boolean;
  canApprove: boolean;
  childrenCount: number;
  notes: Note[];
  comments: ThreadComment[];
  onOpenDecision: (action: { toState: TaskState; decisionType: DecisionType; title: string }) => void;
  approvalModeHint: string | null;
  onReload: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [templateSaveName, setTemplateSaveName] = useState("");
  const [templateSaveBusy, setTemplateSaveBusy] = useState(false);
  const [systemCollapsed, setSystemCollapsed] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [templateSaveModalOpen, setTemplateSaveModalOpen] = useState(false);
  const [templateDiffModalOpen, setTemplateDiffModalOpen] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [recentTemplateIds, setRecentTemplateIds] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem("recent-template-ids");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((row): row is string => typeof row === "string");
    } catch {
      return [];
    }
  });
  const [tagInput, setTagInput] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [decisionState, setDecisionState] = useState<TaskState>(task.currentState);
  const [nextActionOpen, setNextActionOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [fixedFieldsOpen, setFixedFieldsOpen] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState("");
  const shareRef = useRef<HTMLDivElement | null>(null);
  const nextActionRef = useRef<HTMLDivElement | null>(null);
  const typeRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  const patchTask = async (
    label: string,
    patch: Partial<Pick<TaskView, "priority" | "dueDate" | "assigneeIds" | "watcherIds" | "parentId" | "templateId" | "templateType" | "tags">>
  ) => {
    try {
      setSaving(label);
      setError(null);
      await request(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await onReload();
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("시스템 필드 저장 실패", "변경값이 반영되지 않았습니다", "권한과 입력값을 확인한 뒤 다시 시도하세요")
      );
      return false;
    } finally {
      setSaving(null);
    }
  };
  const rememberRecentTemplate = (templateId: string | null) => {
    if (!templateId) return;
    setRecentTemplateIds((prev) => {
      const next = [templateId, ...prev.filter((id) => id !== templateId)].slice(0, 6);
      window.localStorage.setItem("recent-template-ids", JSON.stringify(next));
      return next;
    });
  };
  const updateMemberAccess = async (memberId: string, access: TaskAccessLevel) => {
    const nextAssignees = task.assigneeIds.filter((id) => id !== memberId);
    const nextWatchers = task.watcherIds.filter((id) => id !== memberId);
    if (access === "ASSIGNEE") nextAssignees.push(memberId);
    if (access === "WATCHER") nextWatchers.push(memberId);
    await patchTask("access", { assigneeIds: nextAssignees, watcherIds: nextWatchers });
  };
  const saveAsTemplate = async () => {
    const nextName = templateSaveName.trim() || `${task.title} 템플릿`;
    const fields: Array<{ key: string; label: string; type: FormFieldType; required: boolean }> = Object.entries(task.formValues ?? {})
      .filter(([key]) => key !== TASK_DESCRIPTION_FIELD_KEY)
      .map(([key]) => ({
        key,
        label: key.replace(/[_-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
        type: "TEXT",
        required: false
      }));
    try {
      setTemplateSaveBusy(true);
      setError(null);
      const created = await request<Template>("/api/templates", {
        method: "POST",
        body: JSON.stringify({
          name: nextName,
          type: task.templateType ?? "TASK",
          enabled: true,
          formDefinition: fields,
          inspectionCriteria: []
        })
      });
      await patchTask("template", { templateId: created.id });
      setTemplateSaveName("");
      setTemplateSaveModalOpen(false);
      setMoreMenuOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "템플릿 저장에 실패했습니다.");
    } finally {
      setTemplateSaveBusy(false);
    }
  };
  const pendingTemplate = useMemo(
    () => templates.find((template) => template.id === pendingTemplateId) ?? null,
    [pendingTemplateId, templates]
  );
  const templateChangePreview = useMemo(() => {
    if (!pendingTemplate || !task.templateId || pendingTemplate.id === task.templateId) {
      return {
        keep: [] as string[],
        add: [] as string[],
        review: [] as string[],
        statusImpact: "현재 템플릿과 동일하여 상태 변화가 없습니다.",
        policyImpact: "정책 영향 없음"
      };
    }
    const currentFieldEntries = task.template?.formDefinition ?? [];
    const nextFieldEntries = pendingTemplate.formDefinition ?? [];
    const currentByKey = new Map(currentFieldEntries.map((field) => [field.key, field] as const));
    const nextByKey = new Map(nextFieldEntries.map((field) => [field.key, field] as const));
    const currentLabels = new Map(currentFieldEntries.map((field) => [field.key, field.label] as const));
    const nextLabels = new Map(nextFieldEntries.map((field) => [field.key, field.label] as const));
    const currentKeys = new Set(currentFieldEntries.map((field) => field.key));
    const nextKeys = new Set(nextFieldEntries.map((field) => field.key));

    const keep = [...nextKeys]
      .filter((key) => currentKeys.has(key))
      .map((key) => nextLabels.get(key) ?? currentLabels.get(key) ?? key);
    const add = [...nextKeys]
      .filter((key) => !currentKeys.has(key))
      .map((key) => nextLabels.get(key) ?? key);
    const reviewPool = new Set<string>();
    [...currentKeys].forEach((key) => {
      if (!nextKeys.has(key)) reviewPool.add(key);
    });
    Object.keys(task.formValues ?? {}).forEach((key) => {
      if (key === TASK_DESCRIPTION_FIELD_KEY) return;
      if (!nextKeys.has(key)) reviewPool.add(key);
    });
    const review = [...reviewPool].map((key) => currentLabels.get(key) ?? key);
    [...nextKeys].forEach((key) => {
      if (!currentKeys.has(key)) return;
      const before = currentByKey.get(key);
      const after = nextByKey.get(key);
      if (!before || !after) return;
      if (before.type !== after.type) review.push(`${after.label} (타입 ${before.type} -> ${after.type})`);
      if (Boolean(before.required) !== Boolean(after.required)) {
        review.push(`${after.label} (${before.required ? "필수" : "선택"} -> ${after.required ? "필수" : "선택"})`);
      }
    });

    const statusRows = pendingTemplate.workflowSchema?.statuses ?? [];
    const currentRows = task.template?.workflowSchema?.statuses ?? [];
    const categoryFromCurrentStatus = currentRows.find((row) => row.id === task.workflowStatusId)?.category;
    const categoryFromState = task.currentState === "DRAFT"
      ? "OPEN"
      : task.currentState === "IN_PROGRESS"
        ? "IN_PROGRESS"
        : task.currentState === "DONE"
          ? "DONE"
          : "CANCELED";
    const targetCategory = categoryFromCurrentStatus ?? categoryFromState;
    const byCategory = statusRows.find((row) => row.category === targetCategory)?.id;
    const byDefault = statusRows.find((row) => row.isDefault)?.id;
    const byLegacy = statusRows.find((row) => row.id === LEGACY_STATE_TO_STATUS_ID[task.currentState])?.id;
    const mappedStatusId = byCategory ?? byDefault ?? byLegacy ?? null;
    const statusImpact = mappedStatusId
      ? `예상 상태 매핑: ${targetCategory} -> ${mappedStatusId} (${byCategory ? "category" : byDefault ? "default" : "legacy"})`
      : "예상 상태 매핑 실패 가능성: 서버 검증에서 교체가 차단될 수 있습니다.";

    const transitions = pendingTemplate.workflowSchema?.transitions ?? [];
    const gateMissingPolicy = transitions.some((row) => row.onExit?.approvalGate?.enabled && !row.onExit?.approvalGate?.policyId);
    const policyImpact = task.approvalPolicyId
      ? "현재 승인정책을 유지한 채 서버에서 유효성 재검증됩니다."
      : gateMissingPolicy
        ? "승인게이트 정책 미지정 전이가 있어 교체 후 정책 검토가 필요할 수 있습니다."
        : "승인정책 영향 없음";

    return { keep, add, review, statusImpact, policyImpact };
  }, [pendingTemplate, task.formValues, task.template?.formDefinition, task.template?.workflowSchema?.statuses, task.templateId, task.workflowStatusId, task.currentState, task.approvalPolicyId]);
  const closeTemplateDiffModal = () => {
    setTemplateDiffModalOpen(false);
    setPendingTemplateId(null);
  };
  const confirmTemplateChange = async () => {
    if (!pendingTemplateId) return;
    const ok = await patchTask("template", { templateId: pendingTemplateId });
    if (ok) rememberRecentTemplate(pendingTemplateId);
    closeTemplateDiffModal();
  };
  const requestTemplateChange = (value: string) => {
    if (value === "__BROWSE_TEMPLATES__") {
      go("/settings/templates");
      return;
    }
    const nextTemplateId = value || null;
    if (nextTemplateId === task.templateId) return;
    if (task.templateId && nextTemplateId) {
      setPendingTemplateId(nextTemplateId);
      setTemplateDiffModalOpen(true);
      return;
    }
    void (async () => {
      const ok = await patchTask("template", { templateId: nextTemplateId });
      if (ok) rememberRecentTemplate(nextTemplateId);
    })();
  };
  const templateSelectorOptions = useMemo(() => {
    const enabledTemplates = templates.filter((template) => {
      const lifecycle = template.lifecycleStatus ?? "ACTIVE";
      if (template.id === task.templateId) return true;
      if (lifecycle === "DEPRECATED" || lifecycle === "ARCHIVED") return false;
      return template.enabled;
    });
    const recentIds = recentTemplateIds.filter((id) => enabledTemplates.some((template) => template.id === id));
    const sameTypeIds = enabledTemplates
      .filter((template) => template.type === (task.templateType ?? "TASK"))
      .map((template) => template.id);
    const combined = [...recentIds, ...sameTypeIds, ...enabledTemplates.map((template) => template.id)];
    const deduped: string[] = [];
    combined.forEach((id) => {
      if (!deduped.includes(id)) deduped.push(id);
    });
    const quickTemplates = deduped
      .slice(0, 8)
      .map((id) => enabledTemplates.find((template) => template.id === id))
      .filter((template): template is Template => Boolean(template));
    const overflowCount = Math.max(0, enabledTemplates.length - quickTemplates.length);
    return [
      ["", "자유폼 유지"] as [string, string],
      ...quickTemplates.map((template) => {
        const badge = recentIds.includes(template.id) ? "최근" : template.type === (task.templateType ?? "TASK") ? "유형일치" : "템플릿";
        return [template.id, `${template.name} · ${badge}`] as [string, string];
      }),
      ...(overflowCount > 0 ? [["__BROWSE_TEMPLATES__", `템플릿 센터에서 더 보기 (${overflowCount}개)`] as [string, string]] : [])
    ];
  }, [templates, task.templateId, task.templateType, recentTemplateIds]);
  const addTag = async () => {
    const value = tagInput.trim();
    if (!value) return;
    if (task.tags.includes(value)) {
      setTagInput("");
      return;
    }
    await patchTask("tags", { tags: [...task.tags, value] });
    setTagInput("");
  };
  const removeTag = async (value: string) => {
    await patchTask("tags", { tags: task.tags.filter((tag) => tag !== value) });
  };
  const groupedMembers = useMemo(() => {
    const filtered = members.filter((member) => {
      const q = memberQuery.trim().toLowerCase();
      if (!q) return true;
      return `${member.name} ${member.email} ${member.unit}`.toLowerCase().includes(q);
    });
    const groups = new Map<string, Member[]>();
    filtered.forEach((member) => {
      const rows = groups.get(member.unit) ?? [];
      rows.push(member);
      groups.set(member.unit, rows);
    });
    return [...groups.entries()];
  }, [memberQuery, members]);
  const assigneePreview = useMemo(() => {
    const names = task.assigneeIds
      .map((id) => members.find((member) => member.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    if (!names.length) return "담당 미지정";
    if (names.length === 1) return names[0];
    return `${names[0]} +${names.length - 1}`;
  }, [members, task.assigneeIds]);
  const nextActions = decisionActions(decisionState, canApprove);
  const decisionTitle = (action: { decisionType: DecisionType; title: string }) =>
    action.decisionType === "APPROVE" && approvalModeHint === "CONSENSUS" ? "합의" : action.title;
  const transitionGateTargets = useMemo(() => {
    const transitions = task.template?.workflowSchema?.transitions ?? [];
    const fromStatusId = LEGACY_STATE_TO_STATUS_ID[decisionState];
    const targets = new Map<string, { hasPolicy: boolean }>();
    transitions.forEach((row) => {
      const gate = row.onExit?.approvalGate;
      if (row.fromStatusId !== fromStatusId || !gate?.enabled) return;
      targets.set(row.toStatusId, { hasPolicy: Boolean(gate.policyId) });
    });
    return targets;
  }, [decisionState, task.template?.workflowSchema?.transitions]);

  useEffect(() => {
    setDecisionState(task.currentState);
  }, [task.currentState, task.id]);
  useEffect(() => {
    setSelectedChildId("");
  }, [task.id]);

  useEffect(() => {
    if (!shareOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!shareRef.current?.contains(event.target as Node)) setShareOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [shareOpen]);
  useEffect(() => {
    if (!nextActionOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!nextActionRef.current?.contains(event.target as Node)) setNextActionOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [nextActionOpen]);
  useEffect(() => {
    if (!typeOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!typeRef.current?.contains(event.target as Node)) setTypeOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [typeOpen]);
  useEffect(() => {
    if (!moreMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) setMoreMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [moreMenuOpen]);

  return (
    <section className="task-system-grid">
      <div className="task-system-head">
        <div className="task-system-head-inline">
          <PanelTitle title="시스템" />
          <button
            type="button"
            className="system-collapse-toggle"
            aria-label={systemCollapsed ? "시스템 필드 펼치기" : "시스템 필드 접기"}
            onClick={() => setSystemCollapsed((prev) => !prev)}
          >
            <i className={systemCollapsed ? "collapsed" : ""}>▾</i>
          </button>
        </div>
        {saving && <span className="save-indicator">저장 중</span>}
      </div>
      {error && <p className="form-error">{error}</p>}
      {systemCollapsed ? null : (
        <>
      <div className="task-system-top-row">
        <MetaWithHint label="템플릿" hint="작성 스키마를 정합니다. 필드 구조와 검토 기준, 워크플로우 규칙의 기준점입니다.">
          <div className="template-inline-tools">
            <Select
              tone="inline"
              value={task.templateId ?? ""}
              onChange={requestTemplateChange}
              options={templateSelectorOptions}
              disabled={!canEditTask}
            />
          </div>
        </MetaWithHint>
        <MetaWithHint label="타입" hint="태스크의 의미 분류입니다. VISION/AXIS/OBJECTIVE/KEYRESULT/TASK 중 성격을 나타냅니다.">
          <div className="next-action-wrap" ref={typeRef}>
            <button
              className="state-action-trigger"
              disabled={!canEditTask}
              title={canEditTask ? "타입 선택" : "타입 수정 권한이 없습니다."}
              onClick={() => setTypeOpen((prev) => !prev)}
            >
              <Badge tone={templateTone(task.templateType)}>{templateLabel(task.templateType)}</Badge>
              <i>{typeOpen ? "▴" : "▾"}</i>
            </button>
            {typeOpen && (
              <div className="next-action-menu">
                {templateTypes
                  .filter((value): value is TemplateType => value !== "ALL")
                  .map((value) => (
                  <button
                    key={value}
                    className={`next-action-item ${task.templateType === value ? "active" : ""}`}
                    onClick={() => {
                      void patchTask("templateType", { templateType: value });
                      setTypeOpen(false);
                    }}
                  >
                    <strong><Badge tone={TEMPLATE_META[value].tone}>{TEMPLATE_META[value].label}</Badge></strong>
                  </button>
                  ))}
              </div>
            )}
          </div>
        </MetaWithHint>
        <MetaWithHint label="상위 항목" hint="현재 태스크가 속한 부모를 지정합니다. 구조상 소속과 컨텍스트를 결정합니다.">
          <Select
            tone="inline"
            value={task.parentId ?? ""}
            onChange={(value) => void patchTask("parent", { parentId: value || null })}
            options={[["", "루트"], ...referenceableTasks.filter((row) => row.id !== task.id).map((row) => [row.id, row.title] as [string, string])]}
            disabled={!canEditTask}
          />
        </MetaWithHint>
        <MetaWithHint label="하위 항목" hint="현재 태스크가 포함하는 자식 목록입니다. 선택하면 해당 하위 태스크로 이동합니다.">
          <Select
            tone="inline"
            value={selectedChildId}
            onChange={(value) => {
              setSelectedChildId(value);
              if (value) go(`/tasks/${value}`);
            }}
            options={[
              ["", children.length ? "하위 항목 보기" : "하위 항목 없음"],
              ...children.map((row) => [row.id, row.title] as [string, string])
            ]}
            disabled={!children.length}
          />
        </MetaWithHint>
      </div>
      <Meta label="상태">
        <div className="next-action-wrap" ref={nextActionRef}>
          <button
            className="state-action-trigger"
            disabled={!canEditTask}
            title={canEditTask ? "상태 및 다음 액션" : "상태 수정 권한이 없습니다."}
            onClick={() => setNextActionOpen((prev) => !prev)}
          >
            <Badge tone={STATE_META[decisionState].tone}>{STATE_META[decisionState].label}</Badge>
            <i>{nextActionOpen ? "▴" : "▾"}</i>
          </button>
          {nextActionOpen && (
            <div className="next-action-menu">
              <div className="next-action-head">상태</div>
              {(["DRAFT", "IN_PROGRESS", "DONE", "CANCELED"] as TaskState[]).map((state) => (
                <button
                  key={state}
                  className={`next-action-item ${decisionState === state ? "active" : ""}`}
                  onClick={() => setDecisionState(state)}
                >
                  <strong>{STATE_META[state].label}</strong>
                  {transitionGateTargets.has(LEGACY_STATE_TO_STATUS_ID[state]) && (
                    <small>{transitionGateTargets.get(LEGACY_STATE_TO_STATUS_ID[state])?.hasPolicy ? "승인게이트 · 정책연결" : "승인게이트 · 정책미지정"}</small>
                  )}
                </button>
              ))}
              <div className="next-action-head">넥스트 액션</div>
              {nextActions.length === 0 && <p className="muted">선택한 상태에서 가능한 액션이 없습니다.</p>}
              {nextActions.map((action) => (
                <button
                  key={`${action.toState}-${action.title}`}
                  className={`next-action-item tone-${action.tone}`}
                  onClick={() => {
                    onOpenDecision({ ...action, title: decisionTitle(action) });
                    setNextActionOpen(false);
                  }}
                >
                  <strong>{decisionTitle(action)}</strong>
                  <small>
                    {STATE_META[action.toState].label}로 전환
                    {transitionGateTargets.has(LEGACY_STATE_TO_STATUS_ID[action.toState])
                      ? ` · ${transitionGateTargets.get(LEGACY_STATE_TO_STATUS_ID[action.toState])?.hasPolicy ? "승인게이트(정책연결)" : "승인게이트(정책미지정)"}`
                      : ""}
                  </small>
                </button>
              ))}
            </div>
          )}
        </div>
      </Meta>
      <Meta label="담당자/공유">
        <div className="member-share-block" ref={shareRef}>
          <button
            type="button"
            className="member-share-trigger"
            disabled={!canEditTask}
            title={canEditTask ? "담당자/공유 수정" : "담당자/공유 수정 권한이 없습니다."}
            onClick={() => setShareOpen((prev) => !prev)}
            aria-haspopup="dialog"
            aria-expanded={shareOpen}
          >
            <span className="member-share-trigger-value">{assigneePreview}</span>
            <i>{shareOpen ? "▴" : "▾"}</i>
          </button>
          {shareOpen && (
            <div className="member-share-popover">
              <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="이름, 이메일, 조직 검색" disabled={!canEditTask} />
              <div className="member-share-list">
                {groupedMembers.map(([unit, rows]) => (
                  <div key={unit} className="member-share-group">
                    <strong>{unit}</strong>
                    {rows.map((member) => (
                      <div key={member.id} className="member-share-row">
                        <div>
                          <b>{member.name}</b>
                          <small>{member.email}</small>
                        </div>
                        <Select
                          tone="inline"
                          value={taskAccessOf(task, member.id)}
                          onChange={(value) => void updateMemberAccess(member.id, value as TaskAccessLevel)}
                          options={[
                            ["VIEW", "보기"],
                            ["WATCHER", "참관"],
                            ["ASSIGNEE", "담당"]
                          ]}
                          disabled={!canEditTask}
                        />
                      </div>
                    ))}
                  </div>
                ))}
                {!groupedMembers.length && <p className="muted">검색 결과가 없습니다.</p>}
              </div>
            </div>
          )}
        </div>
      </Meta>
      <Meta label="기한">
        <input
          type="date"
          value={task.dueDate?.slice(0, 10) ?? ""}
          onChange={(event) => void patchTask("dueDate", { dueDate: event.target.value || null })}
          disabled={!canEditTask}
          title={canEditTask ? "기한 수정" : "기한 수정 권한이 없습니다."}
        />
      </Meta>
      <Meta label="우선순위">
        <Select
          tone="inline"
          value={task.priority}
          onChange={(priority) => void patchTask("priority", { priority: priority as TaskView["priority"] })}
          options={["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => [value, priorityLabel[value as TaskView["priority"]]])}
          disabled={!canEditTask}
        />
      </Meta>
      <div className="task-tag-full-row">
        <Meta label="태그">
          <div className="task-tag-editor">
            <div className="task-tag-list">
              {task.tags.map((tag) => (
                <button key={tag} type="button" className="task-tag-chip" onClick={() => void removeTag(tag)} disabled={!canEditTask}>
                  {tag} ×
                </button>
              ))}
            </div>
            <div className="template-save-row">
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addTag();
                  }
                }}
                placeholder="태그 입력 후 Enter"
                disabled={!canEditTask}
              />
              <button type="button" className="button secondary" onClick={() => void addTag()} disabled={!canEditTask || !tagInput.trim()}>
                태그 추가
              </button>
            </div>
          </div>
        </Meta>
      </div>
      <div className="task-system-more" ref={moreMenuRef}>
        <button type="button" className="button secondary more-icon-btn" onClick={() => setMoreMenuOpen((prev) => !prev)} aria-label="더보기">
          ⋯
        </button>
        {moreMenuOpen && (
          <div className="next-action-menu">
            <button className="next-action-item" onClick={() => { setTemplateSaveModalOpen(true); setMoreMenuOpen(false); }}>
              <strong>현재 폼을 템플릿으로 저장</strong>
            </button>
            <button className="next-action-item" onClick={() => { setFixedFieldsOpen((prev) => !prev); setMoreMenuOpen(false); }}>
              <strong>{fixedFieldsOpen ? "고정 필드 접기" : "고정 필드 더보기"}</strong>
            </button>
          </div>
        )}
      </div>
      {fixedFieldsOpen && (
        <>
          <Meta label="구조">
            <div className="badge-field-readonly">
              <Badge tone={STRUCTURE_META[task.structureState].tone}>{STRUCTURE_META[task.structureState].label}</Badge>
            </div>
          </Meta>
          <Meta label="소유자">{task.owner.name}</Meta>
          <Meta label="하위 항목">{childrenCount}</Meta>
          <Meta label="노트">{notes.length}</Meta>
          <Meta label="스레드">{comments.length}</Meta>
          <Meta label="파일">{notes.flatMap((note) => note.attachments).length}</Meta>
        </>
      )}
      {templateSaveModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <div>
                <div className="eyebrow">Template</div>
                <h2>새 템플릿 생성</h2>
              </div>
            </div>
            <div className="template-save-row">
              <input
                autoFocus
                value={templateSaveName}
                onChange={(event) => setTemplateSaveName(event.target.value)}
                placeholder="재사용할 템플릿 이름 (비우면 태스크 제목 사용)"
                disabled={templateSaveBusy}
              />
            </div>
            <div className="row-actions">
              <button className="button secondary" onClick={() => setTemplateSaveModalOpen(false)} disabled={templateSaveBusy}>취소</button>
              <button className="button primary" onClick={() => void saveAsTemplate()} disabled={templateSaveBusy}>
                {templateSaveBusy ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
      {templateDiffModalOpen && pendingTemplate && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <div>
                <div className="eyebrow">Template Diff</div>
                <h2>템플릿 교체 전 미리보기</h2>
              </div>
            </div>
            <p className="muted">
              `{task.template?.name ?? "현재 템플릿"}`에서 `{pendingTemplate.name}`로 교체합니다. 적용 전에 변경 항목을 확인하세요.
            </p>
            <div className="panel-box">
              <strong>유지 ({templateChangePreview.keep.length})</strong>
              <p className="muted">{templateChangePreview.keep.length ? templateChangePreview.keep.join(", ") : "유지되는 필드가 없습니다."}</p>
            </div>
            <div className="panel-box">
              <strong>추가 ({templateChangePreview.add.length})</strong>
              <p className="muted">{templateChangePreview.add.length ? templateChangePreview.add.join(", ") : "새로 추가되는 필드가 없습니다."}</p>
            </div>
            <div className="panel-box">
              <strong>검토 필요 ({templateChangePreview.review.length})</strong>
              <p className="muted">
                {templateChangePreview.review.length
                  ? `${templateChangePreview.review.join(", ")} 항목은 새 템플릿 스키마 밖 데이터이므로 값 유지 여부를 확인하세요.`
                  : "검토가 필요한 기존 필드는 없습니다."}
              </p>
            </div>
            <div className="panel-box">
              <strong>예상 영향</strong>
              <p className="muted">{templateChangePreview.statusImpact}</p>
              <p className="muted">{templateChangePreview.policyImpact}</p>
            </div>
            <div className="row-actions">
              <button className="button secondary" onClick={closeTemplateDiffModal} disabled={saving === "template"}>취소</button>
              <button className="button primary" onClick={() => void confirmTemplateChange()} disabled={saving === "template"}>
                {saving === "template" ? "적용 중..." : "교체 적용"}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </section>
  );
}

function NotesSection({
  taskId,
  notes,
  attachments,
  members,
  onReload
}: {
  taskId: string;
  notes: Note[];
  attachments: TaskAttachment[];
  members: Member[];
  onReload: () => Promise<void>;
}) {
  const [open, setOpen] = useState<Set<string>>(() => {
    const stored = window.localStorage.getItem(`task-notes-open:${taskId}`);
    if (stored) return new Set(stored.split(",").filter(Boolean));
    return new Set(notes.map((note) => note.id));
  });
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const attachmentsById = useMemo(() => new Map(attachments.map((attachment) => [attachment.id, attachment])), [attachments]);

  useEffect(() => {
    window.localStorage.setItem(`task-notes-open:${taskId}`, [...open].join(","));
  }, [open, taskId]);

  const createNote = async () => {
    if (!title.trim()) {
      setError("노트 제목이 필요합니다. 제목을 입력하면 생성할 수 있습니다.");
      return;
    }
    try {
      setCreating(true);
      setError(null);
      await request(`/api/tasks/${taskId}/notes`, { method: "POST", body: JSON.stringify({ title, content, tags }) });
      setTitle("");
      setContent("");
      setTags([]);
      setTagInput("");
      setCreateOpen(false);
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("노트 생성 실패", "새 노트가 추가되지 않았습니다", "노트 제목과 내용을 확인한 뒤 다시 생성하세요")
      );
    } finally {
      setCreating(false);
    }
  };
  const addCreateTag = () => {
    const value = tagInput.trim();
    if (!value || tags.includes(value)) return;
    setTags((prev) => [...prev, value]);
    setTagInput("");
  };
  const removeCreateTag = (value: string) => setTags((prev) => prev.filter((tag) => tag !== value));

  return (
	    <section className="panel">
	      <PanelHeader title={`노트 (${notes.length})`} action={<button className="button secondary" onClick={() => setCreateOpen((v) => !v)}>{createOpen ? "닫기" : "추가"}</button>} />
	      {error && !createOpen && <p className="form-error">{error}</p>}
	      {createOpen && (
        <div className="note-create">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="노트 제목" maxLength={120} />
          <DescriptionRichEditor
            taskId={taskId}
            value={content}
            onChange={setContent}
            attachmentsById={attachmentsById}
            onReload={onReload}
          />
          <div className="note-tag-editor">
            <div className="task-tag-list">
              {tags.map((tag) => (
                <button key={tag} type="button" className="task-tag-chip" onClick={() => removeCreateTag(tag)}>
                  {tag} ×
                </button>
              ))}
            </div>
            <div className="template-save-row">
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCreateTag();
                  }
                }}
                placeholder="노트 태그 입력 후 Enter (예: 제안, 기준문서반영완료)"
              />
              <button type="button" className="button secondary" onClick={addCreateTag} disabled={!tagInput.trim()}>
                태그 추가
              </button>
            </div>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="row-actions">
            <button className="button secondary" onClick={() => setCreateOpen(false)}>취소</button>
            <button className="button primary" disabled={creating || !title.trim()} onClick={() => void createNote()}>노트 생성</button>
          </div>
        </div>
      )}
      <div className="accordion-list">
        {notes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            taskId={taskId}
            attachmentsById={attachmentsById}
            author={memberName(members, note.lastEditorId)}
            open={open.has(note.id)}
            creating={creating}
            onToggle={() => setOpen((prev) => {
              const next = new Set(prev);
              if (next.has(note.id)) next.delete(note.id);
              else next.add(note.id);
              return next;
            })}
	            onSave={async (patch) => {
	              try {
	                setCreating(true);
	                setError(null);
	                await request(`/api/notes/${note.id}`, { method: "PATCH", body: JSON.stringify(patch) });
	                await onReload();
	              } catch (err) {
	                setError(
                    err instanceof Error
                      ? err.message
                      : formatFailure("노트 저장 실패", "노트 수정사항이 반영되지 않았습니다", "권한과 입력값을 확인한 뒤 다시 저장하세요")
                  );
	              } finally {
	                setCreating(false);
	              }
	            }}
	            onDelete={async () => {
	              if (!window.confirm("이 노트를 삭제할까요? 스레드의 참조도 함께 정리됩니다.")) return;
	              try {
	                setCreating(true);
	                setError(null);
	                await request(`/api/notes/${note.id}`, { method: "DELETE" });
	                await onReload();
	              } catch (err) {
	                setError(
                    err instanceof Error
                      ? err.message
                      : formatFailure("노트 삭제 실패", "대상 노트가 그대로 유지됩니다", "권한과 대상 노트를 확인한 뒤 다시 삭제하세요")
                  );
	              } finally {
	                setCreating(false);
	              }
	            }}
	          />
        ))}
      </div>
    </section>
  );
}

function NoteCard({
  note,
  taskId,
  attachmentsById,
  author,
  open,
  creating,
	  onToggle,
	  onSave,
	  onDelete
	}: {
	  note: Note;
	  taskId: string;
	  attachmentsById: Map<string, TaskAttachment>;
	  author: string;
	  open: boolean;
	  creating: boolean;
	  onToggle: () => void;
	  onSave: (patch: { title?: string; content?: string; tags?: string[] }) => Promise<void>;
	  onDelete: () => Promise<void>;
	}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [tags, setTags] = useState<string[]>(note.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
    setTags(note.tags ?? []);
    setTagInput("");
  }, [note.content, note.title, note.tags]);
  const addTag = () => {
    const value = tagInput.trim();
    if (!value || tags.includes(value)) return;
    setTags((prev) => [...prev, value]);
    setTagInput("");
  };
  const removeTag = (value: string) => setTags((prev) => prev.filter((tag) => tag !== value));
  const previewText = note.content.replace(/\s+/g, " ").trim();
  const copyNoteLink = async () => {
    const url = `${window.location.origin}/tasks/${taskId}?note=${note.id}`;
    try {
      await window.navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="note-card">
      <div className="note-head-wrap">
        <button className="note-head" onClick={onToggle}>
          <div className="note-head-title-row">
            <span>{open ? "−" : "+"}</span>
            <strong>{note.title}</strong>
            <small className="note-head-meta inline">{author} · {elapsed(note.updatedAt)}</small>
          </div>
          {!open && (
          <div className="note-head-summary-row">
            <small className="note-head-preview">{previewText || "내용 없음"}</small>
            <small className="note-head-meta">{author} · {elapsed(note.updatedAt)}</small>
          </div>
          )}
          {note.tags?.length > 0 && (
            <div className="task-tag-list note-tag-list compact">
              {note.tags.map((tag) => <span key={tag} className="task-tag-chip">{tag}</span>)}
            </div>
          )}
        </button>
        <button
          type="button"
          className={`note-share-button ${copied ? "copied" : ""}`}
          title={copied ? "링크 복사됨" : "노트 링크 복사"}
          aria-label="노트 링크 복사"
          onClick={() => void copyNoteLink()}
        >
          {copied ? "✓" : "🔗"}
        </button>
      </div>
      {open && (
        <div className="note-body">
          {editing ? (
            <>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
              <DescriptionRichEditor
                taskId={taskId}
                value={content}
                onChange={setContent}
                attachmentsById={attachmentsById}
                onReload={async () => {}}
              />
              <div className="note-tag-editor">
                <div className="task-tag-list">
                  {tags.map((tag) => (
                    <button key={tag} type="button" className="task-tag-chip" onClick={() => removeTag(tag)}>
                      {tag} ×
                    </button>
                  ))}
                </div>
                <div className="template-save-row">
                  <input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="노트 태그 입력 후 Enter"
                  />
                  <button type="button" className="button secondary" onClick={addTag} disabled={!tagInput.trim()}>
                    태그 추가
                  </button>
                </div>
              </div>
              <div className="row-actions">
                <button className="button secondary" onClick={() => setEditing(false)}>취소</button>
                <button className="button primary" disabled={creating} onClick={() => {
                  void onSave({ title, content, tags }).then(() => setEditing(false));
                }}>저장</button>
              </div>
            </>
          ) : (
            <>
              <div className="markdown-preview">{renderMarkdownBlock(note.content, attachmentsById)}</div>
              {note.attachments.length > 0 && (
                <div className="file-list">
                  {note.attachments.map((file) => <span key={file}>{file}</span>)}
                </div>
              )}
	              <div className="row-actions left">
	                <button className="text-button" onClick={() => setEditing(true)}>노트 수정</button>
	                <button className="text-button danger-text" disabled={creating} onClick={() => void onDelete()}>노트 삭제</button>
	              </div>
	            </>
	          )}
        </div>
      )}
    </div>
  );
}

function ThreadPanel({
  taskId,
  notes,
  tasks,
  comments,
  members,
  me,
  onReload
}: {
  taskId: string;
  notes: Note[];
  tasks: TaskView[];
  comments: ThreadComment[];
  members: Member[];
  me: Member;
  onReload: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [refs, setRefs] = useState<Set<string>>(new Set());
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editRefs, setEditRefs] = useState<Set<string>>(new Set());
  const [editMentions, setEditMentions] = useState<Mention[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!content.trim()) return;
    const mergedContent = title.trim() ? `${title.trim()}\n${content.trim()}` : content.trim();
    try {
      setBusy(true);
      setError(null);
      await request(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: mergedContent, referencedNoteIds: [...refs], mentions })
      });
      setTitle("");
      setContent("");
      setRefs(new Set());
      setMentions([]);
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("스레드 작성 실패", "댓글이 등록되지 않았습니다", "입력 내용과 참조 노트를 확인한 뒤 다시 등록하세요")
      );
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (comment: ThreadComment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
    setEditRefs(new Set(comment.referencedNoteIds));
    setEditMentions(comment.mentions);
  };

  const saveEdit = async (commentId: string) => {
    if (!editContent.trim()) return;
    try {
      setBusy(true);
      setError(null);
      await request(`/api/comments/${commentId}`, {
        method: "PATCH",
        body: JSON.stringify({ content: editContent, referencedNoteIds: [...editRefs], mentions: editMentions })
      });
      setEditingId(null);
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("스레드 수정 실패", "기존 댓글 내용이 유지됩니다", "작성자 또는 관리자 권한을 확인한 뒤 다시 수정하세요")
      );
    } finally {
      setBusy(false);
    }
  };

  const mentionOptions: Mention[] = [
    ...members.map((member) => ({ id: `member-${member.id}`, type: "MEMBER" as const, targetId: member.id, label: member.name })),
    ...tasks.map((task) => ({ id: `task-${task.id}`, type: "TASK" as const, targetId: task.id, label: task.title })),
    ...tasks.flatMap((task) => (task.template?.formDefinition ?? []).map((field) => ({
      id: `field-${task.id}-${field.key}`,
      type: "FORM_FIELD" as const,
      targetId: task.id,
      fieldKey: field.key,
      label: `${task.title}.${field.label}`
    }))),
  ];

  const deleteComment = async (commentId: string) => {
    if (!window.confirm("이 스레드 댓글을 삭제할까요?")) return;
    try {
      setBusy(true);
      setError(null);
      await request(`/api/comments/${commentId}`, { method: "DELETE" });
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("스레드 삭제 실패", "댓글이 그대로 유지됩니다", "작성자 또는 관리자 권한을 확인한 뒤 다시 삭제하세요")
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="thread-panel">
      {error && <p className="form-error">{error}</p>}
      <div className="comment-list">
        {comments.map((comment, index) => {
          const currentDate = new Date(comment.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
          const prev = comments[index - 1];
          const prevDate = prev ? new Date(prev.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" }) : null;
          const showDateDivider = index === 0 || currentDate !== prevDate;
          const canManage = comment.authorId === me.id || me.role === "ADMIN";
          const parsedComment = splitThreadTitleAndBody(comment.content);
          return (
            <div key={comment.id}>
              {showDateDivider && <div className="thread-day-divider"><span>{currentDate}</span></div>}
              <div className="comment">
                <div className="comment-meta">
                  <strong>
                    <span className="comment-author-badge">{memberName(members, comment.authorId).slice(0, 1)}</span>
                    {memberName(members, comment.authorId)}
                  </strong>
                  <span>{elapsed(comment.createdAt)}</span>
                </div>
                {editingId === comment.id ? (
                  <>
                    <MentionComposer
                      value={editContent}
                      onChange={setEditContent}
                      refs={editRefs}
                      onRefsChange={setEditRefs}
                      mentions={editMentions}
                      onMentionsChange={setEditMentions}
                      notes={notes}
                      mentionOptions={mentionOptions}
                      placeholder="댓글을 수정하세요. @ 또는 #으로 대상을 검색합니다."
                    />
                    <div className="row-actions">
                      <button className="button secondary" disabled={busy} onClick={() => setEditingId(null)}>취소</button>
                      <button className="button primary" disabled={busy || !editContent.trim()} onClick={() => void saveEdit(comment.id)}>저장</button>
                    </div>
                  </>
                ) : (
                  <>
                    {parsedComment.title ? (
                      <div className="thread-comment-content">
                        <h4>{parsedComment.title}</h4>
                        <p>{parsedComment.body}</p>
                      </div>
                    ) : (
                      <p>{comment.content}</p>
                    )}
                    {comment.referencedNoteIds.length > 0 && (
                      <div className="ref-list">
                        {comment.referencedNoteIds.map((id) => <span key={id}>#{notes.find((note) => note.id === id)?.title ?? "노트"}</span>)}
                      </div>
                    )}
                    {comment.mentions.length > 0 && (
                      <div className="ref-list mention-list">
                        {comment.mentions.map((mention) => <span key={mention.id}>{mention.type === "NOTE" ? "#" : "@"}{mention.label}</span>)}
                      </div>
                    )}
                    {canManage && (
                      <div className="row-actions left">
                        <button className="text-button" disabled={busy} onClick={() => startEdit(comment)}>수정</button>
                        <button className="text-button danger-text" disabled={busy} onClick={() => void deleteComment(comment.id)}>삭제</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="composer">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="제목 (선택, 최대 200자)"
          maxLength={200}
        />
        <MentionComposer
          value={content}
          onChange={setContent}
          refs={refs}
          onRefsChange={setRefs}
          mentions={mentions}
          onMentionsChange={setMentions}
          notes={notes}
          mentionOptions={mentionOptions}
          placeholder="댓글을 작성하세요. @사람·노드·필드, #노트를 검색합니다."
        />
        <button className="button primary full" disabled={busy || !content.trim()} onClick={() => void submit()}>댓글 작성</button>
      </div>
    </aside>
  );
}

function mentionKey(mention: Mention) {
  return `${mention.type}-${mention.targetId}-${mention.fieldKey ?? ""}`;
}

function splitThreadTitleAndBody(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  const [firstLine, ...rest] = normalized.split("\n");
  const titleCandidate = firstLine.trim();
  if (!rest.length || !titleCandidate || titleCandidate.length > 200) {
    return { title: null as string | null, body: normalized };
  }
  const body = rest.join("\n").trim();
  if (!body) return { title: null as string | null, body: normalized };
  return { title: titleCandidate, body };
}

function renderMarkdownInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|_([^_]+)_)/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2] && match[3]) {
      nodes.push(<a key={`md-link-${key++}`} href={match[3]} target="_blank" rel="noreferrer">{match[2]}</a>);
    } else if (match[4]) {
      nodes.push(<code key={`md-code-${key++}`}>{match[4]}</code>);
    } else if (match[5]) {
      nodes.push(<strong key={`md-strong-${key++}`}>{match[5]}</strong>);
    } else if (match[6]) {
      nodes.push(<em key={`md-em-${key++}`}>{match[6]}</em>);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length ? nodes : [text];
}

function resolveAttachmentSource(raw: string, attachmentsById: Map<string, TaskAttachment>) {
  if (!raw.startsWith("attachment://")) return raw;
  const attachmentId = raw.slice("attachment://".length);
  const attachment = attachmentsById.get(attachmentId);
  if (!attachment) return "";
  return attachment.kind === "FILE" ? attachment.contentDataUrl ?? "" : attachment.url ?? "";
}

function renderMarkdownBlock(value: string, attachmentsById: Map<string, TaskAttachment>) {
  const lines = value.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let orderedItems: string[] = [];
  let checkItems: Array<{ checked: boolean; text: string }> = [];
  let codeLines: string[] = [];
  let inCodeBlock = false;

  const flushLists = (seed: number) => {
    let nextSeed = seed;
    if (listItems.length) {
      blocks.push(
        <ul key={`md-ul-${nextSeed++}`}>
          {listItems.map((item, index) => <li key={`md-ul-item-${index}`}>{renderMarkdownInline(item)}</li>)}
        </ul>
      );
      listItems = [];
    }
    if (orderedItems.length) {
      blocks.push(
        <ol key={`md-ol-${nextSeed++}`}>
          {orderedItems.map((item, index) => <li key={`md-ol-item-${index}`}>{renderMarkdownInline(item)}</li>)}
        </ol>
      );
      orderedItems = [];
    }
    if (checkItems.length) {
      blocks.push(
        <ul className="md-check-list" key={`md-check-${nextSeed++}`}>
          {checkItems.map((item, index) => (
            <li key={`md-check-item-${index}`}>
              <input type="checkbox" checked={item.checked} readOnly />
              <span>{renderMarkdownInline(item.text)}</span>
            </li>
          ))}
        </ul>
      );
      checkItems = [];
    }
    return nextSeed;
  };

  let blockKey = 0;
  lines.forEach((line) => {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    const check = line.match(/^\s*-\s+\[( |x|X)\]\s+(.+)$/);
    const quote = line.match(/^\s*>\s+(.+)$/);
    const fenced = line.trim() === "```";
    if (fenced) {
      blockKey = flushLists(blockKey);
      if (inCodeBlock) {
        blocks.push(<pre key={`md-pre-${blockKey++}`}><code>{codeLines.join("\n")}</code></pre>);
        codeLines = [];
      }
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      return;
    }
    if (check) {
      checkItems.push({ checked: check[1].toLowerCase() === "x", text: check[2] });
      return;
    }
    if (bullet) {
      listItems.push(bullet[1]);
      return;
    }
    if (ordered) {
      orderedItems.push(ordered[1]);
      return;
    }
    blockKey = flushLists(blockKey);
    if (!line.trim()) {
      blocks.push(<div key={`md-space-${blockKey++}`} className="md-space" />);
      return;
    }
    if (heading) {
      const content = renderMarkdownInline(heading[2]);
      if (heading[1].length === 1) blocks.push(<h3 key={`md-h1-${blockKey++}`}>{content}</h3>);
      else if (heading[1].length === 2) blocks.push(<h4 key={`md-h2-${blockKey++}`}>{content}</h4>);
      else blocks.push(<h5 key={`md-h3-${blockKey++}`}>{content}</h5>);
      return;
    }
    if (image) {
      const src = resolveAttachmentSource(image[2], attachmentsById);
      if (src) {
        blocks.push(
          <figure key={`md-image-${blockKey++}`} className="markdown-image">
            <img src={src} alt={image[1] || "붙여넣은 이미지"} />
            {image[1] ? <figcaption>{image[1]}</figcaption> : null}
          </figure>
        );
      } else {
        blocks.push(<p key={`md-image-missing-${blockKey++}`} className="muted">첨부 이미지를 찾을 수 없습니다.</p>);
      }
      return;
    }
    if (quote) {
      blocks.push(<blockquote key={`md-quote-${blockKey++}`}>{renderMarkdownInline(quote[1])}</blockquote>);
      return;
    }
    blocks.push(<p key={`md-p-${blockKey++}`}>{renderMarkdownInline(line)}</p>);
  });
  blockKey = flushLists(blockKey);
  if (codeLines.length) blocks.push(<pre key={`md-pre-last-${blockKey++}`}><code>{codeLines.join("\n")}</code></pre>);
  return blocks.length ? blocks : [<p key="md-empty">내용이 없습니다.</p>];
}

function DescriptionRichEditor({
  taskId,
  value,
  onChange,
  attachmentsById,
  onReload
}: {
  taskId: string;
  value: string;
  onChange: (value: string) => void;
  attachmentsById: Map<string, TaskAttachment>;
  onReload: () => Promise<void>;
}) {
  const [preview, setPreview] = useState(false);
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const wrapSelection = (prefix: string, suffix = prefix, placeholder = "텍스트") => {
    const textarea = editorRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = value.slice(start, end) || placeholder;
    const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
    onChange(next);
    window.setTimeout(() => {
      textarea.focus();
      const cursorStart = start + prefix.length;
      textarea.setSelectionRange(cursorStart, cursorStart + selected.length);
    }, 0);
  };

  const insertLinePrefix = (prefix: string, placeholder: string) => {
    const textarea = editorRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = value.slice(start, end) || placeholder;
    const transformed = selected
      .split("\n")
      .map((line) => line.trim() ? `${prefix}${line}` : prefix.trimEnd())
      .join("\n");
    const next = `${value.slice(0, start)}${transformed}${value.slice(end)}`;
    onChange(next);
    window.setTimeout(() => textarea.focus(), 0);
  };

  const uploadPastedImages = async (files: File[]) => {
    if (!files.length) return;
    try {
      setPasteBusy(true);
      setPasteError(null);
      const snippets: string[] = [];
      for (const file of files) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("클립보드 이미지 읽기에 실패했습니다."));
          reader.readAsDataURL(file);
        });
        const attachment = await request<TaskAttachment>(`/api/tasks/${taskId}/attachments/file`, {
          method: "POST",
          body: JSON.stringify({
            name: file.name || `pasted-image-${Date.now()}.png`,
            mimeType: file.type || "image/png",
            size: file.size,
            contentDataUrl: dataUrl
          })
        });
        snippets.push(`![${attachment.name}](attachment://${attachment.id})`);
      }
      const next = `${value}${value.endsWith("\n") || !value ? "" : "\n"}${snippets.join("\n")}`;
      onChange(next);
      await onReload();
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : "클립보드 이미지 첨부에 실패했습니다.");
    } finally {
      setPasteBusy(false);
    }
  };

  const onPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData.items ?? []);
    const imageFiles = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!imageFiles.length) return;
    event.preventDefault();
    void uploadPastedImages(imageFiles);
  };

  return (
    <div className="description-rich-editor">
      <div className="description-editor-toolbar">
        <button type="button" className="text-button" onClick={() => wrapSelection("**")} title="굵게 (Ctrl/Cmd+B)">B</button>
        <button type="button" className="text-button" onClick={() => wrapSelection("_")} title="기울임">I</button>
        <button type="button" className="text-button" onClick={() => wrapSelection("`")} title="인라인 코드">{"</>"}</button>
        <button type="button" className="text-button" onClick={() => insertLinePrefix("# ", "제목")} title="제목">H</button>
        <button type="button" className="text-button" onClick={() => insertLinePrefix("- ", "리스트 항목")} title="불릿 리스트">•</button>
        <button type="button" className="text-button" onClick={() => insertLinePrefix("- [ ] ", "체크 항목")} title="체크리스트">☑</button>
        <button type="button" className="text-button" onClick={() => insertLinePrefix("> ", "인용문")} title="인용">❝</button>
        <button type="button" className="text-button" onClick={() => wrapSelection("[", "](https://)", "링크 텍스트")} title="링크">🔗</button>
        <button type="button" className={`text-button ${preview ? "active" : ""}`} onClick={() => setPreview((prev) => !prev)}>
          {preview ? "편집" : "미리보기"}
        </button>
      </div>
      {pasteBusy && <p className="muted">클립보드 이미지를 첨부하는 중입니다...</p>}
      {pasteError && <p className="form-error">{pasteError}</p>}
      {preview ? (
        <div className="markdown-preview">{renderMarkdownBlock(value, attachmentsById)}</div>
      ) : (
        <textarea
          ref={editorRef}
          value={value}
          placeholder="핵심 맥락과 배경을 구조적으로 작성하세요. (Markdown 지원)"
          maxLength={1200}
          rows={10}
          className="rich-text-field markdown-input"
          onChange={(event) => onChange(event.target.value)}
          onPaste={onPaste}
        />
      )}
    </div>
  );
}

type FreeformBlockType = "TEXT" | "LONG_TEXT" | "CHECKLIST" | "QUOTE" | "NUMBER";

const FREEFORM_BLOCK_TYPES: Array<{ type: FreeformBlockType; label: string; placeholder: string; multiline?: boolean }> = [
  { type: "TEXT", label: "텍스트", placeholder: "한 줄 텍스트" },
  { type: "LONG_TEXT", label: "긴 글", placeholder: "여러 줄 설명", multiline: true },
  { type: "CHECKLIST", label: "체크리스트", placeholder: "- [ ] 할 일", multiline: true },
  { type: "QUOTE", label: "인용", placeholder: "> 인용 문장", multiline: true },
  { type: "NUMBER", label: "숫자", placeholder: "숫자 값" }
];

function freeformBlockMeta(key: string) {
  if (key.startsWith("blk:")) {
    const [, typeRaw, idRaw] = key.split(":");
    const type = (typeRaw as FreeformBlockType) || "TEXT";
    const spec = FREEFORM_BLOCK_TYPES.find((row) => row.type === type) ?? FREEFORM_BLOCK_TYPES[0];
    return { type: spec.type, label: spec.label, id: idRaw || key };
  }
  return { type: "TEXT" as FreeformBlockType, label: key, id: key };
}

function MentionComposer({
  value,
  onChange,
  refs,
  onRefsChange,
  mentions,
  onMentionsChange,
  notes,
  mentionOptions,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  refs: Set<string>;
  onRefsChange: (refs: Set<string>) => void;
  mentions: Mention[];
  onMentionsChange: (mentions: Mention[]) => void;
  notes: Note[];
  mentionOptions: Mention[];
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const command = value.match(/(^|\s)([@#])([^\s@#]*)$/);
  const commandType = command?.[2] as "@" | "#" | undefined;
  const query = command?.[3]?.toLowerCase() ?? "";
  const noteOptions = notes
    .filter((note) => note.title.toLowerCase().includes(query) || note.content.toLowerCase().includes(query))
    .slice(0, 6);
  const atOptions = mentionOptions
    .filter((mention) => mention.label.toLowerCase().includes(query))
    .slice(0, 6);
  const selectedNotes = notes.filter((note) => refs.has(note.id));

  const extractSharedNoteIds = (text: string) => {
    const noteIds = new Set<string>();
    const queryMatches = text.matchAll(/[?&]note=([a-zA-Z0-9-]+)/g);
    for (const match of queryMatches) {
      if (match[1]) noteIds.add(match[1]);
    }
    const hashMatches = text.matchAll(/#note=([a-zA-Z0-9-]+)/g);
    for (const match of hashMatches) {
      if (match[1]) noteIds.add(match[1]);
    }
    return [...noteIds];
  };

  const replaceCommand = (token: string) => {
    const next = command ? `${value.slice(0, command.index ?? 0)}${command[1]}${token} ` : `${value}${token} `;
    onChange(next);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const selectNote = (note: Note) => {
    onRefsChange(new Set([...refs, note.id]));
    replaceCommand(`#${note.title}`);
  };

  const selectMention = (mention: Mention) => {
    if (!mentions.some((row) => mentionKey(row) === mentionKey(mention))) {
      onMentionsChange([...mentions, mention]);
    }
    replaceCommand(`@${mention.label}`);
  };

  const removeNote = (noteId: string) => {
    const next = new Set(refs);
    next.delete(noteId);
    onRefsChange(next);
  };

  const removeMention = (target: Mention) => {
    onMentionsChange(mentions.filter((mention) => mentionKey(mention) !== mentionKey(target)));
  };
  const onPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData("text");
    if (!pasted) return;
    const matchedIds = extractSharedNoteIds(pasted);
    if (!matchedIds.length) return;
    const matchedNotes = matchedIds
      .map((id) => notes.find((note) => note.id === id))
      .filter((note): note is Note => Boolean(note));
    if (!matchedNotes.length) return;
    event.preventDefault();
    const nextRefs = new Set(refs);
    matchedNotes.forEach((note) => nextRefs.add(note.id));
    onRefsChange(nextRefs);
    const tokens = matchedNotes.map((note) => `#${note.title}`).join(" ");
    const nextValue = `${value}${value && !value.endsWith(" ") ? " " : ""}${tokens} `;
    onChange(nextValue);
  };

  return (
    <div className="mention-composer">
      <textarea ref={textareaRef} value={value} onChange={(event) => onChange(event.target.value)} onPaste={onPaste} rows={4} maxLength={2000} placeholder={placeholder} />
      {commandType && (
        <div className="mention-command-menu">
          <div className="mention-command-head">
            <strong>{commandType === "@" ? "대상 멘션" : "노트 참조"}</strong>
            <span>{commandType}{query || "검색"}</span>
          </div>
          {commandType === "#"
            ? noteOptions.map((note) => (
              <button key={note.id} onClick={() => selectNote(note)}>
                <strong>{note.title}</strong>
                <small>{shortText(note.content, 56)}</small>
              </button>
            ))
            : atOptions.map((mention) => (
              <button key={mentionKey(mention)} onClick={() => selectMention(mention)}>
                <strong>{mention.label}</strong>
                <small>{mention.type === "MEMBER" ? "사람" : mention.type === "TASK" ? "결정 노드" : "Form 필드"}</small>
              </button>
            ))}
          {((commandType === "#" && !noteOptions.length) || (commandType === "@" && !atOptions.length)) && <p className="muted">검색 결과가 없습니다.</p>}
        </div>
      )}
      {(selectedNotes.length > 0 || mentions.length > 0) && (
        <div className="selected-mentions">
          {selectedNotes.map((note) => <button key={note.id} onClick={() => removeNote(note.id)}>#{note.title} ×</button>)}
          {mentions.map((mention) => <button key={mentionKey(mention)} onClick={() => removeMention(mention)}>@{mention.label} ×</button>)}
        </div>
      )}
    </div>
  );
}

function FormOutput({
  task,
  attachments,
  canEditForm,
  onReload
}: {
  task: TaskView;
  attachments: TaskAttachment[];
  canEditForm: boolean;
  onReload: () => Promise<void>;
}) {
  const fields = (task.template?.formDefinition ?? []).filter((field) => field.type !== "FILE");
  const isFreeformForm = fields.length === 0;
  const attachmentsById = useMemo(() => new Map(attachments.map((attachment) => [attachment.id, attachment])), [attachments]);
  const entries = [
    [TASK_DESCRIPTION_FIELD_KEY, task.description ?? ""] as [string, string],
    ...(fields.length
      ? fields.map((field) => [field.key, task.formValues[field.key] ?? ""] as [string, string])
      : Object.entries(task.formValues))
  ];
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => entries.length ? entries : [["", ""]]);
  const [error, setError] = useState<string | null>(null);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);

  useEffect(() => {
    const nextEntries = [
      [TASK_DESCRIPTION_FIELD_KEY, task.description ?? ""] as [string, string],
      ...(fields.length
        ? fields.map((field) => [field.key, task.formValues[field.key] ?? ""] as [string, string])
        : Object.entries(task.formValues))
    ];
    setRows(nextEntries.length ? nextEntries : [["", ""]]);
  }, [task.description, task.formValues, task.templateId]);

  const save = async () => {
    if (!canEditForm) {
      setError("양식 수정 권한이 없습니다. 소유자, 담당자 또는 관리자에게 권한을 요청하세요.");
      return;
    }
    const descriptionValue = rows.find(([key]) => key === TASK_DESCRIPTION_FIELD_KEY)?.[1] ?? "";
    const next = Object.fromEntries(
      rows
        .filter(([key]) => key !== TASK_DESCRIPTION_FIELD_KEY && key.trim())
        .map(([key, value]) => [key.trim(), value.trim()])
    );
    try {
      setError(null);
      await request(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ formValues: next, description: descriptionValue.trim() }) });
      setEditing(false);
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("양식 산출물 저장 실패", "산출물 값이 반영되지 않았습니다", "입력값을 확인한 뒤 다시 저장하세요")
      );
    }
  };

  const addFreeformBlock = (type: FreeformBlockType) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const key = `blk:${type}:${id}`;
    setRows((prev) => [...prev, [key, ""]]);
    setBlockMenuOpen(false);
  };

  return (
    <section className="panel">
      <PanelHeader
        title="양식 산출물"
        action={
          <button
            className="button secondary"
            disabled={!canEditForm}
            title={canEditForm ? "양식 산출물 수정" : "수정 불가: 소유자, 담당자 또는 관리자만 양식을 수정할 수 있습니다."}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "닫기" : "수정"}
          </button>
        }
      />
      {editing ? (
        <div className="form-output-editor">
          {rows.map(([key, value], index) => {
            const field = fields.find((row) => row.key === key);
            const blockMeta = freeformBlockMeta(key);
            return (
              <div className={`form-output-row ${isFreeformForm && key !== TASK_DESCRIPTION_FIELD_KEY ? "freeform-block-row" : ""}`} key={`${key}-${index}`}>
                {key === TASK_DESCRIPTION_FIELD_KEY ? (
                  <>
                    <input value={key} placeholder="태스크 설명" maxLength={80} readOnly />
                    <DescriptionRichEditor
                      taskId={task.id}
                      value={value}
                      onChange={(nextValue) => setRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? [row[0], nextValue] : row))}
                      attachmentsById={attachmentsById}
                      onReload={onReload}
                    />
                  </>
                ) : isFreeformForm ? (
                  <>
                    <div className="freeform-block-head">
                      <small>{blockMeta.label} 블록</small>
                      <button className="text-button danger-text" onClick={() => setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}>삭제</button>
                    </div>
                    {(blockMeta.type === "LONG_TEXT" || blockMeta.type === "CHECKLIST" || blockMeta.type === "QUOTE") ? (
                      <textarea
                        value={value}
                        placeholder={FREEFORM_BLOCK_TYPES.find((row) => row.type === blockMeta.type)?.placeholder ?? "값"}
                        maxLength={2000}
                        rows={blockMeta.type === "LONG_TEXT" ? 4 : 3}
                        onChange={(event) => setRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? [row[0], event.target.value] : row))}
                      />
                    ) : (
                      <input
                        value={value}
                        placeholder={FREEFORM_BLOCK_TYPES.find((row) => row.type === blockMeta.type)?.placeholder ?? "값"}
                        maxLength={1000}
                        inputMode={blockMeta.type === "NUMBER" ? "decimal" : undefined}
                        onChange={(event) => setRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? [row[0], event.target.value] : row))}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <input
                      value={key}
                      placeholder={field?.label ?? "필드"}
                      maxLength={80}
                      readOnly={Boolean(field)}
                      onChange={(event) => setRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? [event.target.value, row[1]] : row))}
                    />
                    {field?.type === "LONG_TEXT" ? (
                      <textarea
                        value={value}
                        placeholder={field?.helpText ?? "값"}
                        maxLength={1000}
                        rows={3}
                        onChange={(event) => setRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? [row[0], event.target.value] : row))}
                      />
                    ) : (
                      <input
                        value={value}
                        placeholder={field?.helpText ?? "값"}
                        maxLength={1000}
                        onChange={(event) => setRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? [row[0], event.target.value] : row))}
                      />
                    )}
                    {!field && <button className="button secondary" onClick={() => setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}>삭제</button>}
                  </>
                )}
              </div>
            );
          })}
          {error && <p className="form-error">{error}</p>}
          <div className="row-actions">
            {isFreeformForm && (
              <div className="freeform-block-add-wrap">
                <button className="freeform-block-add-button" type="button" onClick={() => setBlockMenuOpen((prev) => !prev)}>
                  + 블록 추가
                </button>
                {blockMenuOpen && (
                  <div className="freeform-block-menu">
                    {FREEFORM_BLOCK_TYPES.map((spec) => (
                      <button key={spec.type} type="button" onClick={() => addFreeformBlock(spec.type)}>
                        <strong>{spec.label}</strong>
                        <small>{spec.placeholder}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button className="button primary" onClick={() => void save()}>산출물 저장</button>
          </div>
        </div>
      ) : (
        <div className="kv-grid">
          {entries.length ? entries.map(([key, value]) => (
            <div key={key}>
              <small>{key === TASK_DESCRIPTION_FIELD_KEY ? "태스크 설명" : (isFreeformForm ? freeformBlockMeta(key).label : fields.find((field) => field.key === key)?.label ?? key)}</small>
              {key === TASK_DESCRIPTION_FIELD_KEY ? (
                <div className="rich-text-preview markdown-preview">{renderMarkdownBlock(value, attachmentsById)}</div>
              ) : (
                <strong>{value}</strong>
              )}
            </div>
          )) : <p className="muted">입력된 양식 값이 없습니다</p>}
        </div>
      )}
      {task.template?.inspectionCriteria.length ? (
        <div className="criteria-list">
          {task.template.inspectionCriteria.map((criterion) => <span key={criterion}>{criterion}</span>)}
        </div>
      ) : null}
    </section>
  );
}

function AttachmentsSection({
  taskId,
  attachments,
  canEdit,
  onReload
}: {
  taskId: string;
  attachments: TaskAttachment[];
  canEdit: boolean;
  onReload: () => Promise<void>;
}) {
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      setBusy(true);
      setError(null);
      for (const file of Array.from(files)) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("파일 읽기에 실패했습니다."));
          reader.readAsDataURL(file);
        });
        await request(`/api/tasks/${taskId}/attachments/file`, {
          method: "POST",
          body: JSON.stringify({
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            contentDataUrl: dataUrl
          })
        });
      }
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일 업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const addLink = async () => {
    if (!linkUrl.trim() || !linkName.trim()) return;
    try {
      setBusy(true);
      setError(null);
      await request(`/api/tasks/${taskId}/attachments/link`, {
        method: "POST",
        body: JSON.stringify({ name: linkName.trim(), url: linkUrl.trim() })
      });
      setLinkName("");
      setLinkUrl("");
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "링크 첨부에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const removeAttachment = async (attachmentId: string) => {
    try {
      setBusy(true);
      setError(null);
      await request(`/api/tasks/${taskId}/attachments/${attachmentId}`, { method: "DELETE" });
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "첨부 삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <PanelHeader title={`Attachments ${attachments.length}`} />
      {canEdit && (
        <div className="attachments-tools">
          <label className="button secondary">
            파일 업로드
            <input
              type="file"
              multiple
              onChange={(event) => void uploadFiles(event.target.files)}
              disabled={busy}
              hidden
            />
          </label>
          <input value={linkName} onChange={(event) => setLinkName(event.target.value)} placeholder="링크 이름 (예: Git PR, SharePoint 문서)" />
          <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://..." />
          <button className="button secondary" onClick={() => void addLink()} disabled={busy || !linkName.trim() || !linkUrl.trim()}>
            링크 추가
          </button>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="attachments-grid">
        {attachments.map((attachment) => (
          <article key={attachment.id} className="attachment-card">
            <strong>{attachment.name}</strong>
            <small>{attachment.kind === "FILE" ? (attachment.mimeType ?? "file") : "link"} {attachment.size ? `· ${Math.max(1, Math.round(attachment.size / 1024))}KB` : ""}</small>
            <div className="row-actions left">
              {attachment.kind === "FILE" && attachment.contentDataUrl ? (
                <>
                  <a className="button secondary" href={attachment.contentDataUrl} target="_blank" rel="noreferrer">미리보기</a>
                  <a className="button secondary" href={attachment.contentDataUrl} download={attachment.name}>다운로드</a>
                </>
              ) : attachment.url ? (
                <a className="button secondary" href={attachment.url} target="_blank" rel="noreferrer">링크 열기</a>
              ) : null}
              {canEdit && <button className="button danger" onClick={() => void removeAttachment(attachment.id)} disabled={busy}>삭제</button>}
            </div>
          </article>
        ))}
        {!attachments.length && <p className="muted">첨부 파일/링크가 없습니다.</p>}
      </div>
    </section>
  );
}

function TimelinePanel({ timeline, notes, members }: { timeline: TimelineEvent[]; notes: Note[]; members: Member[] }) {
  const [openSessions, setOpenSessions] = useState<Set<string>>(() => {
    const value = window.localStorage.getItem("task-timeline-open-sessions");
    return value ? new Set(value.split(",").filter(Boolean)) : new Set();
  });
  const [logFilter, setLogFilter] = useState<"all" | "system" | "change" | "decision">("all");
  const classifyTimelineEvent = (type: string) => {
    if (["APPROVAL_REQUESTED", "APPROVAL_APPROVED", "APPROVAL_REJECTED", "COMPLETED", "CANCELED"].includes(type)) return "decision";
    if (["STATE_TRANSITION", "HIERARCHY_CHANGE", "NOTE_UPDATED", "COMMENT"].includes(type)) return "change";
    return "system";
  };
  const filteredTimeline = useMemo(
    () => (logFilter === "all" ? timeline : timeline.filter((event) => classifyTimelineEvent(event.type) === logFilter)),
    [logFilter, timeline]
  );
  const filterCount = useMemo(() => {
    const counts = { all: timeline.length, system: 0, change: 0, decision: 0 };
    timeline.forEach((event) => {
      const kind = classifyTimelineEvent(event.type);
      counts[kind] += 1;
    });
    return counts;
  }, [timeline]);
  const sessions = useMemo(() => {
    const rows: Array<{ id: string; representative: TimelineEvent; hidden: TimelineEvent[] }> = [];
    filteredTimeline.forEach((event) => {
      const minuteKey = new Date(event.createdAt).toISOString().slice(0, 16);
      const previous = rows[rows.length - 1];
      if (previous && new Date(previous.representative.createdAt).toISOString().slice(0, 16) === minuteKey && previous.representative.actorId === event.actorId) {
        previous.hidden.push(event);
      } else {
        rows.push({ id: `${event.actorId}-${minuteKey}`, representative: event, hidden: [] });
      }
    });
    return rows;
  }, [filteredTimeline]);
  const hiddenSessionIds = sessions.filter((session) => session.hidden.length > 0).map((session) => session.id);
  const allOpen = hiddenSessionIds.length > 0 && hiddenSessionIds.every((id) => openSessions.has(id));
  useEffect(() => {
    window.localStorage.setItem("task-timeline-open-sessions", [...openSessions].join(","));
  }, [openSessions]);
  const renderEvent = (event: TimelineEvent) => (
    <div className="timeline-item" key={event.id}>
      <span className="timeline-dot" />
      <div>
        <strong>{eventLabel[event.type] ?? event.type}</strong>
        <p>
          {memberName(members, event.actorId)}
          {event.decisionType ? ` · ${decisionLabel[event.decisionType]}` : ""}
          {event.reason ? ` · ${event.reason}` : ""}
        </p>
        {event.referencedNoteIds.length > 0 && (
          <div className="ref-list">
            {event.referencedNoteIds.map((id) => <span key={id}>#{notes.find((note) => note.id === id)?.title ?? "노트"}</span>)}
          </div>
        )}
      </div>
      <time>{formatDate(event.createdAt)}</time>
    </div>
  );

  return (
    <section className="panel">
      <PanelHeader
        title="변경 기록"
        action={hiddenSessionIds.length > 0 ? (
          <button className="button secondary" onClick={() => setOpenSessions(allOpen ? new Set() : new Set(hiddenSessionIds))}>
            {allOpen ? "접기" : "전체 펼침"}
          </button>
        ) : <button className="button secondary" disabled>전체</button>}
      />
      <div className="timeline-filter-chips">
        <button className={`signal-chip ${logFilter === "all" ? "active" : ""}`} onClick={() => setLogFilter("all")}>전체 {filterCount.all}</button>
        <button className={`signal-chip ${logFilter === "system" ? "active" : ""}`} onClick={() => setLogFilter("system")}>시스템 {filterCount.system}</button>
        <button className={`signal-chip ${logFilter === "change" ? "active" : ""}`} onClick={() => setLogFilter("change")}>변경 {filterCount.change}</button>
        <button className={`signal-chip ${logFilter === "decision" ? "active" : ""}`} onClick={() => setLogFilter("decision")}>결정 {filterCount.decision}</button>
      </div>
      <div className="timeline">
        {!sessions.length && <p className="muted">선택한 타입의 로그가 없습니다.</p>}
        {sessions.map((session) => {
          const open = openSessions.has(session.id);
          return (
            <div className="timeline-session" key={session.id}>
              {renderEvent(session.representative)}
              {session.hidden.length > 0 && (
                <>
                  <button
                    className="show-more"
                    onClick={() => setOpenSessions((prev) => {
                      const next = new Set(prev);
                      if (next.has(session.id)) next.delete(session.id);
                      else next.add(session.id);
                      return next;
                    })}
                  >
                    {open ? "Show less" : `Show ${session.hidden.length} more`}
                  </button>
                  {open && <div className="timeline-hidden">{session.hidden.map(renderEvent)}</div>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DecisionModal({
  decision,
  notes,
  busy,
  onClose,
  onSubmit
}: {
  decision: { toState: TaskState; decisionType: DecisionType; title: string };
  notes: Note[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: { toState: TaskState; decisionType: DecisionType; reason: string; referencedNoteIds: string[] }) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [refs, setRefs] = useState<Set<string>>(new Set(notes.slice(0, 1).map((note) => note.id)));

  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({ ...decision, reason, referencedNoteIds: [...refs] });
        }}
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">결정</div>
            <h2>{decision.title}</h2>
            <p className="muted">
              {decision.decisionType === "APPROVE"
                ? "승인 시 상태가 완료로 전환되고 결정 이력이 타임라인에 기록됩니다."
                : decision.decisionType === "REJECT"
                  ? "반려 시 반려 사유와 참조 노트가 타임라인에 남습니다."
                  : decision.decisionType === "SUPPLEMENT"
                    ? "보완 요청 시 재검토가 필요한 근거를 남겨 다음 액션을 명확히 합니다."
                    : "상태 변경 사유를 남겨 추적 가능성을 유지합니다."}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>×</button>
        </div>
        <label>
          사유
          <textarea required value={reason} onChange={(e) => setReason(e.target.value)} rows={5} placeholder="결정 근거를 입력하세요" />
        </label>
        <div className="check-grid">
          {notes.map((note) => (
            <label key={note.id}>
              <input
                type="checkbox"
                checked={refs.has(note.id)}
                onChange={() => setRefs((prev) => {
                  const next = new Set(prev);
                  if (next.has(note.id)) next.delete(note.id);
                  else next.add(note.id);
                  return next;
                })}
              />
              {note.title}
            </label>
          ))}
        </div>
        <div className="row-actions">
          <button type="button" className="button secondary" onClick={onClose}>취소</button>
          <button className="button primary" disabled={busy || !reason.trim()}>제출</button>
        </div>
      </form>
    </div>
  );
}

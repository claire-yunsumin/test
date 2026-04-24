import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  type UnitMemberRole,
  type Bucket
} from "@hwe/shared";
import { Badge, Centered, FilterShell, Meta, PageHeader, PanelHeader, PanelTitle, Select, Tabs } from "../components/ui";
import { request } from "../lib/api";
import { go } from "../lib/router";
import type { TaskDetail, TaskView } from "../lib/viewTypes";
import { TaskViewTabs } from "../features/tasks/TaskViewTabs";
import {
  TASK_DESCRIPTION_FIELD_KEY,
  TASK_FILES_FIELD_KEY,
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
    if (taskDraft.title === detail.task.title) return;
    void saveTask(taskDraft, true);
  }, [taskDraft.title, detail?.task.id], 1100);

  if (!detail || !task) return <Centered><div className="loader" /></Centered>;

	  const { parent, notes, attachments = [], referenceableNotes = notes, referenceableTasks = [task], comments, timeline, members, children, permissions } = detail;
  const canEditTask = permissions?.canEditTask ?? ["MEMBER", "OWNER", "ADMIN", "SUPER_ADMIN"].includes(me.role);
  const canEditForm = permissions?.canEditForm ?? ["MEMBER", "OWNER", "ADMIN", "SUPER_ADMIN"].includes(me.role);
  const changed = hasChangedSinceSeen(task, parent, me.id);
  const canApprove = ["OWNER", "ADMIN", "SUPER_ADMIN"].includes(me.role);
  const canDeleteTask = me.role === "ADMIN" || me.role === "SUPER_ADMIN" || task.ownerId === me.id;

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
            <SystemFieldsPanel
              task={task}
              members={members}
              templates={templates}
              referenceableTasks={referenceableTasks}
              canEditTask={canEditTask}
              canApprove={canApprove}
              childrenCount={children.length}
              notes={notes}
              comments={comments}
              onOpenDecision={setDecision}
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
          <FormOutput task={task} canEditForm={canEditForm} onReload={load} />
          <AttachmentsSection taskId={task.id} attachments={attachments} canEdit={canEditTask} onReload={load} />
          <NotesSection taskId={task.id} notes={notes} members={members} onReload={load} />
        </div>

        <TaskRightPanel
          taskId={task.id}
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
  notes,
  tasks,
  comments,
  members,
  timeline,
  me,
  onReload
}: {
  taskId: string;
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
      <Tabs
        variant="panel"
        value={tab}
        onChange={(value) => setTab(value as typeof tab)}
        tabs={[
          { value: "thread", label: "스레드", count: comments.length },
          { value: "timeline", label: "타임라인", count: timeline.length }
        ]}
      />
      {tab === "thread" ? (
        <ThreadPanel taskId={taskId} notes={notes} tasks={tasks} comments={comments} members={members} me={me} onReload={onReload} />
      ) : (
        <TimelinePanel timeline={timeline} notes={notes} members={members} />
      )}
    </aside>
  );
}

function SystemFieldsPanel({
  task,
  members,
  templates,
  referenceableTasks,
  canEditTask,
  canApprove,
  childrenCount,
  notes,
  comments,
  onOpenDecision,
  onReload
}: {
  task: TaskView;
  members: Member[];
  templates: Template[];
  referenceableTasks: TaskView[];
  canEditTask: boolean;
  canApprove: boolean;
  childrenCount: number;
  notes: Note[];
  comments: ThreadComment[];
  onOpenDecision: (action: { toState: TaskState; decisionType: DecisionType; title: string }) => void;
  onReload: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [templateSaveName, setTemplateSaveName] = useState("");
  const [templateSaveBusy, setTemplateSaveBusy] = useState(false);
  const [systemCollapsed, setSystemCollapsed] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [templateSaveModalOpen, setTemplateSaveModalOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [decisionState, setDecisionState] = useState<TaskState>(task.currentState);
  const [nextActionOpen, setNextActionOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [fixedFieldsOpen, setFixedFieldsOpen] = useState(false);
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
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("시스템 필드 저장 실패", "변경값이 반영되지 않았습니다", "권한과 입력값을 확인한 뒤 다시 시도하세요")
      );
    } finally {
      setSaving(null);
    }
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
      .filter(([key]) => key !== TASK_DESCRIPTION_FIELD_KEY && key !== TASK_FILES_FIELD_KEY)
      .map(([key]) => ({
        key,
        label: key.replace(/[_-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
        type: "TEXT",
        required: false
      }));
    fields.unshift({ key: TASK_FILES_FIELD_KEY, label: "파일 업로드", type: "FILE", required: false });
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
      <Meta label="상위 항목">
        <Select
          tone="inline"
          value={task.parentId ?? ""}
          onChange={(value) => void patchTask("parent", { parentId: value || null })}
          options={[["", "루트"], ...referenceableTasks.filter((row) => row.id !== task.id).map((row) => [row.id, row.title] as [string, string])]}
          disabled={!canEditTask}
        />
      </Meta>
      <Meta label="템플릿">
        <div className="template-inline-tools">
          <Select
            tone="inline"
            value={task.templateId ?? ""}
            onChange={(value) => void patchTask("template", { templateId: value || null })}
            options={[["", "자유폼 유지"], ...templates.filter((template) => template.enabled || template.id === task.templateId).map((template) => [template.id, template.name] as [string, string])]}
            disabled={!canEditTask}
          />
        </div>
      </Meta>
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
      <Meta label="타입">
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
      </Meta>
      <Meta label="담당자/공유">
        <div className="member-share-block" ref={shareRef}>
          <button
            type="button"
            className="member-share-trigger"
            onClick={() => setShareOpen((prev) => !prev)}
            aria-haspopup="dialog"
            aria-expanded={shareOpen}
          >
            <span className="member-share-trigger-value">{assigneePreview}</span>
            <i>{shareOpen ? "▴" : "▾"}</i>
          </button>
          {shareOpen && (
            <div className="member-share-popover">
              <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="이름, 이메일, 조직 검색" />
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
        />
      </Meta>
      <Meta label="우선순위">
        <Select
          tone="inline"
          value={task.priority}
          onChange={(priority) => void patchTask("priority", { priority: priority as TaskView["priority"] })}
          options={["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => [value, priorityLabel[value as TaskView["priority"]]])}
        />
      </Meta>
      <Meta label="상태">
        <div className="next-action-wrap" ref={nextActionRef}>
          <button
            className="state-action-trigger"
            title="상태 및 다음 액션"
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
                    onOpenDecision(action);
                    setNextActionOpen(false);
                  }}
                >
                  <strong>{action.title}</strong>
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
        </>
      )}
    </section>
  );
}

function NotesSection({ taskId, notes, members, onReload }: { taskId: string; notes: Note[]; members: Member[]; onReload: () => Promise<void> }) {
  const [open, setOpen] = useState<Set<string>>(() => {
    const stored = window.localStorage.getItem(`task-notes-open:${taskId}`);
    if (stored) return new Set(stored.split(",").filter(Boolean));
    return new Set(notes.map((note) => note.id));
  });
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      await request(`/api/tasks/${taskId}/notes`, { method: "POST", body: JSON.stringify({ title, content }) });
      setTitle("");
      setContent("");
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

  return (
	    <section className="panel">
	      <PanelHeader title={`노트 (${notes.length})`} action={<button className="button secondary" onClick={() => setCreateOpen((v) => !v)}>{createOpen ? "닫기" : "추가"}</button>} />
	      {error && !createOpen && <p className="form-error">{error}</p>}
	      {createOpen && (
        <div className="note-create">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="노트 제목" maxLength={120} />
          <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="핵심 맥락이나 결정 근거를 작성하세요" rows={4} maxLength={5000} />
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
  author,
  open,
  creating,
	  onToggle,
	  onSave,
	  onDelete
	}: {
	  note: Note;
	  author: string;
	  open: boolean;
	  creating: boolean;
	  onToggle: () => void;
	  onSave: (patch: { title?: string; content?: string }) => Promise<void>;
	  onDelete: () => Promise<void>;
	}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
  }, [note.content, note.title]);

  return (
    <div className="note-card">
      <button className="note-head" onClick={onToggle}>
        <span>{open ? "−" : "+"}</span>
        <strong>{note.title}</strong>
        <small>{author} · {elapsed(note.updatedAt)}</small>
      </button>
      {open && (
        <div className="note-body">
          {editing ? (
            <>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
              <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} />
              <div className="row-actions">
                <button className="button secondary" onClick={() => setEditing(false)}>취소</button>
                <button className="button primary" disabled={creating} onClick={() => {
                  void onSave({ title, content }).then(() => setEditing(false));
                }}>저장</button>
              </div>
            </>
          ) : (
            <>
              <p>{note.content}</p>
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
                    <p>{comment.content}</p>
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

  return (
    <div className="mention-composer">
      <textarea ref={textareaRef} value={value} onChange={(event) => onChange(event.target.value)} rows={4} maxLength={2000} placeholder={placeholder} />
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

function FormOutput({ task, canEditForm, onReload }: { task: TaskView; canEditForm: boolean; onReload: () => Promise<void> }) {
  const fields = task.template?.formDefinition ?? [];
  const entries = [
    [TASK_DESCRIPTION_FIELD_KEY, task.description ?? ""] as [string, string],
    [TASK_FILES_FIELD_KEY, task.formValues[TASK_FILES_FIELD_KEY] ?? ""] as [string, string],
    ...(fields.length ? fields.map((field) => [field.key, task.formValues[field.key] ?? ""] as [string, string]) : Object.entries(task.formValues).filter(([key]) => key !== TASK_FILES_FIELD_KEY))
  ];
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => entries.length ? entries : [["", ""]]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextEntries = [
      [TASK_DESCRIPTION_FIELD_KEY, task.description ?? ""] as [string, string],
      [TASK_FILES_FIELD_KEY, task.formValues[TASK_FILES_FIELD_KEY] ?? ""] as [string, string],
      ...(fields.length ? fields.map((field) => [field.key, task.formValues[field.key] ?? ""] as [string, string]) : Object.entries(task.formValues).filter(([key]) => key !== TASK_FILES_FIELD_KEY))
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
            return (
            <div className="form-output-row" key={`${key}-${index}`}>
              <input
                value={key}
                placeholder={key === TASK_DESCRIPTION_FIELD_KEY ? "태스크 설명" : key === TASK_FILES_FIELD_KEY ? "파일 업로드" : field?.label ?? "필드"}
                maxLength={80}
                readOnly={Boolean(field) || key === TASK_DESCRIPTION_FIELD_KEY || key === TASK_FILES_FIELD_KEY}
                onChange={(event) => setRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? [event.target.value, row[1]] : row))}
              />
              {field?.type === "FILE" || key === TASK_FILES_FIELD_KEY ? (
                <input
                  type="file"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []).map((file) => file.name);
                    if (!files.length) return;
                    setRows((prev) => prev.map((row, rowIndex) => {
                      if (rowIndex !== index) return row;
                      const existing = row[1]
                        .split(",")
                        .map((part) => part.trim())
                        .filter(Boolean);
                      const next = [...new Set([...existing, ...files])];
                      return [row[0], next.join(", ")];
                    }));
                  }}
                />
              ) : field?.type === "LONG_TEXT" || key === TASK_DESCRIPTION_FIELD_KEY ? (
                <textarea
                  value={value}
                  placeholder={key === TASK_DESCRIPTION_FIELD_KEY ? "핵심 맥락과 배경을 구조적으로 작성하세요" : field?.helpText ?? "값"}
                  maxLength={key === TASK_DESCRIPTION_FIELD_KEY ? 1200 : 1000}
                  rows={key === TASK_DESCRIPTION_FIELD_KEY ? 8 : 3}
                  className={key === TASK_DESCRIPTION_FIELD_KEY ? "rich-text-field" : undefined}
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
              {!field && key !== TASK_DESCRIPTION_FIELD_KEY && key !== TASK_FILES_FIELD_KEY && <button className="button secondary" onClick={() => setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}>삭제</button>}
            </div>
          );
          })}
          {error && <p className="form-error">{error}</p>}
          <div className="row-actions">
            {!fields.length && <button className="button secondary" onClick={() => setRows((prev) => [...prev, ["", ""]])}>필드 추가</button>}
            <button className="button primary" onClick={() => void save()}>산출물 저장</button>
          </div>
        </div>
      ) : (
        <div className="kv-grid">
          {entries.length ? entries.map(([key, value]) => (
            <div key={key}>
              <small>{key === TASK_DESCRIPTION_FIELD_KEY ? "태스크 설명" : key === TASK_FILES_FIELD_KEY ? "파일 업로드" : fields.find((field) => field.key === key)?.label ?? key}</small>
              <strong className={key === TASK_DESCRIPTION_FIELD_KEY ? "rich-text-preview" : undefined}>
                {key === TASK_FILES_FIELD_KEY ? (value ? value.split(",").map((row) => row.trim()).filter(Boolean).join(" · ") : "파일 없음") : value}
              </strong>
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
        title="타임라인"
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

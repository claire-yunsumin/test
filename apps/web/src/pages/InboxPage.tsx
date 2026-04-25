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
  type UnitMemberRole
} from "@hwe/shared";
import { Badge, Centered, FilterShell, PageHeader, PanelHeader, PanelTitle, Select, Tabs } from "../components/ui";
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
  type TaskViewMode
} from "../lib/domain";

export function InboxView({ data, onReload }: { data: AppData; onReload: () => Promise<void> }) {
  const [tab, setTab] = useState<InboxComponent>("DECISION");
  const [quickDecision, setQuickDecision] = useState<{
    itemId: string;
    taskId: string;
    taskTitle: string;
    actions: Array<{ toState: TaskState; decisionType: DecisionType; title: string; tone: "primary" | "secondary" | "danger" }>;
    selectedDecisionType: DecisionType;
    reason: string;
    busy: boolean;
    error: string | null;
    acked: boolean;
  } | null>(null);
  const meId = data.me.id;
  const items = data.inbox.filter((item) => item.componentType === tab && item.userId === meId);
  const sentItems = data.inbox
    .filter((item) => item.sourceUserId === meId && item.userId !== meId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const taskMap = new Map(data.tasks.map((task) => [task.id, task]));
  const approvalModeByTaskId = useMemo(() => {
    const latest = new Map<string, { createdAt: number; mode: string | null }>();
    data.timeline.forEach((event) => {
      if (event.type !== "APPROVAL_REQUESTED") return;
      const payload = event.payload as { approvalMode?: unknown } | undefined;
      const mode = typeof payload?.approvalMode === "string" ? payload.approvalMode : null;
      const createdAt = new Date(event.createdAt).getTime();
      const current = latest.get(event.taskId);
      if (!current || createdAt >= current.createdAt) {
        latest.set(event.taskId, { createdAt, mode });
      }
    });
    return new Map([...latest.entries()].map(([taskId, value]) => [taskId, value.mode]));
  }, [data.timeline]);
  const slaHours = data.notificationSettings[0]?.slaHours ?? 24;

  const markRead = async (id: string) => {
    await request(`/api/inbox/${id}/read`, { method: "PATCH" });
    await onReload();
  };
  const markAck = async (id: string) => {
    await request(`/api/inbox/${id}/ack`, { method: "PATCH" });
    await onReload();
  };
  const remind = async (id: string) => {
    await request(`/api/inbox/${id}/remind`, { method: "POST" });
    await onReload();
  };
  const markAllRead = async (componentType?: InboxComponent) => {
    await request("/api/inbox/read-all", { method: "PATCH", body: JSON.stringify(componentType ? { componentType } : {}) });
    await onReload();
  };
  const openQuickDecision = (
    itemId: string,
    task: { id: string; title: string; currentState: TaskState },
    acked: boolean,
    approvalMode: string | null
  ) => {
    const actions = decisionActions(task.currentState, true)
      .filter((action) => action.decisionType === "APPROVE" || action.decisionType === "REJECT" || action.decisionType === "SUPPLEMENT")
      .map((action) =>
        action.decisionType === "APPROVE" && approvalMode === "CONSENSUS"
          ? { ...action, title: "합의" }
          : action
      );
    if (!actions.length) return;
    setQuickDecision({
      itemId,
      taskId: task.id,
      taskTitle: task.title,
      actions,
      selectedDecisionType: actions[0].decisionType,
      reason: "",
      busy: false,
      error: null,
      acked
    });
  };
  const submitQuickDecision = async () => {
    if (!quickDecision) return;
    const selected = quickDecision.actions.find((action) => action.decisionType === quickDecision.selectedDecisionType);
    if (!selected || !quickDecision.reason.trim()) return;
    try {
      setQuickDecision((prev) => (prev ? { ...prev, busy: true, error: null } : prev));
      await request(`/api/tasks/${quickDecision.taskId}/transition`, {
        method: "POST",
        body: JSON.stringify({
          toState: selected.toState,
          decisionType: selected.decisionType,
          reason: quickDecision.reason.trim(),
          referencedNoteIds: []
        })
      });
      await request(`/api/inbox/${quickDecision.itemId}/read`, { method: "PATCH" });
      if (!quickDecision.acked) {
        await request(`/api/inbox/${quickDecision.itemId}/ack`, { method: "PATCH" });
      }
      await onReload();
      setQuickDecision(null);
    } catch (err) {
      setQuickDecision((prev) =>
        prev
          ? { ...prev, busy: false, error: err instanceof Error ? err.message : "결정 처리에 실패했습니다." }
          : prev
      );
    }
  };
  const sentSummary = useMemo(() => {
    const total = sentItems.length;
    const read = sentItems.filter((item) => Boolean(item.readAt)).length;
    const acked = sentItems.filter((item) => Boolean(item.ackAt)).length;
    const overdue = sentItems.filter((item) => {
      if (item.readAt) return false;
      const ageHours = (Date.now() - new Date(item.createdAt).getTime()) / 36e5;
      return ageHours >= slaHours;
    }).length;
    return { total, read, acked, overdue };
  }, [sentItems, slaHours]);

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Inbox / Triggers"
        title="알림 분류"
        description="결정, 논의, 인지, 결과 알림을 SLA와 열람 상태 기준으로 처리합니다."
      />
      <div className="inbox-summary-strip">
        <span><b>{items.filter((item) => !item.readAt).length}</b><small>unread in tab</small></span>
        <span><b>{sentSummary.overdue}</b><small>SLA overdue</small></span>
        <span><b>{sentSummary.read}/{sentSummary.total}</b><small>sent read</small></span>
        <span><b>{sentSummary.acked}</b><small>sent acked</small></span>
        <span><b>{slaHours}h</b><small>SLA</small></span>
      </div>
      <div className="inbox-layout">
        <section className="list-panel inbox-received-panel">
          <div className="inbox-panel-head">
            <PanelTitle title="수신함" />
            <div className="row-actions left">
              <button className="button secondary" onClick={() => void markAllRead(tab)}>현재 탭 모두 읽음</button>
              <button className="button secondary" onClick={() => void markAllRead()}>전체 모두 읽음</button>
            </div>
          </div>
          <div className="inbox-controls">
            <Tabs variant="primary" value={tab} onChange={(v) => setTab(v as InboxComponent)} tabs={INBOX_COMPONENTS.map((item) => ({ value: item.value, label: item.label, count: data.inbox.filter((row) => row.userId === meId && row.componentType === item.value && !row.readAt).length }))} />
          </div>
          {items.map((item) => (
            <div className={`inbox-row ${item.readAt ? "" : "unread"}`} key={item.id}>
              <div>
                <Badge tone={item.componentType === "DECISION" ? "amber" : item.componentType === "DISCUSSION" ? "blue" : item.componentType === "RESULT" ? "green" : "slate"}>
                  {eventLabel[item.eventType] ?? item.eventType}
                </Badge>
                <h3>{item.title}</h3>
                <p>{item.message}</p>
                <small className="inbox-row-meta-line">
                  <span>{taskMap.get(item.taskId)?.title}</span>
                  <span>{item.readAt ? "읽음" : "미확인"}</span>
                  <span>{item.ackAt ? "처리완료" : "미처리"}</span>
                  <span>{elapsed(item.createdAt)}</span>
                </small>
              </div>
              <div className="row-actions">
                <button className="button secondary" onClick={() => go(`/tasks/${item.taskId}`)}>열기</button>
                {tab === "DECISION" && item.eventType === "APPROVAL_REQUESTED" && taskMap.get(item.taskId) ? (
                  <button
                    className="button primary"
                    onClick={() =>
                      openQuickDecision(
                        item.id,
                        taskMap.get(item.taskId)!,
                        Boolean(item.ackAt),
                        approvalModeByTaskId.get(item.taskId) ?? null
                      )
                    }
                  >
                    결정 입력
                  </button>
                ) : null}
                <button className="button secondary" onClick={() => void markRead(item.id)}>{item.readAt ? "안 읽음" : "읽음"}</button>
                <button className="button secondary" onClick={() => void markAck(item.id)}>{item.ackAt ? "처리 취소" : "처리 완료"}</button>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="inbox-empty">현재 탭의 수신 알림이 없습니다.</p>}
        </section>
        <aside className="list-panel inbox-sent-panel">
          <div className="inbox-panel-head">
            <PanelTitle title="발신함" />
            <span className="signal-chip">{sentSummary.read}/{sentSummary.total} · ack {sentSummary.acked}</span>
          </div>
          <p className="inbox-sent-summary">
            수신자 미열람 {Math.max(0, sentSummary.total - sentSummary.read)} · 미처리 {Math.max(0, sentSummary.total - sentSummary.acked)} · SLA 초과 {sentSummary.overdue}
          </p>
          {sentItems.slice(0, 30).map((item) => (
            <div className={`inbox-row inbox-sent-row ${item.readAt ? "" : "unread"}`} key={`sent-${item.id}`}>
              <div>
                <Badge tone={item.ackAt ? "green" : item.readAt ? "blue" : "amber"}>
                  {item.ackAt ? "수신자 처리완료" : item.readAt ? "수신자 열람" : "수신자 미열람"}
                </Badge>
                <h3>{item.title}</h3>
                <p>{item.message}</p>
                <small className="inbox-row-meta-line">
                  <span>{taskMap.get(item.taskId)?.title}</span>
                  <span>수신자 {data.members.find((m) => m.id === item.userId)?.name ?? item.userId}</span>
                  {item.readAt ? <span>열람 {elapsed(item.readAt)}</span> : null}
                  {item.ackAt ? <span>처리 {elapsed(item.ackAt)}</span> : null}
                  {!item.readAt && ((Date.now() - new Date(item.createdAt).getTime()) / 36e5 >= slaHours) ? <span>SLA 지연</span> : null}
                  {(item.remindCount ?? 0) > 0 ? <span>리마인드 {item.remindCount}회</span> : null}
                </small>
              </div>
              <div className="row-actions">
                <button className="button secondary" onClick={() => go(`/tasks/${item.taskId}`)}>열기</button>
                <button className="button secondary" onClick={() => void remind(item.id)}>리마인드</button>
              </div>
            </div>
          ))}
          {sentItems.length === 0 && <p className="inbox-empty">보낸 요청/알림이 없습니다.</p>}
        </aside>
      </div>
      {quickDecision && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <div>
                <div className="eyebrow">결정 빠른 처리</div>
                <h2>{quickDecision.taskTitle}</h2>
                <p className="muted">승인/보완요청/반려 중 하나를 선택하고 리뷰 코멘트를 남기면 요청자 수신함에 결과가 전달됩니다.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setQuickDecision(null)}>×</button>
            </div>
            <div className="row-actions left">
              {quickDecision.actions.map((action) => (
                <button
                  key={action.decisionType}
                  className={`button ${quickDecision.selectedDecisionType === action.decisionType ? "primary" : "secondary"}`}
                  onClick={() => setQuickDecision((prev) => (prev ? { ...prev, selectedDecisionType: action.decisionType } : prev))}
                  type="button"
                >
                  {action.title}
                </button>
              ))}
            </div>
            <label>
              리뷰 코멘트
              <textarea
                rows={5}
                placeholder="결정 근거와 피드백을 입력하세요."
                value={quickDecision.reason}
                onChange={(event) => setQuickDecision((prev) => (prev ? { ...prev, reason: event.target.value } : prev))}
              />
            </label>
            {quickDecision.error ? <p className="form-error">{quickDecision.error}</p> : null}
            <div className="row-actions">
              <button className="button secondary" type="button" onClick={() => setQuickDecision(null)} disabled={quickDecision.busy}>취소</button>
              <button className="button primary" type="button" onClick={() => void submitQuickDecision()} disabled={quickDecision.busy || !quickDecision.reason.trim()}>
                {quickDecision.busy ? "처리 중..." : "결정 전송"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

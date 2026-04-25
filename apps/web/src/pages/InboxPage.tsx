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
  const meId = data.me.id;
  const items = data.inbox.filter((item) => item.componentType === tab && item.userId === meId);
  const sentItems = data.inbox
    .filter((item) => item.sourceUserId === meId && item.userId !== meId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const taskMap = new Map(data.tasks.map((task) => [task.id, task]));
  const slaHours = data.notificationSettings[0]?.slaHours ?? 24;

  const markRead = async (id: string) => {
    await request(`/api/inbox/${id}/read`, { method: "PATCH" });
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
  const sentSummary = useMemo(() => {
    const total = sentItems.length;
    const read = sentItems.filter((item) => Boolean(item.readAt)).length;
    const overdue = sentItems.filter((item) => {
      if (item.readAt) return false;
      const ageHours = (Date.now() - new Date(item.createdAt).getTime()) / 36e5;
      return ageHours >= slaHours;
    }).length;
    return { total, read, overdue };
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
        <span><b>{slaHours}h</b><small>SLA</small></span>
      </div>
      <div className="inbox-controls">
        <Tabs variant="primary" value={tab} onChange={(v) => setTab(v as InboxComponent)} tabs={INBOX_COMPONENTS.map((item) => ({ value: item.value, label: item.label, count: data.inbox.filter((row) => row.userId === meId && row.componentType === item.value && !row.readAt).length }))} />
        <div className="row-actions left">
          <button className="button secondary" onClick={() => void markAllRead(tab)}>현재 탭 모두 읽음</button>
          <button className="button secondary" onClick={() => void markAllRead()}>전체 모두 읽음</button>
        </div>
      </div>
      <div className="list-panel">
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
                <span>{item.readAt ? "read" : "unread"}</span>
                <span>{elapsed(item.createdAt)}</span>
              </small>
            </div>
            <div className="row-actions">
              <button className="button secondary" onClick={() => go(`/tasks/${item.taskId}`)}>열기</button>
              <button className="button secondary" onClick={() => void markRead(item.id)}>{item.readAt ? "안 읽음" : "읽음"}</button>
            </div>
          </div>
        ))}
      </div>
      <section className="panel">
        <PanelHeader title="내가 보낸 요청/알림 추적" />
        <p className="muted">수신자 열람 {sentSummary.read} / 수신자 미열람 {Math.max(0, sentSummary.total - sentSummary.read)} / SLA 초과 {sentSummary.overdue} / 전체 {sentSummary.total}</p>
        <div className="list-panel">
          {sentItems.slice(0, 30).map((item) => (
            <div className={`inbox-row ${item.readAt ? "" : "unread"}`} key={`sent-${item.id}`}>
              <div>
                <Badge tone={item.readAt ? "green" : "amber"}>{item.readAt ? "수신자 열람" : "수신자 미열람"}</Badge>
                <h3>{item.title}</h3>
                <p>{item.message}</p>
                <small>
                  {taskMap.get(item.taskId)?.title} · 수신자 {data.members.find((m) => m.id === item.userId)?.name ?? item.userId}
                  {item.readAt ? ` · 열람 ${elapsed(item.readAt)}` : ""}
                  {!item.readAt && ((Date.now() - new Date(item.createdAt).getTime()) / 36e5 >= slaHours) ? " · SLA 지연" : ""}
                  {(item.remindCount ?? 0) > 0 ? ` · 리마인드 ${item.remindCount}회` : ""}
                </small>
              </div>
              <div className="row-actions">
                <button className="button secondary" onClick={() => go(`/tasks/${item.taskId}`)}>열기</button>
                <button className="button secondary" onClick={() => void remind(item.id)}>리마인드</button>
              </div>
            </div>
          ))}
          {sentItems.length === 0 && <p className="muted">보낸 요청/알림이 없습니다.</p>}
        </div>
      </section>
    </section>
  );
}

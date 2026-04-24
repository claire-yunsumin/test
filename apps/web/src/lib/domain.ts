import { useEffect } from "react";
import { STATE_META, TEMPLATE_META, type DecisionType, type Member, type Role, type TaskState, type TemplateType } from "@hwe/shared";
import { go } from "./router";
import type { TaskView } from "./viewTypes";

export const templateOrder: TemplateType[] = ["VISION", "AXIS", "OBJECTIVE", "KEYRESULT", "TASK"];
export const states: Array<"ALL" | TaskState> = ["ALL", "DRAFT", "IN_PROGRESS", "DONE", "CANCELED"];
export const templateTypes: Array<"ALL" | TemplateType> = ["ALL", "VISION", "AXIS", "OBJECTIVE", "KEYRESULT", "TASK"];
export const roleLabel: Record<Role, string> = {
  MEMBER: "유닛 멤버",
  OWNER: "유닛 오너",
  ADMIN: "관리자",
  SUPER_ADMIN: "IT 인프라 담당자"
};
export const priorityLabel: Record<TaskView["priority"], string> = {
  LOW: "낮음",
  MEDIUM: "보통",
  HIGH: "높음",
  URGENT: "긴급"
};
export const decisionLabel: Record<DecisionType, string> = {
  APPROVE: "승인",
  REJECT: "반려",
  SUPPLEMENT: "보완 요청",
  STATE_ONLY: "상태 변경"
};
export const eventLabel: Record<string, string> = {
  TASK_CREATED: "태스크 생성",
  STATE_TRANSITION: "상태 변경",
  APPROVAL_REQUESTED: "승인 요청",
  APPROVAL_APPROVED: "승인 완료",
  APPROVAL_REJECTED: "승인 반려",
  NOTE_UPDATED: "노트 수정",
  COMMENT: "댓글",
  MENTION: "호출",
  HIERARCHY_CHANGE: "계층 변경",
  COMPLETED: "완료",
  CANCELED: "취소"
};
export const fallbackTemplateLabel = "자유 노드";
export const TASK_DESCRIPTION_FIELD_KEY = "__task_description";
export const TASK_FILES_FIELD_KEY = "__task_files";

export function templateTone(type: TemplateType | null | undefined) {
  return type ? TEMPLATE_META[type].tone : "slate";
}

export function templateLabel(type: TemplateType | null | undefined) {
  return type ? TEMPLATE_META[type].label : fallbackTemplateLabel;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(value));
}

export function elapsed(value: string) {
  const hours = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 36e5));
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

export function formatFailure(cause: string, impact: string, nextAction: string) {
  return `${cause}. ${impact}. ${nextAction}.`;
}

export function decisionHint(state: TaskState, canApprove: boolean) {
  if (state === "DRAFT") return "다음 권장 액션: 시작";
  if (state === "IN_PROGRESS") return canApprove ? "다음 권장 액션: 승인 / 보완 / 반려" : "다음 권장 액션: 진행";
  if (state === "DONE") return "완료 상태입니다";
  return "현재 상태에서는 추가 액션이 제한됩니다";
}

export type DecisionAction = {
  toState: TaskState;
  decisionType: DecisionType;
  title: string;
  tone: "primary" | "secondary" | "danger";
};

export function decisionActions(state: TaskState, canApprove: boolean): DecisionAction[] {
  if (state === "DRAFT") return [{ toState: "IN_PROGRESS", decisionType: "STATE_ONLY", title: "작업 시작", tone: "primary" }];
  if (state === "IN_PROGRESS") {
    if (!canApprove) return [{ toState: "IN_PROGRESS", decisionType: "SUPPLEMENT", title: "보완 요청", tone: "secondary" }];
    return [
      { toState: "IN_PROGRESS", decisionType: "SUPPLEMENT", title: "보완 요청", tone: "secondary" },
      { toState: "CANCELED", decisionType: "REJECT", title: "반려", tone: "danger" },
      { toState: "DONE", decisionType: "APPROVE", title: "승인", tone: "primary" }
    ];
  }
  return [];
}

export function isDueToday(value: string | null | undefined) {
  if (!value) return false;
  const today = new Date();
  const due = new Date(value);
  return (
    due.getFullYear() === today.getFullYear() &&
    due.getMonth() === today.getMonth() &&
    due.getDate() === today.getDate()
  );
}

export function hasChangedSinceSeen(task: TaskView, parent: TaskView | null, userId: string) {
  const seenAt = task.lastSeenAtByUser[userId];
  if (!seenAt) return Boolean(parent);
  return parent ? new Date(parent.updatedAt).getTime() > new Date(seenAt).getTime() : false;
}

export function memberName(members: Member[], id: string) {
  return members.find((member) => member.id === id)?.name ?? "알 수 없음";
}

export function memberInitial(member: Member) {
  return profileDisplayName(member).slice(0, 1).toUpperCase();
}

export function profileDisplayName(member: Member) {
  const local = member.email.split("@")[0]?.trim();
  return local || member.name;
}

export type TaskAccessLevel = "ASSIGNEE" | "WATCHER" | "VIEW";

export function taskAccessOf(task: TaskView, memberId: string): TaskAccessLevel {
  if (task.assigneeIds.includes(memberId)) return "ASSIGNEE";
  if (task.watcherIds.includes(memberId)) return "WATCHER";
  return "VIEW";
}

export function useDebouncedEffect(effect: () => void, deps: unknown[], delay = 900) {
  useEffect(() => {
    const timer = window.setTimeout(effect, delay);
    return () => window.clearTimeout(timer);
  }, deps);
}

export function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function densitySignal(task: TaskView) {
  return task.activity.notesCount + task.activity.commentsCount + task.activity.filesCount;
}

export type TaskViewMode = "list" | "board" | "backlog" | "graph";

export function taskViewTabs(tasks: TaskView[]) {
  const backlogCount = tasks.filter((task) => (task.phaseOverride ?? task.workflowPhase ?? (task.currentState === "DRAFT" ? "BACKLOG" : "ACTIVE")) === "BACKLOG").length;
  return [
    { value: "list", label: "리스트", count: tasks.length },
    { value: "board", label: "보드" },
    { value: "backlog", label: "백로그", count: backlogCount },
    { value: "graph", label: "결정 그래프" }
  ] as Array<{ value: TaskViewMode; label: string; count?: number }>;
}

export function effectiveTaskPhase(task: TaskView) {
  return task.phaseOverride ?? task.workflowPhase ?? (task.currentState === "DRAFT" ? "BACKLOG" : task.currentState === "DONE" || task.currentState === "CANCELED" ? "CLOSED" : "ACTIVE");
}

export function isBacklogTask(task: TaskView) {
  return effectiveTaskPhase(task) === "BACKLOG";
}

export function goTaskViewTab(value: TaskViewMode) {
  if (value === "graph") {
    go("/graph");
    return;
  }
  if (value === "list") {
    go("/tasks");
    return;
  }
  go(`/tasks?view=${value}`);
}

export function shortText(value: string, max = 32) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function buildTaskBreadcrumb(task: TaskView, referenceableTasks: TaskView[]) {
  const map = new Map(referenceableTasks.map((row) => [row.id, row]));
  const trail: TaskView[] = [];
  let cursor: TaskView | undefined = task;
  while (cursor) {
    trail.unshift(cursor);
    cursor = cursor.parentId ? map.get(cursor.parentId) : undefined;
  }
  return trail;
}

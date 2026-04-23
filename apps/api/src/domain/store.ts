import {
  type AppData,
  createSeedData,
  type InboxComponent,
  type Task,
  type TimelineEvent
} from "@hwe/shared";

export let data: AppData = createSeedData();

export function resetData() {
  data = createSeedData();
}

export const byId = <T extends { id: string }>(rows: T[], id: string) => rows.find((row) => row.id === id);
export const now = () => new Date().toISOString();

export function taskActivity(taskId: string) {
  return {
    notesCount: data.notes.filter((note) => note.taskId === taskId).length,
    commentsCount: data.comments.filter((comment) => comment.taskId === taskId).length,
    filesCount: data.notes.filter((note) => note.taskId === taskId).flatMap((note) => note.attachments).length
  };
}

export function serializeTask(task: Task) {
  return {
    ...task,
    activity: taskActivity(task.id),
    assignees: task.assigneeIds.map((id) => byId(data.members, id)).filter(Boolean),
    watchers: task.watcherIds.map((id) => byId(data.members, id)).filter(Boolean),
    owner: byId(data.members, task.ownerId)
  };
}

export function addTimeline(event: Omit<TimelineEvent, "id" | "createdAt">) {
  const row: TimelineEvent = { ...event, id: `event-${crypto.randomUUID()}`, createdAt: now() };
  data.timeline.unshift(row);
  return row;
}

export function addInbox(item: Omit<(typeof data.inbox)[number], "id" | "createdAt" | "readAt"> & { readAt?: string | null }) {
  const row = { ...item, id: `inbox-${crypto.randomUUID()}`, readAt: item.readAt ?? null, createdAt: now() };
  data.inbox.unshift(row);
  return row;
}

export function componentForEvent(type: string): InboxComponent {
  if (["APPROVAL_REQUESTED", "APPROVAL_REJECTED"].includes(type)) return "DECISION";
  if (["COMMENT", "MENTION", "NOTE_UPDATED"].includes(type)) return "DISCUSSION";
  if (["COMPLETED", "CANCELED"].includes(type)) return "RESULT";
  return "AWARENESS";
}

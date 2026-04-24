import {
  type AppData,
  createSeedData,
  type Analytics,
  type EngagementEvent,
  type EngagementEventType,
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
  const template = task.templateId ? byId(data.templates, task.templateId) : null;
  return {
    ...task,
    template,
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

export function addEngagement(event: Omit<EngagementEvent, "id" | "createdAt">) {
  const row: EngagementEvent = { ...event, id: `eng-${crypto.randomUUID()}`, createdAt: now() };
  data.engagement.unshift(row);
  data.analytics = calculateAnalytics();
  return row;
}

export function componentForEvent(type: string): InboxComponent {
  if (["APPROVAL_REQUESTED", "APPROVAL_REJECTED"].includes(type)) return "DECISION";
  if (["COMMENT", "MENTION", "NOTE_UPDATED"].includes(type)) return "DISCUSSION";
  if (["COMPLETED", "CANCELED"].includes(type)) return "RESULT";
  return "AWARENESS";
}

export function applyTemplate(task: Task, templateId: string) {
  const template = byId(data.templates, templateId);
  if (!template || !template.enabled) return null;
  const nextValues = { ...task.formValues };
  template.formDefinition.forEach((field) => {
    nextValues[field.key] = nextValues[field.key] ?? "";
  });
  task.templateId = template.id;
  task.templateType = template.type;
  task.structureState = "TEMPLATED";
  task.formValues = nextValues;
  task.updatedAt = now();
  return template;
}

export function calculateAnalytics(): Analytics {
  const comments = data.comments;
  const notes = data.notes;
  const tasks = data.tasks;
  const mentionCount = comments.reduce((sum, comment) => sum + comment.mentions.length, 0);
  const mentionThreadCount = comments.filter((comment) => comment.mentions.length > 0 || comment.referencedNoteIds.length > 0).length;
  const templatedTasks = tasks.filter((task) => task.structureState === "TEMPLATED");
  const activeFormFieldCount = templatedTasks.reduce((sum, task) => {
    const template = task.templateId ? byId(data.templates, task.templateId) : null;
    return sum + (template?.formDefinition.length ?? Object.keys(task.formValues).length);
  }, 0);
  const nonDevAuthors = new Set(data.members.filter((member) => !["HWE", "운영"].includes(member.unit)).map((member) => member.id));
  const crossFunctionalThreads = comments.filter((comment) => {
    const task = byId(tasks, comment.taskId);
    if (!task) return false;
    return comment.authorId !== task.ownerId || Boolean(task.assigneeIds.find((id) => nonDevAuthors.has(id)));
  }).length;
  const eventCount = (type: EngagementEventType) => data.engagement.filter((event) => event.type === type).length;

  return {
    weeklyReturnRate: Math.min(1, eventCount("VOLUNTARY_VISIT") / Math.max(1, data.members.length)),
    notesThreadBalance: `${notes.length}:${comments.length}`,
    nonDevContributionRate: comments.length ? comments.filter((comment) => nonDevAuthors.has(comment.authorId)).length / comments.length : 0,
    noteReferenceRate: comments.length ? comments.filter((comment) => comment.referencedNoteIds.length > 0).length / comments.length : 0,
    voluntaryVisitsPerWeek: eventCount("VOLUNTARY_VISIT"),
    decisionEvents: data.timeline.filter((event) => event.decisionType).length,
    shapedNodeCount: tasks.length,
    relationCount: tasks.filter((task) => task.parentId).length,
    templatedNodeCount: templatedTasks.length,
    activeFormFieldCount,
    mentionCount,
    mentionThreadCount,
    crossFunctionalThreadRate: comments.length ? crossFunctionalThreads / comments.length : 0,
    feedbackNodeRevisionRate: data.engagement.filter((event) => event.type === "NODE_UPDATED" && event.metadata.afterFeedback === true).length / Math.max(1, mentionThreadCount),
    voluntaryVisitCount: eventCount("VOLUNTARY_VISIT")
  };
}

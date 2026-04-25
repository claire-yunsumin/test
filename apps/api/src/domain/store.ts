import {
  type AppData,
  createSeedData,
  type Analytics,
  type ApprovalPolicy,
  type ApprovalPolicySnapshot,
  type EngagementEvent,
  type EngagementEventType,
  type InboxComponent,
  type Task,
  type FormFieldDefinition,
  type Template,
  type TemplateSnapshot,
  type TimelineEvent,
  type WorkflowSnapshot,
  DEFAULT_WORKFLOW_STATUSES,
  LEGACY_STATE_TO_STATUS_ID
} from "@hwe/shared";

const LEGACY_TASK_FILES_FIELD_KEY = "__task_files";

export function byId<T extends { id: string }>(rows: T[], id: string) {
  return rows.find((row) => row.id === id);
}

function stripLegacyFileFieldFromFormValues(values: Record<string, string>) {
  const next = { ...values };
  delete next[LEGACY_TASK_FILES_FIELD_KEY];
  return next;
}

function stripLegacyFileFieldsFromDefinition(fields: FormFieldDefinition[]) {
  return fields.filter((field) => field.type !== "FILE" && field.key !== LEGACY_TASK_FILES_FIELD_KEY);
}

function normalizeLegacyFileFields(source: AppData): AppData {
  source.tasks = source.tasks.map((task) => normalizeTaskRuntimeSnapshots({
    ...task,
    formValues: stripLegacyFileFieldFromFormValues(task.formValues)
  }, source));
  source.templates = source.templates.map((template) => ({
    ...template,
    lifecycleStatus: template.lifecycleStatus ?? "ACTIVE",
    purposeTag: template.purposeTag ?? null,
    successOutcome: template.successOutcome ?? null,
    fingerprint: template.fingerprint ?? null,
    formDefinition: stripLegacyFileFieldsFromDefinition(template.formDefinition)
  }));
  return source;
}

export let data: AppData = normalizeLegacyFileFields(createSeedData());

export function resetData() {
  data = normalizeLegacyFileFields(createSeedData());
}

export const now = () => new Date().toISOString();

function templateTransitions(template: Template | null): WorkflowSnapshot["transitions"] {
  if (template?.workflowSchema?.transitions?.length) return template.workflowSchema.transitions;
  return (template?.workflow ?? []).map((rule) => ({
    fromStatusId: LEGACY_STATE_TO_STATUS_ID[rule.from],
    toStatusId: LEGACY_STATE_TO_STATUS_ID[rule.to],
    label: rule.label,
    decisionType: rule.decisionType,
    isDecision: rule.isDecision
  }));
}

export function buildTemplateSnapshot(template: Template | null, capturedAt = now()): TemplateSnapshot | null {
  if (!template) return null;
  return {
    templateId: template.id,
    name: template.name,
    type: template.type,
    version: template.version,
    lifecycleStatus: template.lifecycleStatus ?? "ACTIVE",
    fingerprint: template.fingerprint ?? null,
    formDefinition: template.formDefinition.map((field) => ({ ...field })),
    inspectionCriteria: [...template.inspectionCriteria],
    capturedAt
  };
}

export function buildWorkflowSnapshot(template: Template | null, capturedAt = now()): WorkflowSnapshot {
  return {
    statuses: (template?.workflowSchema?.statuses ?? DEFAULT_WORKFLOW_STATUSES).map((status) => ({ ...status })),
    transitions: templateTransitions(template).map((transition) => ({
      ...transition,
      onEnter: transition.onEnter ? { ...transition.onEnter } : undefined,
      onExit: transition.onExit ? { ...transition.onExit } : undefined
    })),
    capturedAt
  };
}

export function buildApprovalPolicySnapshot(policy: ApprovalPolicy | null | undefined, capturedAt = now()): ApprovalPolicySnapshot | null {
  if (!policy) return null;
  return {
    policyId: policy.id,
    name: policy.name,
    mode: policy.mode,
    approverType: policy.approverType,
    approverRole: policy.approverRole,
    approverIds: policy.approverIds ? [...policy.approverIds] : undefined,
    minApprovals: policy.minApprovals,
    approvalLines: policy.approvalLines?.map((line) => ({ ...line, participantIds: [...line.participantIds] })),
    finalApproverId: policy.finalApproverId ?? null,
    capturedAt
  };
}

export function applyTaskSnapshots(task: Task, template: Template | null, policy: ApprovalPolicy | null | undefined, capturedAt = now()) {
  task.templateSnapshot = buildTemplateSnapshot(template, capturedAt);
  task.workflowSnapshot = buildWorkflowSnapshot(template, capturedAt);
  task.approvalPolicySnapshot = buildApprovalPolicySnapshot(policy, capturedAt);
  task.formSnapshot = {
    fields: (template?.formDefinition ?? []).map((field) => ({ ...field })),
    capturedAt
  };
}

function normalizeTaskRuntimeSnapshots(task: Task, source: AppData) {
  const template = task.templateId ? byId(source.templates, task.templateId) ?? null : null;
  const policy = task.approvalPolicyId ? byId(source.approvalPolicies, task.approvalPolicyId) : null;
  if (!task.workflowSnapshot) task.workflowSnapshot = buildWorkflowSnapshot(template, task.createdAt);
  if (task.templateId && !task.templateSnapshot) task.templateSnapshot = buildTemplateSnapshot(template, task.createdAt);
  if (!task.formSnapshot) task.formSnapshot = { fields: (template?.formDefinition ?? []).map((field) => ({ ...field })), capturedAt: task.createdAt };
  if (task.approvalPolicyId && !task.approvalPolicySnapshot) task.approvalPolicySnapshot = buildApprovalPolicySnapshot(policy, task.createdAt);
  return task;
}

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
  const row = {
    ...item,
    id: `inbox-${crypto.randomUUID()}`,
    readAt: item.readAt ?? null,
    ackAt: item.ackAt ?? null,
    remindCount: item.remindCount ?? 0,
    createdAt: now()
  };
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
  if (["APPROVAL_REQUESTED", "APPROVAL_APPROVED", "APPROVAL_REJECTED", "APPROVAL_SUPPLEMENT_REQUESTED"].includes(type)) return "DECISION";
  if (["COMMENT", "MENTION", "NOTE_UPDATED", "NOTE_REFERENCED"].includes(type)) return "DISCUSSION";
  if (["COMPLETED", "CANCELED"].includes(type)) return "RESULT";
  if (["TASK_CREATED", "STATE_TRANSITION", "TASK_TRANSITIONED", "HIERARCHY_CHANGE", "TEMPLATE_APPLIED", "TEMPLATE_REPLACED", "TEMPLATE_REMOVED", "TEMPLATE_SNAPSHOT_APPLIED"].includes(type)) return "AWARENESS";
  return "AWARENESS";
}

export function applyTemplate(task: Task, templateId: string) {
  const template = byId(data.templates, templateId);
  if (!template || !template.enabled) return null;
  const nextValues = stripLegacyFileFieldFromFormValues(task.formValues);
  const normalizedDefinition = stripLegacyFileFieldsFromDefinition(template.formDefinition);
  normalizedDefinition.forEach((field) => {
    nextValues[field.key] = nextValues[field.key] ?? "";
  });
  task.templateId = template.id;
  task.templateType = template.type;
  task.structureState = "TEMPLATED";
  task.formValues = nextValues;
  applyTaskSnapshots(task, template, task.approvalPolicyId ? byId(data.approvalPolicies, task.approvalPolicyId) : null);
  task.updatedAt = now();
  return template;
}

export function calculateAnalytics(): Analytics {
  const comments = data.comments;
  const notes = data.notes;
  const tasks = data.tasks;
  const inbox = data.inbox;
  const nowAt = Date.now();
  const weekAgo = nowAt - (7 * 24 * 60 * 60 * 1000);
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
  const weeklyVoluntaryVisits = data.engagement.filter((event) => {
    if (event.type !== "VOLUNTARY_VISIT") return false;
    return new Date(event.createdAt).getTime() >= weekAgo;
  }).length;
  const alarmEvents = inbox.length;
  const actionCount = data.engagement.filter((event) =>
    ["DECISION_TRANSITION", "COMMENT_CREATED", "NOTE_UPDATED", "MENTION_CREATED"].includes(event.type)
  ).length;
  const decisionRequested = data.timeline.filter((event) => event.type === "APPROVAL_REQUESTED").length;
  const decisionClosed = data.timeline.filter((event) =>
    event.type === "APPROVAL_APPROVED" || event.type === "APPROVAL_REJECTED"
  ).length;
  const templateTransitionEvents = data.timeline.filter((event) =>
    event.type === "TEMPLATE_APPLIED" || event.type === "TEMPLATE_REPLACED" || event.type === "TEMPLATE_REMOVED"
  );
  const successfulTemplateMappings = templateTransitionEvents.filter((event) => {
    const mapping = event.payload.statusMapping as { mappedStatusId?: string | null } | undefined;
    if (!mapping) return event.type === "TEMPLATE_REMOVED";
    return Boolean(mapping.mappedStatusId);
  }).length;
  const manualTemplateMappings = templateTransitionEvents.filter((event) => {
    const mapping = event.payload.statusMapping as { method?: string } | undefined;
    return mapping?.method === "manual_required";
  }).length;

  return {
    weeklyReturnRate: Math.min(1, eventCount("VOLUNTARY_VISIT") / Math.max(1, data.members.length)),
    weeklyVoluntaryReturnRate: Math.min(1, weeklyVoluntaryVisits / Math.max(1, data.members.length)),
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
    voluntaryVisitCount: eventCount("VOLUNTARY_VISIT"),
    alarmActionConversionRate: Math.min(1, actionCount / Math.max(1, alarmEvents)),
    decisionClosureRate: Math.min(1, decisionClosed / Math.max(1, decisionRequested)),
    templateStatusMappingSuccessRate: Math.min(1, successfulTemplateMappings / Math.max(1, templateTransitionEvents.length)),
    templateManualAdjustmentRate: Math.min(1, manualTemplateMappings / Math.max(1, templateTransitionEvents.length)),
    computedAt: now(),
    dataStatus: "ok"
  };
}

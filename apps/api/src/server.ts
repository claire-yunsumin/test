import express from "express";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  DEFAULT_WORKFLOW_STATUSES,
  LEGACY_STATE_TO_STATUS_ID,
  type ApprovalPolicy,
  type DecisionType,
  type Mention,
  type Note,
  type Task,
  type TaskAttachment,
  type TaskState,
  type Template,
  type ThreadComment,
  type WorkflowPhase
} from "@hwe/shared";
import { meId, authenticate, canEditForm, canEditTask, getVisibleTask, requireRole, validateMembers, validateMentions, validateNoteRefs, visibleTaskIdsFor } from "./http/access.js";
import { applySecurity, rateLimit } from "./http/security.js";
import { optionalText, text } from "./http/validation.js";
import { addEngagement, addInbox, addTimeline, applyTemplate, byId, calculateAnalytics, componentForEvent, data, now, serializeTask } from "./domain/store.js";

const port = Number(process.env.PORT ?? 4000);
const templateTypes = ["VISION", "AXIS", "OBJECTIVE", "KEYRESULT", "TASK"] as const;
const mentionSchema = z.object({
  type: z.enum(["MEMBER", "TASK", "FORM_FIELD", "NOTE"]),
  targetId: z.string(),
  label: text(1, 160),
  fieldKey: z.string().max(80).optional()
});

function normalizeMentions(mentions: Array<z.infer<typeof mentionSchema>>): Mention[] {
  return mentions.map((mention) => ({
    id: `mention-${crypto.randomUUID()}`,
    type: mention.type,
    targetId: mention.targetId,
    label: mention.label,
    fieldKey: mention.fieldKey
  }));
}

function noteRefsFromMentions(noteIds: string[], mentions: Mention[]) {
  return [...new Set([...noteIds, ...mentions.filter((mention) => mention.type === "NOTE").map((mention) => mention.targetId)])];
}

function approversByPolicy(policy: ApprovalPolicy) {
  const lineApprovers = (policy.approvalLines ?? []).flatMap((line) => line.participantIds);
  if (lineApprovers.length || policy.finalApproverId) {
    return new Set([...lineApprovers, policy.finalApproverId].filter((id): id is string => Boolean(id && byId(data.members, id))));
  }
  if (policy.approverType === "MEMBER") {
    return new Set((policy.approverIds ?? []).filter((id) => byId(data.members, id)));
  }
  const role = policy.approverRole ?? "OWNER";
  return new Set(data.members.filter((member) => member.role === role || member.role === "ADMIN" || member.role === "SUPER_ADMIN").map((member) => member.id));
}

function isAllowedTransition(fromState: TaskState, toState: TaskState, decisionType: DecisionType) {
  const rules: Array<{ from: TaskState; to: TaskState; decision: DecisionType }> = [
    { from: "DRAFT", to: "IN_PROGRESS", decision: "STATE_ONLY" },
    { from: "IN_PROGRESS", to: "IN_PROGRESS", decision: "SUPPLEMENT" },
    { from: "IN_PROGRESS", to: "CANCELED", decision: "REJECT" },
    { from: "IN_PROGRESS", to: "DONE", decision: "APPROVE" }
  ];
  return rules.some((rule) => rule.from === fromState && rule.to === toState && rule.decision === decisionType);
}

function stateFromStatusId(statusId: string): TaskState {
  const direct = (Object.entries(LEGACY_STATE_TO_STATUS_ID) as Array<[TaskState, string]>).find(([, value]) => value === statusId)?.[0];
  return direct ?? "IN_PROGRESS";
}

function phaseFromState(state: TaskState): WorkflowPhase {
  if (state === "DRAFT") return "BACKLOG";
  if (state === "DONE" || state === "CANCELED") return "CLOSED";
  return "ACTIVE";
}

function statusesForTemplate(template: Template | null) {
  const custom = template?.workflowSchema?.statuses ?? [];
  const merged = [...data.workflowStatuses, ...custom];
  const seen = new Set<string>();
  return merged.filter((status) => {
    if (seen.has(status.id)) return false;
    seen.add(status.id);
    return true;
  });
}

function transitionsForTemplate(template: Template | null) {
  if (template?.workflowSchema?.transitions?.length) {
    return template.workflowSchema.transitions.map((row) => ({
      ...row,
      onExit: {
        ...(row.onExit ?? {}),
        approvalGate: {
          enabled: row.onExit?.approvalGate?.enabled ?? false,
          policyId: row.onExit?.approvalGate?.policyId ?? null
        }
      }
    }));
  }
  return (template?.workflow ?? []).map((rule) => ({
    fromStatusId: LEGACY_STATE_TO_STATUS_ID[rule.from],
    toStatusId: LEGACY_STATE_TO_STATUS_ID[rule.to],
    label: rule.label,
    decisionType: rule.decisionType,
    isDecision: rule.isDecision,
    onEnter: {},
    onExit: {
      approvalGate: {
        enabled: rule.isDecision,
        policyId: null
      }
    }
  }));
}

function workflowTransitionRule(task: Task, toStatusId: string, decisionType: DecisionType) {
  const template = task.templateId ? byId(data.templates, task.templateId) ?? null : null;
  const fromStatusId = task.workflowStatusId ?? LEGACY_STATE_TO_STATUS_ID[task.currentState];
  const transitions = transitionsForTemplate(template);
  return transitions.find((row) => row.fromStatusId === fromStatusId && row.toStatusId === toStatusId && row.decisionType === decisionType) ?? null;
}

function isPendingApprovalStatus(task: Task, statusId: string) {
  const template = task.templateId ? byId(data.templates, task.templateId) ?? null : null;
  const status = statusesForTemplate(template).find((row) => row.id === statusId);
  return status?.category === "PENDING_APPROVAL";
}

function notifyMentions(req: express.Request, task: Task, mentions: Mention[], commentId: string) {
  const recipients = new Set<string>();
  mentions.forEach((mention) => {
    if (mention.type === "MEMBER") recipients.add(mention.targetId);
    if (mention.type === "TASK" || mention.type === "FORM_FIELD") {
      const target = byId(data.tasks, mention.targetId);
      if (target) [...target.assigneeIds, ...target.watcherIds, target.ownerId].forEach((id) => recipients.add(id));
    }
    if (mention.type === "NOTE") {
      const note = byId(data.notes, mention.targetId);
      const target = note ? byId(data.tasks, note.taskId) : null;
      if (target) [...target.assigneeIds, ...target.watcherIds, target.ownerId].forEach((id) => recipients.add(id));
    }
  });
  recipients.delete(meId(req));
  recipients.forEach((userId) => addInbox({
    userId,
    taskId: task.id,
    componentType: "DISCUSSION",
    eventType: "MENTION",
    title: "멘션된 논의",
    message: `${req.user!.name}: ${mentions.map((mention) => `@${mention.label}`).join(", ")}`,
    sourceUserId: meId(req),
    mentionCommentId: commentId
  }));
}

function referencingCommentExists(noteId: string) {
  return data.comments.some((comment) => comment.referencedNoteIds.includes(noteId) || comment.mentions.some((mention) => mention.type === "NOTE" && mention.targetId === noteId));
}

export function createApp() {
const app = express();
applySecurity(app);
app.use(rateLimit);
app.use(authenticate);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "hwe-api", time: now() });
});

app.get("/api/bootstrap", (req, res) => {
  const user = req.user!;
  const visibleIds = visibleTaskIdsFor(user);
  const tasks = data.tasks.filter((task) => visibleIds.has(task.id));
  const taskIds = new Set(tasks.map((task) => task.id));
  data.analytics = calculateAnalytics();
  res.json({
    ...data,
    me: user,
    tasks: tasks.map(serializeTask),
    attachments: data.attachments.filter((attachment) => taskIds.has(attachment.taskId)),
    notes: data.notes.filter((note) => taskIds.has(note.taskId)),
    comments: data.comments.filter((comment) => taskIds.has(comment.taskId)),
    timeline: data.timeline.filter((event) => taskIds.has(event.taskId)),
    inbox: data.inbox.filter((item) =>
      item.userId === user.id
      || item.sourceUserId === user.id
      || user.role === "ADMIN"
      || user.role === "SUPER_ADMIN"
    ),
    notificationSettings: data.notificationSettings.filter((row) => row.userId === user.id),
    webPushSubscriptions: data.webPushSubscriptions.filter((row) => row.userId === user.id)
  });
});

app.get("/api/me", (req, res) => {
  res.json(req.user);
});

app.get("/api/hierarchy", (req, res) => {
  const search = String(req.query.search ?? "").toLowerCase();
  const type = String(req.query.type ?? "ALL");
  const state = String(req.query.state ?? "ALL");
  const assignee = String(req.query.assignee ?? "ALL");
  const visibleIds = visibleTaskIdsFor(req.user!);
  const rows = data.tasks
    .filter((task) => visibleIds.has(task.id))
    .filter((task) => !search || `${task.title} ${task.description}`.toLowerCase().includes(search))
    .filter((task) => type === "ALL" || task.templateType === type)
    .filter((task) => state === "ALL" || task.currentState === state)
    .filter((task) => assignee === "ALL" || task.assigneeIds.includes(assignee))
    .map(serializeTask);

  res.json(rows);
});

app.get("/api/tasks", (req, res) => {
  const visibleIds = visibleTaskIdsFor(req.user!);
  res.json(data.tasks.filter((task) => visibleIds.has(task.id)).map(serializeTask));
});

app.get("/api/units", (_req, res) => {
  res.json(data.units);
});

app.post("/api/units", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const body = z.object({
    name: text(1, 60),
    purpose: optionalText(80),
    defaultApprovalPolicyId: z.string().nullable().optional(),
    notificationConfig: z.object({
      mentionEnabled: z.boolean(),
      approvalRequestEnabled: z.boolean(),
      dueSoonEnabled: z.boolean(),
      digestEnabled: z.boolean()
    }).optional()
  }).parse(req.body);
  if (body.defaultApprovalPolicyId && !byId(data.approvalPolicies, body.defaultApprovalPolicyId)) {
    res.status(400).json({ error: "INVALID_APPROVAL_POLICY", requestId: req.requestId });
    return;
  }
  if (body.defaultApprovalPolicyId) {
    const policy = byId(data.approvalPolicies, body.defaultApprovalPolicyId);
    if (policy?.unitId) {
      res.status(400).json({ error: "INVALID_APPROVAL_POLICY_SCOPE", requestId: req.requestId });
      return;
    }
  }
  const unit = {
    id: `unit-${crypto.randomUUID()}`,
    name: body.name.trim(),
    purpose: body.purpose?.trim() || "업무 목적 미정",
    defaultApprovalPolicyId: body.defaultApprovalPolicyId ?? null,
    notificationConfig: body.notificationConfig
  };
  data.units.push(unit);
  res.status(201).json(unit);
});

app.patch("/api/units/:unitId", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const unit = byId(data.units, req.params.unitId);
  if (!unit) return res.status(404).json({ error: "UNIT_NOT_FOUND", requestId: req.requestId });
  const body = z.object({
    name: optionalText(60),
    purpose: optionalText(80),
    defaultApprovalPolicyId: z.string().nullable().optional(),
    notificationConfig: z.object({
      mentionEnabled: z.boolean(),
      approvalRequestEnabled: z.boolean(),
      dueSoonEnabled: z.boolean(),
      digestEnabled: z.boolean()
    }).optional()
  }).parse(req.body);
  if (body.defaultApprovalPolicyId && !byId(data.approvalPolicies, body.defaultApprovalPolicyId)) {
    res.status(400).json({ error: "INVALID_APPROVAL_POLICY", requestId: req.requestId });
    return;
  }
  if (body.defaultApprovalPolicyId) {
    const policy = byId(data.approvalPolicies, body.defaultApprovalPolicyId);
    if (policy?.unitId && policy.unitId !== unit.id) {
      res.status(400).json({ error: "INVALID_APPROVAL_POLICY_SCOPE", requestId: req.requestId });
      return;
    }
  }
  if (body.name !== undefined) unit.name = body.name.trim();
  if (body.purpose !== undefined) unit.purpose = body.purpose.trim();
  if (body.defaultApprovalPolicyId !== undefined) unit.defaultApprovalPolicyId = body.defaultApprovalPolicyId;
  if (body.notificationConfig !== undefined) unit.notificationConfig = body.notificationConfig;
  res.json(unit);
});

app.delete("/api/units/:unitId", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const unit = byId(data.units, req.params.unitId);
  if (!unit) return res.status(404).json({ error: "UNIT_NOT_FOUND", requestId: req.requestId });
  const hasChildren = data.folders.some((folder) => folder.unitId === unit.id)
    || data.lists.some((list) => list.unitId === unit.id)
    || data.tasks.some((task) => task.unitId === unit.id)
    || data.unitMembers.some((row) => row.unitId === unit.id);
  if (hasChildren) {
    res.status(400).json({ error: "UNIT_NOT_EMPTY", requestId: req.requestId });
    return;
  }
  data.units = data.units.filter((row) => row.id !== unit.id);
  res.json({ ok: true, unitId: unit.id });
});

app.patch("/api/units/:unitId/members/:memberId", (req, res) => {
  const unit = byId(data.units, req.params.unitId);
  if (!unit) return res.status(404).json({ error: "UNIT_NOT_FOUND", requestId: req.requestId });
  const actorId = meId(req);
  const isAdmin = req.user?.role === "ADMIN" || req.user?.role === "SUPER_ADMIN";
  const isUnitOwner = data.unitMembers.some((row) => row.unitId === unit.id && row.memberId === actorId && row.role === "OWNER");
  if (!isAdmin && !isUnitOwner) {
    res.status(403).json({ error: "FORBIDDEN", requestId: req.requestId });
    return;
  }
  const body = z.object({ role: z.enum(["OWNER", "MEMBER"]) }).parse(req.body);
  const member = byId(data.members, req.params.memberId);
  if (!member) return res.status(404).json({ error: "MEMBER_NOT_FOUND", requestId: req.requestId });
  const row = data.unitMembers.find((item) => item.unitId === unit.id && item.memberId === member.id);
  if (!row) return res.status(404).json({ error: "UNIT_MEMBER_NOT_FOUND", requestId: req.requestId });
  row.role = body.role;
  res.json(row);
});

app.delete("/api/units/:unitId/members/:memberId", (req, res) => {
  const unit = byId(data.units, req.params.unitId);
  if (!unit) return res.status(404).json({ error: "UNIT_NOT_FOUND", requestId: req.requestId });
  const actorId = meId(req);
  const isAdmin = req.user?.role === "ADMIN" || req.user?.role === "SUPER_ADMIN";
  const isUnitOwner = data.unitMembers.some((row) => row.unitId === unit.id && row.memberId === actorId && row.role === "OWNER");
  if (!isAdmin && !isUnitOwner) {
    res.status(403).json({ error: "FORBIDDEN", requestId: req.requestId });
    return;
  }
  const member = byId(data.members, req.params.memberId);
  if (!member) return res.status(404).json({ error: "MEMBER_NOT_FOUND", requestId: req.requestId });
  const target = data.unitMembers.find((item) => item.unitId === unit.id && item.memberId === member.id);
  if (!target) return res.status(404).json({ error: "UNIT_MEMBER_NOT_FOUND", requestId: req.requestId });
  if (member.id === actorId && target.role === "OWNER") {
    res.status(400).json({ error: "CANNOT_REMOVE_SELF_OWNER", requestId: req.requestId });
    return;
  }
  data.unitMembers = data.unitMembers.filter((item) => !(item.unitId === unit.id && item.memberId === member.id));
  res.json({ ok: true, unitId: unit.id, memberId: member.id });
});

app.get("/api/folders", (req, res) => {
  const unitId = String(req.query.unitId ?? "");
  const rows = unitId ? data.folders.filter((folder) => folder.unitId === unitId) : data.folders;
  res.json(rows);
});

app.post("/api/folders", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const body = z.object({
    unitId: z.string(),
    name: text(1, 60)
  }).parse(req.body);
  if (!byId(data.units, body.unitId)) {
    res.status(400).json({ error: "INVALID_UNIT", requestId: req.requestId });
    return;
  }
  const folder = { id: `folder-${crypto.randomUUID()}`, unitId: body.unitId, name: body.name.trim() };
  data.folders.push(folder);
  res.status(201).json(folder);
});

app.get("/api/lists", (req, res) => {
  const unitId = String(req.query.unitId ?? "");
  const rows = unitId ? data.lists.filter((list) => list.unitId === unitId) : data.lists;
  res.json(rows);
});

app.get("/api/buckets", (req, res) => {
  const unitId = String(req.query.unitId ?? "");
  const listId = String(req.query.listId ?? "");
  const rows = data.buckets
    .filter((bucket) => !unitId || bucket.unitId === null || bucket.unitId === unitId)
    .filter((bucket) => !listId || bucket.listId === null || bucket.listId === listId)
    .sort((a, b) => a.order - b.order);
  res.json(rows);
});

app.post("/api/buckets", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const body = z.object({
    name: text(1, 40),
    unitId: z.string().nullable().optional(),
    listId: z.string().nullable().optional()
  }).parse(req.body);
  if (body.unitId && !byId(data.units, body.unitId)) {
    return res.status(400).json({ error: "INVALID_UNIT", requestId: req.requestId });
  }
  if (body.listId && !byId(data.lists, body.listId)) {
    return res.status(400).json({ error: "INVALID_LIST", requestId: req.requestId });
  }
  const bucket = {
    id: `bucket-${crypto.randomUUID()}`,
    name: body.name.trim(),
    unitId: body.unitId ?? null,
    listId: body.listId ?? null,
    order: data.buckets.length
  };
  data.buckets.push(bucket);
  res.status(201).json(bucket);
});

app.patch("/api/buckets/:bucketId", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const bucket = byId(data.buckets, req.params.bucketId);
  if (!bucket) return res.status(404).json({ error: "BUCKET_NOT_FOUND", requestId: req.requestId });
  const body = z.object({
    name: optionalText(40),
    order: z.number().int().min(0).max(10000).optional()
  }).parse(req.body);
  if (body.name !== undefined) bucket.name = body.name.trim();
  if (body.order !== undefined) bucket.order = body.order;
  res.json(bucket);
});

app.delete("/api/buckets/:bucketId", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const bucket = byId(data.buckets, req.params.bucketId);
  if (!bucket) return res.status(404).json({ error: "BUCKET_NOT_FOUND", requestId: req.requestId });
  data.buckets = data.buckets.filter((row) => row.id !== bucket.id);
  data.tasks = data.tasks.map((task) => (task.bucketId === bucket.id ? { ...task, bucketId: null } : task));
  res.json({ ok: true, bucketId: bucket.id });
});

app.post("/api/lists", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const body = z.object({
    unitId: z.string(),
    folderId: z.string().nullable().optional(),
    name: text(1, 60),
    defaultPhase: z.enum(["BACKLOG", "PLAN", "ACTIVE", "CLOSED"]).optional()
  }).parse(req.body);
  if (!byId(data.units, body.unitId)) {
    res.status(400).json({ error: "INVALID_UNIT", requestId: req.requestId });
    return;
  }
  if (body.folderId && !data.folders.some((folder) => folder.id === body.folderId && folder.unitId === body.unitId)) {
    res.status(400).json({ error: "INVALID_FOLDER", requestId: req.requestId });
    return;
  }
  const list = { id: `list-${crypto.randomUUID()}`, unitId: body.unitId, folderId: body.folderId ?? null, name: body.name.trim(), defaultPhase: body.defaultPhase ?? "BACKLOG" };
  data.lists.push(list);
  res.status(201).json(list);
});

app.patch("/api/lists/:listId", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const list = byId(data.lists, req.params.listId);
  if (!list) return res.status(404).json({ error: "LIST_NOT_FOUND", requestId: req.requestId });
  const body = z.object({
    name: optionalText(60),
    defaultPhase: z.enum(["BACKLOG", "PLAN", "ACTIVE", "CLOSED"]).optional()
  }).parse(req.body);
  if (body.name !== undefined) list.name = body.name.trim();
  if (body.defaultPhase !== undefined) list.defaultPhase = body.defaultPhase;
  res.json(list);
});

function removeTaskCascade(taskId: string): string[] {
  const descendantIds: string[] = data.tasks.filter((task) => task.parentId === taskId).flatMap((task): string[] => removeTaskCascade(task.id));
  const ids: string[] = [taskId, ...descendantIds];
  data.tasks = data.tasks.filter((task) => !ids.includes(task.id));
  data.notes = data.notes.filter((note) => !ids.includes(note.taskId));
  data.comments = data.comments.filter((comment) => !ids.includes(comment.taskId));
  data.timeline = data.timeline.filter((event) => !ids.includes(event.taskId));
  data.inbox = data.inbox.filter((item) => !ids.includes(item.taskId));
  data.attachments = data.attachments.filter((attachment) => !ids.includes(attachment.taskId));
  return ids;
}

app.post("/api/tasks", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const body = z
    .object({
      title: text(1, 120),
      parentId: z.string().nullable().optional(),
      templateId: z.string().nullable().optional(),
      templateType: z.enum(templateTypes).nullable().optional(),
      structureState: z.enum(["FREEFORM", "TEMPLATED"]).default("FREEFORM"),
      currentState: z.enum(["DRAFT", "IN_PROGRESS", "DONE", "CANCELED"]).optional(),
      workflowPhase: z.enum(["BACKLOG", "PLAN", "ACTIVE", "CLOSED"]).optional(),
      phaseOverride: z.enum(["BACKLOG", "PLAN", "ACTIVE", "CLOSED"]).nullable().optional(),
      workflowStatusId: z.string().optional(),
      tags: z.array(text(1, 30)).max(20).optional(),
      bucketId: z.string().nullable().optional(),
      approvalPolicyId: z.string().nullable().optional(),
      unitId: z.string().optional(),
      folderId: z.string().nullable().optional(),
      listId: z.string().optional()
    })
    .parse(req.body);

  if (body.parentId && !getVisibleTask(req, res, body.parentId)) return;
  const template = body.templateId ? byId(data.templates, body.templateId) : null;
  if (body.templateId && !template) {
    res.status(400).json({ error: "INVALID_TEMPLATE", requestId: req.requestId });
    return;
  }
  if (body.approvalPolicyId && !data.approvalPolicies.some((row) => row.id === body.approvalPolicyId && row.enabled)) {
    res.status(400).json({ error: "INVALID_APPROVAL_POLICY", requestId: req.requestId });
    return;
  }
  if (body.bucketId !== undefined && body.bucketId !== null && !byId(data.buckets, body.bucketId)) {
    res.status(400).json({ error: "INVALID_BUCKET", requestId: req.requestId });
    return;
  }

  const unitId = body.unitId ?? data.units[0]?.id;
  if (!unitId || !byId(data.units, unitId)) {
    res.status(400).json({ error: "INVALID_UNIT", requestId: req.requestId });
    return;
  }
  const list = body.listId
    ? data.lists.find((row) => row.id === body.listId && row.unitId === unitId)
    : data.lists.find((row) => row.unitId === unitId);
  if (!list) {
    res.status(400).json({ error: "INVALID_LIST", requestId: req.requestId });
    return;
  }
  if (body.folderId && !data.folders.some((folder) => folder.id === body.folderId && folder.unitId === unitId)) {
    res.status(400).json({ error: "INVALID_FOLDER", requestId: req.requestId });
    return;
  }
  if (body.folderId && list.folderId && body.folderId !== list.folderId) {
    res.status(400).json({ error: "FOLDER_LIST_MISMATCH", requestId: req.requestId });
    return;
  }

  const unitDefaultPolicyId = byId(data.units, unitId)?.defaultApprovalPolicyId ?? null;
  const initialState = body.currentState ?? "DRAFT";
  const initialStatusId = body.workflowStatusId ?? LEGACY_STATE_TO_STATUS_ID[initialState];
  const listDefaultPhase = list.defaultPhase ?? "BACKLOG";
  const initialPhase = body.phaseOverride ?? body.workflowPhase ?? listDefaultPhase ?? phaseFromState(initialState);
  const task: Task = {
    id: `task-${crypto.randomUUID()}`,
    unitId,
    folderId: body.folderId ?? list.folderId ?? null,
    listId: list.id,
    parentId: body.parentId ?? null,
    title: body.title,
    description: "",
    structureState: template || body.structureState === "TEMPLATED" ? "TEMPLATED" : "FREEFORM",
    templateType: template?.type ?? body.templateType ?? null,
    templateId: template?.id ?? null,
    currentState: stateFromStatusId(initialStatusId) ?? initialState,
    workflowStatusId: initialStatusId,
    workflowPhase: initialPhase,
    phaseOverride: body.phaseOverride ?? null,
    priority: "MEDIUM",
    ownerId: meId(req),
    assigneeIds: [meId(req)],
    watcherIds: [],
    dueDate: null,
    lastSeenAtByUser: {},
    approvalPolicyId: body.approvalPolicyId ?? unitDefaultPolicyId,
    updatedAt: now(),
    createdAt: now(),
    formValues: template ? Object.fromEntries(template.formDefinition.map((field) => [field.key, ""])) : {}
    ,
    tags: body.tags ?? []
    ,
    bucketId: body.bucketId ?? null,
    attachmentIds: []
  };

  data.tasks.unshift(task);
  addEngagement({ type: "NODE_CREATED", actorId: meId(req), taskId: task.id, metadata: { structureState: task.structureState } });
  if (template) addEngagement({ type: "TEMPLATE_APPLIED", actorId: meId(req), taskId: task.id, targetId: template.id, metadata: { fields: template.formDefinition.length } });
  addTimeline({
    taskId: task.id,
    type: "TASK_CREATED",
    actorId: meId(req),
    decisionType: null,
    reason: null,
    referencedNoteIds: [],
    payload: { title: task.title }
  });
  res.status(201).json(serializeTask(task));
});

app.get("/api/tasks/:taskId", (req, res) => {
  const task = getVisibleTask(req, res, req.params.taskId);
  if (!task) return;

	  task.lastSeenAtByUser[meId(req)] = now();
    addEngagement({ type: "VOLUNTARY_VISIT", actorId: meId(req), taskId: task.id, metadata: { source: "task-detail" } });
	  const visibleIds = visibleTaskIdsFor(req.user!);
	  res.json({
	    task: serializeTask(task),
	    parent: task.parentId ? serializeTask(byId(data.tasks, task.parentId)!) : null,
	    children: data.tasks.filter((row) => row.parentId === task.id).map(serializeTask),
      referenceableTasks: data.tasks.filter((row) => visibleIds.has(row.id)).map(serializeTask),
	    notes: data.notes.filter((note) => note.taskId === task.id),
      attachments: data.attachments.filter((attachment) => attachment.taskId === task.id),
	    referenceableNotes: data.notes.filter((note) => visibleIds.has(note.taskId)),
	    comments: data.comments.filter((comment) => comment.taskId === task.id),
	    timeline: data.timeline.filter((event) => event.taskId === task.id),
	    members: data.members,
      permissions: {
        canEditTask: canEditTask(req.user!),
        canEditForm: canEditForm(req.user!, task)
      }
  });
});

app.patch("/api/tasks/:taskId", (req, res) => {
  const task = getVisibleTask(req, res, req.params.taskId);
  if (!task) return;
  const patch = z
    .object({
      title: optionalText(120),
      description: optionalText(1200),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
      currentState: z.enum(["DRAFT", "IN_PROGRESS", "DONE", "CANCELED"]).optional(),
      workflowStatusId: z.string().optional(),
      workflowPhase: z.enum(["BACKLOG", "PLAN", "ACTIVE", "CLOSED"]).optional(),
      phaseOverride: z.enum(["BACKLOG", "PLAN", "ACTIVE", "CLOSED"]).nullable().optional(),
      parentId: z.string().nullable().optional(),
      templateId: z.string().nullable().optional(),
      templateType: z.enum(templateTypes).nullable().optional(),
      structureState: z.enum(["FREEFORM", "TEMPLATED"]).optional(),
      assigneeIds: z.array(z.string()).max(20).optional(),
      watcherIds: z.array(z.string()).max(50).optional(),
      dueDate: z.string().nullable().optional(),
      formValues: z.record(text(0, 1000)).optional(),
      tags: z.array(text(1, 30)).max(20).optional(),
      bucketId: z.string().nullable().optional(),
      approvalPolicyId: z.string().nullable().optional(),
      unitId: z.string().optional(),
      folderId: z.string().nullable().optional(),
      listId: z.string().optional()
    })
    .parse(req.body);

  const hasFormPatch = patch.formValues !== undefined || patch.description !== undefined;
  const hasTaskPatch = Object.keys(patch).some((key) => key !== "formValues" && key !== "description");
  if (hasTaskPatch && !requireRole(req, res, "MEMBER")) return;
  if (hasFormPatch && !canEditForm(req.user!, task)) {
    res.status(403).json({ error: "FORBIDDEN", requestId: req.requestId });
    return;
  }

  if (patch.assigneeIds && !validateMembers(patch.assigneeIds)) {
    res.status(400).json({ error: "INVALID_ASSIGNEE", requestId: req.requestId });
    return;
  }
  if (patch.watcherIds && !validateMembers(patch.watcherIds)) {
    res.status(400).json({ error: "INVALID_WATCHER", requestId: req.requestId });
    return;
  }
  if (patch.approvalPolicyId !== undefined && patch.approvalPolicyId !== null && !data.approvalPolicies.some((row) => row.id === patch.approvalPolicyId && row.enabled)) {
    res.status(400).json({ error: "INVALID_APPROVAL_POLICY", requestId: req.requestId });
    return;
  }
  if (patch.bucketId !== undefined && patch.bucketId !== null && !byId(data.buckets, patch.bucketId)) {
    res.status(400).json({ error: "INVALID_BUCKET", requestId: req.requestId });
    return;
  }
  if (patch.unitId && !byId(data.units, patch.unitId)) {
    res.status(400).json({ error: "INVALID_UNIT", requestId: req.requestId });
    return;
  }
  if (patch.unitId && patch.folderId && !data.folders.some((folder) => folder.id === patch.folderId && folder.unitId === patch.unitId)) {
    res.status(400).json({ error: "INVALID_FOLDER", requestId: req.requestId });
    return;
  }
  if (patch.folderId && !patch.unitId && !data.folders.some((folder) => folder.id === patch.folderId && folder.unitId === task.unitId)) {
    res.status(400).json({ error: "INVALID_FOLDER", requestId: req.requestId });
    return;
  }
  if (patch.listId) {
    const nextUnitId = patch.unitId ?? task.unitId;
    const list = data.lists.find((row) => row.id === patch.listId && row.unitId === nextUnitId);
    if (!list) {
      res.status(400).json({ error: "INVALID_LIST", requestId: req.requestId });
      return;
    }
    if (patch.folderId && list.folderId && patch.folderId !== list.folderId) {
      res.status(400).json({ error: "FOLDER_LIST_MISMATCH", requestId: req.requestId });
      return;
    }
    patch.unitId = list.unitId;
    patch.folderId = list.folderId;
  }
  if (patch.parentId !== undefined) {
    const previousParentId = task.parentId;
    if (patch.parentId === task.id) {
      res.status(400).json({ error: "INVALID_PARENT", requestId: req.requestId });
      return;
    }
    if (patch.parentId && !getVisibleTask(req, res, patch.parentId)) return;
    task.parentId = patch.parentId;
    addEngagement({ type: "PARENT_CHANGED", actorId: meId(req), taskId: task.id, targetId: patch.parentId ?? undefined, metadata: {} });
    addTimeline({
      taskId: task.id,
      type: "HIERARCHY_CHANGE",
      actorId: meId(req),
      decisionType: null,
      reason: "상위 구조 변경",
      referencedNoteIds: [],
      payload: { fromParentId: previousParentId, toParentId: patch.parentId }
    });
  }
  if (patch.templateId) {
    const template = applyTemplate(task, patch.templateId);
    if (!template) {
      res.status(400).json({ error: "INVALID_TEMPLATE", requestId: req.requestId });
      return;
    }
    addEngagement({ type: "TEMPLATE_APPLIED", actorId: meId(req), taskId: task.id, targetId: template.id, metadata: { fields: template.formDefinition.length } });
  }
  if (patch.templateId === null) {
    task.templateId = null;
    task.templateType = patch.templateType ?? task.templateType;
    task.structureState = "FREEFORM";
  }
  if (patch.structureState === "FREEFORM" && !patch.templateId) {
    task.structureState = "FREEFORM";
  }
  if (patch.templateType !== undefined && !patch.templateId) {
    task.templateType = patch.templateType;
  }
  if (patch.workflowStatusId !== undefined) {
    task.workflowStatusId = patch.workflowStatusId;
    task.currentState = stateFromStatusId(patch.workflowStatusId);
  } else if (patch.currentState !== undefined) {
    task.workflowStatusId = LEGACY_STATE_TO_STATUS_ID[patch.currentState];
  }
  if (patch.workflowPhase !== undefined) task.workflowPhase = patch.workflowPhase;
  if (patch.phaseOverride !== undefined) task.phaseOverride = patch.phaseOverride;
  const assignablePatch = { ...patch };
  delete assignablePatch.parentId;
  delete assignablePatch.templateId;
  delete assignablePatch.templateType;
  delete assignablePatch.structureState;
  delete assignablePatch.workflowStatusId;
  delete assignablePatch.workflowPhase;
  delete assignablePatch.phaseOverride;

  Object.assign(task, assignablePatch, { updatedAt: now() });
  addEngagement({ type: patch.formValues ? "FORM_SAVED" : "NODE_UPDATED", actorId: meId(req), taskId: task.id, metadata: { afterFeedback: Boolean(patch.formValues) } });
  addTimeline({
    taskId: task.id,
    type: "STATE_TRANSITION",
    actorId: meId(req),
    decisionType: "STATE_ONLY",
    reason: "태스크 필드 수정",
    referencedNoteIds: [],
    payload: { patch }
  });
  res.json(serializeTask(task));
});

app.delete("/api/tasks/:taskId", (req, res) => {
  const task = getVisibleTask(req, res, req.params.taskId);
  if (!task) return;
  const canDelete = req.user!.role === "ADMIN" || req.user!.role === "SUPER_ADMIN" || task.ownerId === meId(req);
  if (!canDelete) {
    res.status(403).json({ error: "FORBIDDEN", requestId: req.requestId });
    return;
  }
  const deletedIds = removeTaskCascade(task.id);
  res.json({ ok: true, deletedIds });
});

app.post("/api/tasks/:taskId/transition", (req, res) => {
  const task = getVisibleTask(req, res, req.params.taskId);
  if (!task) return;
  const body = z
    .object({
      toState: z.enum(["DRAFT", "IN_PROGRESS", "DONE", "CANCELED"]),
      toStatusId: z.string().optional(),
      decisionType: z.enum(["APPROVE", "REJECT", "SUPPLEMENT", "STATE_ONLY"]),
      reason: text(1, 1200),
      referencedNoteIds: z.array(z.string()).max(20).default([]),
      approvalPolicyId: z.string().nullable().optional()
    })
    .parse(req.body) as { toState: TaskState; toStatusId?: string; decisionType: DecisionType; reason: string; referencedNoteIds: string[]; approvalPolicyId?: string | null };

  const isDecision = body.decisionType !== "STATE_ONLY";
  if (!requireRole(req, res, isDecision ? "OWNER" : "MEMBER")) return;
	  if (!validateNoteRefs(req.user!, body.referencedNoteIds)) {
    res.status(400).json({ error: "INVALID_NOTE_REFERENCE", requestId: req.requestId });
    return;
  }

  const fromState = task.currentState;
  const targetStatusId = body.toStatusId ?? LEGACY_STATE_TO_STATUS_ID[body.toState];
  const targetState = stateFromStatusId(targetStatusId);
  const matchedWorkflowTransition = workflowTransitionRule(task, targetStatusId, body.decisionType);
  if (!matchedWorkflowTransition && !isAllowedTransition(fromState, body.toState, body.decisionType)) {
    res.status(400).json({ error: "INVALID_TRANSITION", requestId: req.requestId });
    return;
  }
  const unitDefaultPolicyId = byId(data.units, task.unitId)?.defaultApprovalPolicyId ?? undefined;
  const transitionApprovalEnabled = Boolean(matchedWorkflowTransition?.onExit?.approvalGate?.enabled);
  const transitionPolicyId = matchedWorkflowTransition?.onExit?.approvalGate?.policyId ?? undefined;
  const selectedPolicyId = body.approvalPolicyId !== undefined
    ? (body.approvalPolicyId ?? undefined)
    : (transitionPolicyId ?? task.approvalPolicyId ?? unitDefaultPolicyId ?? undefined);
  const selectedPolicy = selectedPolicyId ? byId(data.approvalPolicies, selectedPolicyId) : null;
  if (transitionApprovalEnabled && !selectedPolicyId) {
    res.status(400).json({ error: "APPROVAL_POLICY_REQUIRED", requestId: req.requestId });
    return;
  }
  if (selectedPolicyId && (!selectedPolicy || !selectedPolicy.enabled)) {
    res.status(400).json({ error: "INVALID_APPROVAL_POLICY", requestId: req.requestId });
    return;
  }
  if ((isDecision || transitionApprovalEnabled) && selectedPolicy) {
    const allowedApprovers = approversByPolicy(selectedPolicy);
    if (!allowedApprovers.has(meId(req))) {
      res.status(403).json({ error: "NOT_POLICY_APPROVER", requestId: req.requestId });
      return;
    }
  }
  if (body.approvalPolicyId !== undefined) {
    task.approvalPolicyId = body.approvalPolicyId;
  } else if (!task.approvalPolicyId && selectedPolicyId && isPendingApprovalStatus(task, targetStatusId)) {
    task.approvalPolicyId = selectedPolicyId;
  }
  task.currentState = targetState;
  task.workflowStatusId = targetStatusId;
  if (targetState === "DRAFT") task.workflowPhase = "BACKLOG";
  else if (targetState === "DONE" || targetState === "CANCELED") task.workflowPhase = "CLOSED";
  else if ((task.workflowPhase ?? "BACKLOG") === "BACKLOG") task.workflowPhase = "ACTIVE";
  task.updatedAt = now();

  const eventType = targetState === "DONE" ? "COMPLETED" : isPendingApprovalStatus(task, targetStatusId) ? "APPROVAL_REQUESTED" : "STATE_TRANSITION";
  const event = addTimeline({
    taskId: task.id,
    type: eventType,
    actorId: meId(req),
    decisionType: body.decisionType,
    reason: body.reason,
    referencedNoteIds: body.referencedNoteIds,
    payload: {
      fromState,
      toState: targetState,
      toStatusId: targetStatusId,
      transitionApprovalEnabled,
      transitionApprovalPolicyId: transitionPolicyId ?? null,
      approvalPolicyId: selectedPolicy?.id ?? null,
      approvalMode: selectedPolicy?.mode ?? null,
      approvalLineCount: selectedPolicy?.approvalLines?.length ?? 0,
      finalApproverId: selectedPolicy?.finalApproverId ?? null
    }
  });
  addEngagement({ type: "DECISION_TRANSITION", actorId: meId(req), taskId: task.id, metadata: { toState: targetState, toStatusId: targetStatusId, decisionType: body.decisionType } });

  const recipients = new Set([...task.assigneeIds, ...task.watcherIds]);
  if (isPendingApprovalStatus(task, targetStatusId)) {
    const approvers = selectedPolicy ? approversByPolicy(selectedPolicy) : new Set(data.members.filter((member) => ["OWNER", "ADMIN", "SUPER_ADMIN"].includes(member.role)).map((member) => member.id));
    approvers.forEach((id) => recipients.add(id));
  }
  recipients.delete(meId(req));
  recipients.forEach((userId) => {
    addInbox({
      userId,
      taskId: task.id,
      componentType: componentForEvent(event.type),
      eventType: event.type,
      title: body.decisionType === "STATE_ONLY" ? "상태 변경" : "결정 이벤트",
      message: `${task.title}: ${fromState} → ${targetState}`,
      sourceUserId: meId(req)
    });
  });

  res.json({ task: serializeTask(task), event });
});

app.get("/api/tasks/:taskId/attachments", (req, res) => {
  const task = getVisibleTask(req, res, req.params.taskId);
  if (!task) return;
  res.json(data.attachments.filter((attachment) => attachment.taskId === task.id));
});

app.post("/api/tasks/:taskId/attachments/file", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const task = getVisibleTask(req, res, req.params.taskId);
  if (!task) return;
  const body = z.object({
    name: text(1, 180),
    mimeType: z.string().max(120).optional(),
    size: z.number().int().min(0).max(50_000_000).optional(),
    contentDataUrl: z.string().max(2_000_000)
  }).parse(req.body);
  const attachment: TaskAttachment = {
    id: `att-${crypto.randomUUID()}`,
    taskId: task.id,
    kind: "FILE",
    name: body.name.trim(),
    mimeType: body.mimeType,
    size: body.size,
    contentDataUrl: body.contentDataUrl,
    createdBy: meId(req),
    createdAt: now()
  };
  data.attachments.unshift(attachment);
  task.attachmentIds = [...new Set([...(task.attachmentIds ?? []), attachment.id])];
  task.updatedAt = now();
  res.status(201).json(attachment);
});

app.post("/api/tasks/:taskId/attachments/link", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const task = getVisibleTask(req, res, req.params.taskId);
  if (!task) return;
  const body = z.object({
    name: text(1, 180),
    url: z.string().url(),
    provider: z.string().max(80).optional()
  }).parse(req.body);
  const attachment: TaskAttachment = {
    id: `att-${crypto.randomUUID()}`,
    taskId: task.id,
    kind: "LINK",
    name: body.name.trim(),
    url: body.url,
    provider: body.provider,
    createdBy: meId(req),
    createdAt: now()
  };
  data.attachments.unshift(attachment);
  task.attachmentIds = [...new Set([...(task.attachmentIds ?? []), attachment.id])];
  task.updatedAt = now();
  res.status(201).json(attachment);
});

app.delete("/api/tasks/:taskId/attachments/:attachmentId", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const task = getVisibleTask(req, res, req.params.taskId);
  if (!task) return;
  const attachment = byId(data.attachments, req.params.attachmentId);
  if (!attachment || attachment.taskId !== task.id) return res.status(404).json({ error: "ATTACHMENT_NOT_FOUND", requestId: req.requestId });
  data.attachments = data.attachments.filter((row) => row.id !== attachment.id);
  task.attachmentIds = (task.attachmentIds ?? []).filter((id) => id !== attachment.id);
  task.updatedAt = now();
  res.json({ ok: true, attachmentId: attachment.id });
});

app.post("/api/tasks/:taskId/notes", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const task = getVisibleTask(req, res, req.params.taskId);
  if (!task) return;
  const body = z.object({ title: text(1, 120), content: text(0, 5000).default("") }).parse(req.body);
  const note: Note = {
    id: `note-${crypto.randomUUID()}`,
    taskId: task.id,
    title: body.title,
    content: body.content,
    authorId: meId(req),
    lastEditorId: meId(req),
    attachments: [],
    createdAt: now(),
    updatedAt: now()
  };
  data.notes.unshift(note);
  addEngagement({ type: "NOTE_UPDATED", actorId: meId(req), taskId: task.id, targetId: note.id, metadata: { created: true } });
  addTimeline({
    taskId: task.id,
    type: "NOTE_UPDATED",
    actorId: meId(req),
    decisionType: null,
    reason: null,
    referencedNoteIds: [note.id],
    payload: { noteTitle: note.title }
  });
  res.status(201).json(note);
});

app.patch("/api/notes/:noteId", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const note = byId(data.notes, req.params.noteId);
  if (!note) return res.status(404).json({ error: "NOTE_NOT_FOUND", requestId: req.requestId });
  if (!getVisibleTask(req, res, note.taskId)) return;
  const body = z.object({ title: optionalText(120), content: optionalText(5000) }).parse(req.body);
  Object.assign(note, body, { lastEditorId: meId(req), updatedAt: now() });
  addEngagement({ type: "NOTE_UPDATED", actorId: meId(req), taskId: note.taskId, targetId: note.id, metadata: { afterMention: referencingCommentExists(note.id) } });

  const referencingAuthors = data.comments
    .filter((comment) => comment.referencedNoteIds.includes(note.id))
    .map((comment) => comment.authorId)
    .filter((id) => id !== meId(req));

  referencingAuthors.forEach((userId) => {
    addInbox({
      userId,
      taskId: note.taskId,
      componentType: "DISCUSSION",
      eventType: "NOTE_UPDATED",
      title: "참조한 노트가 수정됨",
      message: `${note.title} 노트가 업데이트되었습니다.`,
      sourceUserId: meId(req)
    });
  });

  addTimeline({
    taskId: note.taskId,
    type: "NOTE_UPDATED",
    actorId: meId(req),
    decisionType: null,
    reason: null,
    referencedNoteIds: [note.id],
    payload: { noteTitle: note.title }
  });
  res.json(note);
});

app.delete("/api/notes/:noteId", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const note = byId(data.notes, req.params.noteId);
  if (!note) return res.status(404).json({ error: "NOTE_NOT_FOUND", requestId: req.requestId });
  if (!getVisibleTask(req, res, note.taskId)) return;
  data.notes = data.notes.filter((row) => row.id !== note.id);
  data.comments.forEach((comment) => {
    comment.referencedNoteIds = comment.referencedNoteIds.filter((id) => id !== note.id);
  });
  addTimeline({
    taskId: note.taskId,
    type: "NOTE_UPDATED",
    actorId: meId(req),
    decisionType: null,
    reason: "노트 삭제",
    referencedNoteIds: [],
    payload: { noteTitle: note.title }
  });
  res.json({ ok: true, noteId: note.id });
});

app.post("/api/tasks/:taskId/comments", (req, res) => {
  const task = getVisibleTask(req, res, req.params.taskId);
  if (!task) return;
  const body = z.object({
    content: text(1, 2000),
    referencedNoteIds: z.array(z.string()).max(20).default([]),
    mentions: z.array(mentionSchema).max(30).default([])
  }).parse(req.body);
  const mentions = normalizeMentions(body.mentions);
  const referencedNoteIds = noteRefsFromMentions(body.referencedNoteIds, mentions);
	  if (!validateNoteRefs(req.user!, referencedNoteIds)) {
    res.status(400).json({ error: "INVALID_NOTE_REFERENCE", requestId: req.requestId });
    return;
  }
  if (!validateMentions(req.user!, mentions)) {
    res.status(400).json({ error: "INVALID_MENTION", requestId: req.requestId });
    return;
  }
  const comment: ThreadComment = {
    id: `comment-${crypto.randomUUID()}`,
    taskId: task.id,
    authorId: meId(req),
    content: body.content,
    referencedNoteIds,
    mentions,
    createdAt: now()
  };
  data.comments.push(comment);
  addEngagement({ type: "COMMENT_CREATED", actorId: meId(req), taskId: task.id, metadata: { mentions: mentions.length, crossFunctional: task.ownerId !== meId(req) } });
  mentions.forEach((mention) => addEngagement({ type: "MENTION_CREATED", actorId: meId(req), taskId: task.id, targetId: mention.targetId, metadata: { type: mention.type, fieldKey: mention.fieldKey ?? null } }));
  [...task.assigneeIds, ...task.watcherIds].filter((userId) => userId !== meId(req)).forEach((userId) => {
    addInbox({
      userId,
      taskId: task.id,
      componentType: "DISCUSSION",
      eventType: "COMMENT",
      title: "새 스레드 댓글",
      message: `${req.user!.name}: ${comment.content.slice(0, 80)}`,
      sourceUserId: meId(req),
      mentionCommentId: comment.id
    });
  });
  notifyMentions(req, task, mentions, comment.id);
  res.status(201).json(comment);
});

app.patch("/api/comments/:commentId", (req, res) => {
  const comment = byId(data.comments, req.params.commentId);
  if (!comment) return res.status(404).json({ error: "COMMENT_NOT_FOUND", requestId: req.requestId });
  const task = getVisibleTask(req, res, comment.taskId);
  if (!task) return;
  if (comment.authorId !== meId(req) && req.user!.role !== "ADMIN" && req.user!.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "FORBIDDEN", requestId: req.requestId });
    return;
  }
  const body = z.object({
    content: text(1, 2000),
    referencedNoteIds: z.array(z.string()).max(20).default([]),
    mentions: z.array(mentionSchema).max(30).default([])
  }).parse(req.body);
  const mentions = normalizeMentions(body.mentions);
  const referencedNoteIds = noteRefsFromMentions(body.referencedNoteIds, mentions);
	  if (!validateNoteRefs(req.user!, referencedNoteIds)) {
    res.status(400).json({ error: "INVALID_NOTE_REFERENCE", requestId: req.requestId });
    return;
  }
  if (!validateMentions(req.user!, mentions)) {
    res.status(400).json({ error: "INVALID_MENTION", requestId: req.requestId });
    return;
  }
  comment.content = body.content;
  comment.referencedNoteIds = referencedNoteIds;
  comment.mentions = mentions;
  notifyMentions(req, task, mentions, comment.id);
  res.json(comment);
});

app.delete("/api/comments/:commentId", (req, res) => {
  const comment = byId(data.comments, req.params.commentId);
  if (!comment) return res.status(404).json({ error: "COMMENT_NOT_FOUND", requestId: req.requestId });
  if (!getVisibleTask(req, res, comment.taskId)) return;
  if (comment.authorId !== meId(req) && req.user!.role !== "ADMIN" && req.user!.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "FORBIDDEN", requestId: req.requestId });
    return;
  }
  data.comments = data.comments.filter((row) => row.id !== comment.id);
  res.json({ ok: true, commentId: comment.id });
});

app.get("/api/inbox", (req, res) => {
  const component = String(req.query.componentType ?? "DECISION");
  const rows = data.inbox.filter((item) =>
    item.componentType === component
    && (item.userId === meId(req) || item.sourceUserId === meId(req) || req.user!.role === "ADMIN" || req.user!.role === "SUPER_ADMIN")
  );
  res.json(rows);
});

app.patch("/api/inbox/:itemId/read", (req, res) => {
  const item = byId(data.inbox, req.params.itemId);
  if (!item) return res.status(404).json({ error: "INBOX_ITEM_NOT_FOUND", requestId: req.requestId });
  if (item.userId !== meId(req) && req.user!.role !== "ADMIN" && req.user!.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "FORBIDDEN", requestId: req.requestId });
    return;
  }
  item.readAt = item.readAt ? null : now();
  res.json(item);
});

app.patch("/api/inbox/:itemId/ack", (req, res) => {
  const item = byId(data.inbox, req.params.itemId);
  if (!item) return res.status(404).json({ error: "INBOX_ITEM_NOT_FOUND", requestId: req.requestId });
  if (item.userId !== meId(req) && req.user!.role !== "ADMIN" && req.user!.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "FORBIDDEN", requestId: req.requestId });
    return;
  }
  if (!item.readAt) item.readAt = now();
  item.ackAt = item.ackAt ? null : now();
  res.json(item);
});

app.post("/api/inbox/:itemId/remind", (req, res) => {
  const item = byId(data.inbox, req.params.itemId);
  if (!item) return res.status(404).json({ error: "INBOX_ITEM_NOT_FOUND", requestId: req.requestId });
  if (item.sourceUserId !== meId(req) && req.user!.role !== "ADMIN" && req.user!.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "FORBIDDEN", requestId: req.requestId });
    return;
  }
  if (item.userId === meId(req) && req.user!.role !== "ADMIN" && req.user!.role !== "SUPER_ADMIN") {
    res.status(400).json({ error: "INVALID_REMIND_TARGET", requestId: req.requestId });
    return;
  }
  addInbox({
    userId: item.userId,
    taskId: item.taskId,
    componentType: item.componentType,
    eventType: item.eventType,
    title: `[리마인드] ${item.title}`,
    message: `${req.user!.name}님이 확인을 요청했습니다. ${item.message}`,
    sourceUserId: meId(req),
    mentionCommentId: item.mentionCommentId ?? null
  });
  item.remindCount = (item.remindCount ?? 0) + 1;
  res.json({ ok: true, itemId: item.id, remindCount: item.remindCount });
});

app.patch("/api/inbox/read-all", (req, res) => {
  const body = z.object({
    componentType: z.enum(["DECISION", "DISCUSSION", "AWARENESS", "RESULT"]).optional()
  }).parse(req.body ?? {});
  const me = meId(req);
  let changed = 0;
  data.inbox.forEach((item) => {
    const sameUser = item.userId === me || req.user!.role === "ADMIN" || req.user!.role === "SUPER_ADMIN";
    const sameType = !body.componentType || item.componentType === body.componentType;
    if (sameUser && sameType && !item.readAt) {
      item.readAt = now();
      changed += 1;
    }
  });
  res.json({ ok: true, changed });
});

app.get("/api/settings/notifications", (req, res) => {
  const me = meId(req);
  const existing = data.notificationSettings.find((row) => row.userId === me);
  if (existing) return res.json(existing);
  const fallback = {
    userId: me,
    emailEnabled: false,
    pushEnabled: true,
    webPushEnabled: false,
    digestEnabled: false,
    mutedComponents: [],
    mentionOnlyForWatchers: false,
    slaHours: 24
  };
  data.notificationSettings.push(fallback);
  res.json(fallback);
});

app.patch("/api/settings/notifications", (req, res) => {
  const me = meId(req);
  const body = z.object({
    emailEnabled: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    webPushEnabled: z.boolean().optional(),
    digestEnabled: z.boolean().optional(),
    mutedComponents: z.array(z.enum(["DECISION", "DISCUSSION", "AWARENESS", "RESULT"])).optional(),
    mentionOnlyForWatchers: z.boolean().optional(),
    slaHours: z.number().int().min(1).max(168).optional()
  }).parse(req.body);
  let row = data.notificationSettings.find((item) => item.userId === me);
  if (!row) {
    row = { userId: me, emailEnabled: false, pushEnabled: true, webPushEnabled: false, digestEnabled: false, mutedComponents: [], mentionOnlyForWatchers: false, slaHours: 24 };
    data.notificationSettings.push(row);
  }
  if (body.emailEnabled !== undefined) row.emailEnabled = body.emailEnabled;
  if (body.pushEnabled !== undefined) row.pushEnabled = body.pushEnabled;
  if (body.webPushEnabled !== undefined) row.webPushEnabled = body.webPushEnabled;
  if (body.digestEnabled !== undefined) row.digestEnabled = body.digestEnabled;
  if (body.mutedComponents !== undefined) row.mutedComponents = body.mutedComponents;
  if (body.mentionOnlyForWatchers !== undefined) row.mentionOnlyForWatchers = body.mentionOnlyForWatchers;
  if (body.slaHours !== undefined) row.slaHours = body.slaHours;
  res.json(row);
});

app.get("/api/push/subscriptions", (req, res) => {
  const me = meId(req);
  res.json(data.webPushSubscriptions.filter((row) => row.userId === me));
});

app.post("/api/push/subscriptions", (req, res) => {
  const me = meId(req);
  const body = z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1)
    }),
    userAgent: z.string().max(300).optional()
  }).parse(req.body);
  const existing = data.webPushSubscriptions.find((row) => row.userId === me && row.endpoint === body.endpoint);
  if (existing) {
    existing.p256dh = body.keys.p256dh;
    existing.auth = body.keys.auth;
    existing.userAgent = body.userAgent;
    existing.updatedAt = now();
    return res.json(existing);
  }
  const row = {
    id: `wps-${crypto.randomUUID()}`,
    userId: me,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    userAgent: body.userAgent,
    createdAt: now(),
    updatedAt: now()
  };
  data.webPushSubscriptions.unshift(row);
  res.status(201).json(row);
});

app.delete("/api/push/subscriptions", (req, res) => {
  const me = meId(req);
  const body = z.object({ endpoint: z.string().url().optional() }).parse(req.body ?? {});
  const before = data.webPushSubscriptions.length;
  data.webPushSubscriptions = data.webPushSubscriptions.filter((row) => {
    if (row.userId !== me) return true;
    if (!body.endpoint) return false;
    return row.endpoint !== body.endpoint;
  });
  res.json({ ok: true, removed: before - data.webPushSubscriptions.length });
});

app.get("/api/templates", (_req, res) => {
  res.json(data.templates);
});

app.get("/api/workflow/statuses", (_req, res) => {
  res.json(data.workflowStatuses);
});

app.patch("/api/workflow/statuses", (req, res) => {
  if (!requireRole(req, res, "ADMIN")) return;
  const body = z.object({
    statuses: z.array(z.object({
      id: z.string().min(1).max(80),
      name: text(1, 80),
      category: z.enum(["OPEN", "IN_PROGRESS", "PENDING_APPROVAL", "DONE", "CANCELED"]),
      isDefault: z.boolean().optional()
    })).min(1)
  }).parse(req.body);
  data.workflowStatuses = body.statuses;
  res.json(data.workflowStatuses);
});

app.post("/api/templates", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const body = z.object({
    name: text(1, 120),
    type: z.enum(templateTypes),
    enabled: z.boolean().default(true),
    formDefinition: z.array(z.object({
      key: z.string().min(1).max(80),
      label: z.string().min(1).max(120),
      type: z.enum(["TEXT", "LONG_TEXT", "NUMBER", "DATE", "SELECT", "FILE"]).default("TEXT"),
      required: z.boolean().default(false),
      helpText: z.string().max(240).optional(),
      options: z.array(z.string().max(80)).optional()
    })).max(20).default([]),
    inspectionCriteria: z.array(z.string().min(1).max(240)).max(20).default([])
  }).parse(req.body);
  const template: Template = {
    id: `tpl-${crypto.randomUUID()}`,
    name: body.name,
    type: body.type,
    version: 1,
    enabled: body.enabled,
    formDefinition: body.formDefinition,
    inspectionCriteria: body.inspectionCriteria,
    workflow: [
      { from: "DRAFT", to: "IN_PROGRESS", label: "시작", isDecision: false, decisionType: "STATE_ONLY" },
      { from: "IN_PROGRESS", to: "DONE", label: "완료", isDecision: body.type !== "TASK", decisionType: body.type === "TASK" ? "STATE_ONLY" : "APPROVE" }
    ]
  };
  data.templates.unshift(template);
  res.status(201).json(template);
});

app.patch("/api/templates/:templateId", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const template = byId(data.templates, req.params.templateId);
  if (!template) return res.status(404).json({ error: "TEMPLATE_NOT_FOUND", requestId: req.requestId });
  const body = z.object({
    name: optionalText(120),
    type: z.enum(templateTypes).optional(),
    enabled: z.boolean().optional(),
    formDefinition: z.array(z.object({
      key: z.string().min(1).max(80),
      label: z.string().min(1).max(120),
      type: z.enum(["TEXT", "LONG_TEXT", "NUMBER", "DATE", "SELECT", "FILE"]).default("TEXT"),
      required: z.boolean().default(false),
      helpText: z.string().max(240).optional(),
      options: z.array(z.string().max(80)).optional()
    })).max(20).optional(),
    inspectionCriteria: z.array(z.string().min(1).max(240)).max(20).optional()
  }).parse(req.body);
  Object.assign(template, body);
  template.version += 1;
  res.json(template);
});

app.patch("/api/templates/:templateId/workflow", (req, res) => {
  if (!requireRole(req, res, "MEMBER")) return;
  const template = byId(data.templates, req.params.templateId);
  if (!template) return res.status(404).json({ error: "TEMPLATE_NOT_FOUND", requestId: req.requestId });
  const body = z.object({
    statuses: z.array(z.object({
      id: z.string().min(1).max(80),
      name: text(1, 80),
      category: z.enum(["OPEN", "IN_PROGRESS", "PENDING_APPROVAL", "DONE", "CANCELED"]),
      isDefault: z.boolean().optional()
    })).min(1),
    transitions: z.array(z.object({
      fromStatusId: z.string().min(1).max(80),
      toStatusId: z.string().min(1).max(80),
      label: text(1, 80),
      decisionType: z.enum(["APPROVE", "REJECT", "SUPPLEMENT", "STATE_ONLY"]),
      isDecision: z.boolean(),
      onEnter: z.record(z.any()).optional(),
      onExit: z.object({
        approvalGate: z.object({
          enabled: z.boolean(),
          policyId: z.string().nullable().optional()
        }).optional()
      }).optional()
    })).min(1)
  }).parse(req.body);
  const allPolicyIds = [...new Set(body.transitions.flatMap((row) => {
    const ids: Array<string | null | undefined> = [row.onExit?.approvalGate?.policyId];
    return ids.filter((id): id is string => Boolean(id));
  }))];
  if (allPolicyIds.some((id) => !data.approvalPolicies.some((policy) => policy.id === id && policy.enabled))) {
    return res.status(400).json({ error: "INVALID_APPROVAL_POLICY", requestId: req.requestId });
  }
  template.workflowSchema = {
    statuses: body.statuses,
    transitions: body.transitions.map((row) => ({
      ...row,
      onExit: {
        ...(row.onExit ?? {}),
        approvalGate: {
          enabled: row.onExit?.approvalGate?.enabled ?? false,
          policyId: row.onExit?.approvalGate?.policyId ?? null
        }
      }
    }))
  };
  template.workflow = body.transitions.map((row) => ({
    from: stateFromStatusId(row.fromStatusId),
    to: stateFromStatusId(row.toStatusId),
    label: row.label,
    isDecision: row.isDecision,
    decisionType: row.decisionType
  }));
  template.version += 1;
  res.json(template);
});

app.delete("/api/templates/:templateId", (req, res) => {
  if (!requireRole(req, res, "ADMIN")) return;
  const template = byId(data.templates, req.params.templateId);
  if (!template) return res.status(404).json({ error: "TEMPLATE_NOT_FOUND", requestId: req.requestId });
  const inUse = data.tasks.some((task) => task.templateId === template.id);
  if (inUse) {
    template.enabled = false;
    template.version += 1;
    res.json({ ok: true, disabled: true, template });
    return;
  }
  data.templates = data.templates.filter((row) => row.id !== template.id);
  res.json({ ok: true, deleted: true, templateId: template.id });
});

app.get("/api/admin/approval-policies", (req, res) => {
  if (!requireRole(req, res, "ADMIN")) return;
  res.json(data.approvalPolicies);
});

app.post("/api/admin/approval-policies", (req, res) => {
  if (!requireRole(req, res, "ADMIN")) return;
  const approvalLineSchema = z.object({
    id: z.string().min(1).max(80).optional(),
    type: z.enum(["CONSENSUS", "APPROVAL"]),
    participantIds: z.array(z.string()).min(1).max(30),
    minApprovals: z.number().int().min(1).max(30).default(1)
  });
  const body = z.object({
    name: text(1, 120),
    description: optionalText(240),
    enabled: z.boolean().default(true),
    mode: z.enum(["SINGLE", "PARALLEL", "CONSENSUS"]).default("SINGLE"),
    approverType: z.enum(["ROLE", "MEMBER"]).default("ROLE"),
    approverRole: z.enum(["MEMBER", "OWNER", "ADMIN", "SUPER_ADMIN"]).optional(),
    approverIds: z.array(z.string()).max(30).default([]),
    minApprovals: z.number().int().min(1).max(30).default(1),
    approvalLines: z.array(approvalLineSchema).max(10).default([]),
    finalApproverId: z.string().nullable().optional(),
    unitId: z.string().nullable().optional()
  }).parse(req.body);
  if (body.unitId && !byId(data.units, body.unitId)) {
    return res.status(400).json({ error: "INVALID_UNIT", requestId: req.requestId });
  }
  if (body.approverType === "MEMBER" && !validateMembers(body.approverIds)) {
    res.status(400).json({ error: "INVALID_APPROVER", requestId: req.requestId });
    return;
  }
  if (body.approvalLines.some((line) => !validateMembers(line.participantIds))) {
    res.status(400).json({ error: "INVALID_APPROVAL_LINE_PARTICIPANT", requestId: req.requestId });
    return;
  }
  if (body.finalApproverId && !validateMembers([body.finalApproverId])) {
    res.status(400).json({ error: "INVALID_FINAL_APPROVER", requestId: req.requestId });
    return;
  }
  const policy: ApprovalPolicy = {
    id: `ap-${crypto.randomUUID()}`,
    name: body.name,
    unitId: body.unitId ?? null,
    description: body.description ?? undefined,
    enabled: body.enabled,
    mode: body.mode,
    approverType: body.approverType,
    approverRole: body.approverType === "ROLE" ? (body.approverRole ?? "OWNER") : undefined,
    approverIds: body.approverType === "MEMBER" ? body.approverIds : [],
    minApprovals: body.minApprovals,
    approvalLines: body.approvalLines.map((line) => ({
      id: line.id ?? `line-${crypto.randomUUID()}`,
      type: line.type,
      participantIds: line.participantIds,
      minApprovals: line.minApprovals
    })),
    finalApproverId: body.finalApproverId ?? null,
    createdAt: now(),
    updatedAt: now()
  };
  data.approvalPolicies.unshift(policy);
  res.status(201).json(policy);
});

app.patch("/api/admin/approval-policies/:policyId", (req, res) => {
  if (!requireRole(req, res, "ADMIN")) return;
  const policy = byId(data.approvalPolicies, req.params.policyId);
  if (!policy) return res.status(404).json({ error: "APPROVAL_POLICY_NOT_FOUND", requestId: req.requestId });
  const approvalLineSchema = z.object({
    id: z.string().min(1).max(80).optional(),
    type: z.enum(["CONSENSUS", "APPROVAL"]),
    participantIds: z.array(z.string()).min(1).max(30),
    minApprovals: z.number().int().min(1).max(30).default(1)
  });
  const body = z.object({
    name: optionalText(120),
    description: optionalText(240),
    enabled: z.boolean().optional(),
    mode: z.enum(["SINGLE", "PARALLEL", "CONSENSUS"]).optional(),
    approverType: z.enum(["ROLE", "MEMBER"]).optional(),
    approverRole: z.enum(["MEMBER", "OWNER", "ADMIN", "SUPER_ADMIN"]).optional(),
    approverIds: z.array(z.string()).max(30).optional(),
    minApprovals: z.number().int().min(1).max(30).optional(),
    approvalLines: z.array(approvalLineSchema).max(10).optional(),
    finalApproverId: z.string().nullable().optional(),
    unitId: z.string().nullable().optional()
  }).parse(req.body);
  if (body.unitId && !byId(data.units, body.unitId)) {
    return res.status(400).json({ error: "INVALID_UNIT", requestId: req.requestId });
  }
  if (body.approverIds && !validateMembers(body.approverIds)) {
    res.status(400).json({ error: "INVALID_APPROVER", requestId: req.requestId });
    return;
  }
  if (body.approvalLines && body.approvalLines.some((line) => !validateMembers(line.participantIds))) {
    res.status(400).json({ error: "INVALID_APPROVAL_LINE_PARTICIPANT", requestId: req.requestId });
    return;
  }
  if (body.finalApproverId && !validateMembers([body.finalApproverId])) {
    res.status(400).json({ error: "INVALID_FINAL_APPROVER", requestId: req.requestId });
    return;
  }
  Object.assign(policy, body, { updatedAt: now() });
  if ((body.approverType ?? policy.approverType) === "ROLE") {
    policy.approverRole = body.approverRole ?? policy.approverRole ?? "OWNER";
    policy.approverIds = [];
  } else {
    policy.approverIds = body.approverIds ?? policy.approverIds ?? [];
    policy.approverRole = undefined;
  }
  if (body.approvalLines) {
    policy.approvalLines = body.approvalLines.map((line) => ({
      id: line.id ?? `line-${crypto.randomUUID()}`,
      type: line.type,
      participantIds: line.participantIds,
      minApprovals: line.minApprovals
    }));
  }
  if (body.finalApproverId !== undefined) {
    policy.finalApproverId = body.finalApproverId;
  }
  if (body.unitId !== undefined) {
    policy.unitId = body.unitId;
  }
  res.json(policy);
});

app.get("/api/admin/members", (_req, res) => {
  if (!requireRole(_req, res, "ADMIN")) return;
  res.json(data.members);
});

app.post("/api/admin/invitations", (req, res) => {
  const body = z.object({
    email: z.string().email().max(254).toLowerCase(),
    role: z.enum(["MEMBER", "OWNER", "ADMIN", "SUPER_ADMIN"]),
    unitId: z.string().optional(),
    unitMemberRole: z.enum(["OWNER", "MEMBER"]).optional()
  }).parse(req.body);
  const invitedUnit = body.unitId ? byId(data.units, body.unitId) : null;
  if (body.unitId && !invitedUnit) {
    res.status(400).json({ error: "INVALID_UNIT", requestId: req.requestId });
    return;
  }
  const userId = meId(req);
  const isAdmin = req.user?.role === "ADMIN" || req.user?.role === "SUPER_ADMIN";
  const isUnitOwner = Boolean(body.unitId && data.unitMembers.some((row) => row.unitId === body.unitId && row.memberId === userId && row.role === "OWNER"));
  const canInvite = body.unitId ? isAdmin || isUnitOwner : isAdmin;
  if (!canInvite) {
    res.status(403).json({ error: "FORBIDDEN", requestId: req.requestId });
    return;
  }
  if (!isAdmin && (body.role === "ADMIN" || body.role === "SUPER_ADMIN")) {
    res.status(403).json({ error: "FORBIDDEN", requestId: req.requestId });
    return;
  }
  const existingMember = data.members.find((row) => row.email.toLowerCase() === body.email.toLowerCase());
  const member = existingMember ?? {
    id: `u-${crypto.randomUUID()}`,
    name: body.email.split("@")[0],
    email: body.email,
    role: body.role,
    unit: invitedUnit?.name ?? "초대됨"
  };
  if (!existingMember) data.members.push(member);
  if (invitedUnit) {
    const alreadyJoined = data.unitMembers.find((row) => row.unitId === invitedUnit.id && row.memberId === member.id);
    if (!alreadyJoined) {
      data.unitMembers.push({
        id: `um-${crypto.randomUUID()}`,
        unitId: invitedUnit.id,
        memberId: member.id,
        role: body.unitMemberRole ?? "MEMBER"
      });
    }
  }
  res.status(201).json({ member, inviteUrl: `/invitations/accept?token=demo-${crypto.randomUUID()}` });
});

app.patch("/api/admin/members/:memberId", (req, res) => {
  if (!requireRole(req, res, "ADMIN")) return;
  const member = byId(data.members, req.params.memberId);
  if (!member) {
    res.status(404).json({ error: "MEMBER_NOT_FOUND", requestId: req.requestId });
    return;
  }
  const body = z.object({ role: z.enum(["MEMBER", "OWNER", "ADMIN", "SUPER_ADMIN"]) }).parse(req.body);
  if (member.id === meId(req) && body.role !== "ADMIN" && body.role !== "SUPER_ADMIN") {
    res.status(400).json({ error: "CANNOT_DEMOTE_SELF", requestId: req.requestId });
    return;
  }
  member.role = body.role;
  res.json(member);
});

app.delete("/api/admin/members/:memberId", (req, res) => {
  if (!requireRole(req, res, "ADMIN")) return;
  const member = byId(data.members, req.params.memberId);
  if (!member) {
    res.status(404).json({ error: "MEMBER_NOT_FOUND", requestId: req.requestId });
    return;
  }
  if (member.id === meId(req)) {
    res.status(400).json({ error: "CANNOT_REMOVE_SELF", requestId: req.requestId });
    return;
  }
  data.members = data.members.filter((row) => row.id !== member.id);
  data.tasks.forEach((task) => {
    task.assigneeIds = task.assigneeIds.filter((id) => id !== member.id);
    task.watcherIds = task.watcherIds.filter((id) => id !== member.id);
  });
  data.inbox = data.inbox.filter((item) => item.userId !== member.id);
  res.json({ ok: true, memberId: member.id });
});

app.get("/api/analytics/retention", (_req, res) => {
  if (!requireRole(_req, res, "ADMIN")) return;
  data.analytics = calculateAnalytics();
  res.json(data.analytics);
});

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: "VALIDATION_ERROR", issues: err.issues.map((issue) => issue.path.join(".")), requestId: req.requestId });
    return;
  }
  if (err instanceof Error && err.message === "Origin not allowed") {
    res.status(403).json({ error: "ORIGIN_NOT_ALLOWED", requestId: req.requestId });
    return;
  }
  res.status(500).json({ error: "INTERNAL_ERROR", requestId: req.requestId });
});

return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createApp().listen(port, () => {
    process.stdout.write(`HWE API listening on http://localhost:${port}\n`);
  });
}

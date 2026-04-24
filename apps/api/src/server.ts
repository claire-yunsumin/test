import express from "express";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  type DecisionType,
  type Mention,
  type Note,
  type Task,
  type TaskState,
  type Template,
  type ThreadComment
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

function notifyMentions(req: express.Request, task: Task, mentions: Mention[]) {
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
    message: `${req.user!.name}: ${mentions.map((mention) => `@${mention.label}`).join(", ")}`
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
    notes: data.notes.filter((note) => taskIds.has(note.taskId)),
    comments: data.comments.filter((comment) => taskIds.has(comment.taskId)),
    timeline: data.timeline.filter((event) => taskIds.has(event.taskId)),
    inbox: data.inbox.filter((item) => item.userId === user.id || user.role === "ADMIN")
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

function removeTaskCascade(taskId: string): string[] {
  const descendantIds: string[] = data.tasks.filter((task) => task.parentId === taskId).flatMap((task): string[] => removeTaskCascade(task.id));
  const ids: string[] = [taskId, ...descendantIds];
  data.tasks = data.tasks.filter((task) => !ids.includes(task.id));
  data.notes = data.notes.filter((note) => !ids.includes(note.taskId));
  data.comments = data.comments.filter((comment) => !ids.includes(comment.taskId));
  data.timeline = data.timeline.filter((event) => !ids.includes(event.taskId));
  data.inbox = data.inbox.filter((item) => !ids.includes(item.taskId));
  return ids;
}

app.post("/api/tasks", (req, res) => {
  if (!requireRole(req, res, "EDITOR")) return;
  const body = z
    .object({
      title: text(1, 120),
      parentId: z.string().nullable().optional(),
      templateId: z.string().nullable().optional(),
      templateType: z.enum(templateTypes).nullable().optional(),
      structureState: z.enum(["FREEFORM", "TEMPLATED"]).default("FREEFORM")
    })
    .parse(req.body);

  if (body.parentId && !getVisibleTask(req, res, body.parentId)) return;
  const template = body.templateId ? byId(data.templates, body.templateId) : null;
  if (body.templateId && !template) {
    res.status(400).json({ error: "INVALID_TEMPLATE", requestId: req.requestId });
    return;
  }

  const task: Task = {
    id: `task-${crypto.randomUUID()}`,
    parentId: body.parentId ?? null,
    title: body.title,
    description: "",
    structureState: template || body.structureState === "TEMPLATED" ? "TEMPLATED" : "FREEFORM",
    templateType: template?.type ?? body.templateType ?? null,
    templateId: template?.id ?? null,
    currentState: "DRAFT",
    priority: "MEDIUM",
    ownerId: meId(req),
    assigneeIds: [meId(req)],
    watcherIds: [],
    dueDate: null,
    lastSeenAtByUser: {},
    updatedAt: now(),
    createdAt: now(),
    formValues: template ? Object.fromEntries(template.formDefinition.map((field) => [field.key, ""])) : {}
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
      currentState: z.enum(["DRAFT", "IN_PROGRESS", "PENDING_APPROVAL", "DONE", "CANCELED"]).optional(),
      parentId: z.string().nullable().optional(),
      templateId: z.string().nullable().optional(),
      templateType: z.enum(templateTypes).nullable().optional(),
      structureState: z.enum(["FREEFORM", "TEMPLATED"]).optional(),
      assigneeIds: z.array(z.string()).max(20).optional(),
      watcherIds: z.array(z.string()).max(50).optional(),
      dueDate: z.string().nullable().optional(),
      formValues: z.record(text(0, 1000)).optional()
    })
    .parse(req.body);

  const hasFormPatch = patch.formValues !== undefined;
  const hasTaskPatch = Object.keys(patch).some((key) => key !== "formValues");
  if (hasTaskPatch && !requireRole(req, res, "EDITOR")) return;
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
  if (patch.parentId !== undefined) {
    if (patch.parentId === task.id) {
      res.status(400).json({ error: "INVALID_PARENT", requestId: req.requestId });
      return;
    }
    if (patch.parentId && !getVisibleTask(req, res, patch.parentId)) return;
    task.parentId = patch.parentId;
    addEngagement({ type: "PARENT_CHANGED", actorId: meId(req), taskId: task.id, targetId: patch.parentId ?? undefined, metadata: {} });
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
  const assignablePatch = { ...patch };
  delete assignablePatch.parentId;
  delete assignablePatch.templateId;
  delete assignablePatch.templateType;
  delete assignablePatch.structureState;

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
  const canDelete = req.user!.role === "ADMIN" || task.ownerId === meId(req);
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
      toState: z.enum(["DRAFT", "IN_PROGRESS", "PENDING_APPROVAL", "DONE", "CANCELED"]),
      decisionType: z.enum(["APPROVE", "REJECT", "SUPPLEMENT", "STATE_ONLY"]),
      reason: text(1, 1200),
      referencedNoteIds: z.array(z.string()).max(20).default([])
    })
    .parse(req.body) as { toState: TaskState; decisionType: DecisionType; reason: string; referencedNoteIds: string[] };

  const isDecision = body.decisionType !== "STATE_ONLY";
  if (!requireRole(req, res, isDecision ? "APPROVER" : "EDITOR")) return;
	  if (!validateNoteRefs(req.user!, body.referencedNoteIds)) {
    res.status(400).json({ error: "INVALID_NOTE_REFERENCE", requestId: req.requestId });
    return;
  }

  const fromState = task.currentState;
  task.currentState = body.toState;
  task.updatedAt = now();

  const eventType = body.toState === "DONE" ? "COMPLETED" : body.toState === "PENDING_APPROVAL" ? "APPROVAL_REQUESTED" : "STATE_TRANSITION";
  const event = addTimeline({
    taskId: task.id,
    type: eventType,
    actorId: meId(req),
    decisionType: body.decisionType,
    reason: body.reason,
    referencedNoteIds: body.referencedNoteIds,
    payload: { fromState, toState: body.toState }
  });
  addEngagement({ type: "DECISION_TRANSITION", actorId: meId(req), taskId: task.id, metadata: { toState: body.toState, decisionType: body.decisionType } });

  const recipients = new Set([...task.assigneeIds, ...task.watcherIds]);
  if (body.toState === "PENDING_APPROVAL") data.members.filter((member) => ["APPROVER", "ADMIN"].includes(member.role)).forEach((member) => recipients.add(member.id));
  recipients.delete(meId(req));
  recipients.forEach((userId) => {
    addInbox({
      userId,
      taskId: task.id,
      componentType: componentForEvent(event.type),
      eventType: event.type,
      title: body.decisionType === "STATE_ONLY" ? "상태 변경" : "결정 이벤트",
      message: `${task.title}: ${fromState} → ${body.toState}`
    });
  });

  res.json({ task: serializeTask(task), event });
});

app.post("/api/tasks/:taskId/notes", (req, res) => {
  if (!requireRole(req, res, "EDITOR")) return;
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
  if (!requireRole(req, res, "EDITOR")) return;
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
      message: `${note.title} 노트가 업데이트되었습니다.`
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
  if (!requireRole(req, res, "EDITOR")) return;
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
      message: `${req.user!.name}: ${comment.content.slice(0, 80)}`
    });
  });
  notifyMentions(req, task, mentions);
  res.status(201).json(comment);
});

app.patch("/api/comments/:commentId", (req, res) => {
  const comment = byId(data.comments, req.params.commentId);
  if (!comment) return res.status(404).json({ error: "COMMENT_NOT_FOUND", requestId: req.requestId });
  const task = getVisibleTask(req, res, comment.taskId);
  if (!task) return;
  if (comment.authorId !== meId(req) && req.user!.role !== "ADMIN") {
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
  notifyMentions(req, task, mentions);
  res.json(comment);
});

app.delete("/api/comments/:commentId", (req, res) => {
  const comment = byId(data.comments, req.params.commentId);
  if (!comment) return res.status(404).json({ error: "COMMENT_NOT_FOUND", requestId: req.requestId });
  if (!getVisibleTask(req, res, comment.taskId)) return;
  if (comment.authorId !== meId(req) && req.user!.role !== "ADMIN") {
    res.status(403).json({ error: "FORBIDDEN", requestId: req.requestId });
    return;
  }
  data.comments = data.comments.filter((row) => row.id !== comment.id);
  res.json({ ok: true, commentId: comment.id });
});

app.get("/api/inbox", (req, res) => {
  const component = String(req.query.componentType ?? "DECISION");
  const rows = data.inbox.filter((item) => item.componentType === component && (item.userId === meId(req) || req.user!.role === "ADMIN"));
  res.json(rows);
});

app.patch("/api/inbox/:itemId/read", (req, res) => {
  const item = byId(data.inbox, req.params.itemId);
  if (!item) return res.status(404).json({ error: "INBOX_ITEM_NOT_FOUND", requestId: req.requestId });
  if (item.userId !== meId(req) && req.user!.role !== "ADMIN") {
    res.status(403).json({ error: "FORBIDDEN", requestId: req.requestId });
    return;
  }
  item.readAt = item.readAt ? null : now();
  res.json(item);
});

app.get("/api/templates", (_req, res) => {
  res.json(data.templates);
});

app.post("/api/templates", (req, res) => {
  if (!requireRole(req, res, "EDITOR")) return;
  const body = z.object({
    name: text(1, 120),
    type: z.enum(templateTypes),
    enabled: z.boolean().default(true),
    formDefinition: z.array(z.object({
      key: z.string().min(1).max(80),
      label: z.string().min(1).max(120),
      type: z.enum(["TEXT", "LONG_TEXT", "NUMBER", "DATE", "SELECT"]).default("TEXT"),
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
  if (!requireRole(req, res, "EDITOR")) return;
  const template = byId(data.templates, req.params.templateId);
  if (!template) return res.status(404).json({ error: "TEMPLATE_NOT_FOUND", requestId: req.requestId });
  const body = z.object({
    name: optionalText(120),
    type: z.enum(templateTypes).optional(),
    enabled: z.boolean().optional(),
    formDefinition: z.array(z.object({
      key: z.string().min(1).max(80),
      label: z.string().min(1).max(120),
      type: z.enum(["TEXT", "LONG_TEXT", "NUMBER", "DATE", "SELECT"]).default("TEXT"),
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

app.get("/api/admin/members", (_req, res) => {
  if (!requireRole(_req, res, "ADMIN")) return;
  res.json(data.members);
});

app.post("/api/admin/invitations", (req, res) => {
  if (!requireRole(req, res, "ADMIN")) return;
  const body = z.object({ email: z.string().email().max(254).toLowerCase(), role: z.enum(["VIEWER", "EDITOR", "APPROVER", "ADMIN"]) }).parse(req.body);
  const member = {
    id: `u-${crypto.randomUUID()}`,
    name: body.email.split("@")[0],
    email: body.email,
    role: body.role,
    unit: "초대됨"
  };
  data.members.push(member);
  res.status(201).json({ member, inviteUrl: `/invitations/accept?token=demo-${crypto.randomUUID()}` });
});

app.patch("/api/admin/members/:memberId", (req, res) => {
  if (!requireRole(req, res, "ADMIN")) return;
  const member = byId(data.members, req.params.memberId);
  if (!member) {
    res.status(404).json({ error: "MEMBER_NOT_FOUND", requestId: req.requestId });
    return;
  }
  const body = z.object({ role: z.enum(["VIEWER", "EDITOR", "APPROVER", "ADMIN"]) }).parse(req.body);
  if (member.id === meId(req) && body.role !== "ADMIN") {
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

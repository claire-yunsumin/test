import type { NextFunction, Request, Response } from "express";
import type { Member, Mention, Role } from "@hwe/shared";
import type { Task } from "@hwe/shared";
import { byId, data } from "../domain/store.js";

declare global {
  namespace Express {
    interface Request {
      user?: Member;
      requestId?: string;
    }
  }
}

export const publicRoutes = new Set(["/health"]);

export function meId(req: Request) {
  return req.user?.id ?? data.me.id;
}

export function isRoleAtLeast(role: Role, required: Role) {
  const order: Role[] = ["MEMBER", "OWNER", "ADMIN", "SUPER_ADMIN"];
  return order.indexOf(role) >= order.indexOf(required);
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  if (publicRoutes.has(req.path)) {
    next();
    return;
  }

  const requestedUserId = String(req.headers["x-demo-user-id"] ?? data.me.id);
  const user = byId(data.members, requestedUserId);
  if (!user) {
    res.status(401).json({ error: "UNAUTHORIZED", requestId: req.requestId });
    return;
  }
  req.user = user;
  next();
}

export function requireRole(req: Request, res: Response, required: Role) {
  if (!req.user || !isRoleAtLeast(req.user.role, required)) {
    res.status(403).json({ error: "FORBIDDEN", requestId: req.requestId });
    return false;
  }
  return true;
}

export function canEditTask(user: Member, task: Task) {
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return true;
  if (task.ownerId === user.id || task.assigneeIds.includes(user.id)) return true;
  return data.unitMembers.some((row) => row.unitId === task.unitId && row.memberId === user.id && row.role === "OWNER");
}

export function canEditForm(user: Member, task: Task) {
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return true;
  return task.ownerId === user.id || task.assigneeIds.includes(user.id);
}

export function visibleTaskIdsFor(user: Member) {
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return new Set(data.tasks.map((task) => task.id));
  return new Set(
    data.tasks
      .filter((task) => {
        return task.assigneeIds.includes(user.id) || task.watcherIds.includes(user.id) || task.ownerId === user.id;
      })
      .flatMap((task) => {
        const ids = [task.id];
        let cursor = task.parentId ? byId(data.tasks, task.parentId) : undefined;
        const seen = new Set(ids);
        while (cursor && !seen.has(cursor.id)) {
          seen.add(cursor.id);
          ids.push(cursor.id);
          cursor = cursor.parentId ? byId(data.tasks, cursor.parentId) : undefined;
        }
        return ids;
      })
  );
}

export function wouldCreateTaskCycle(taskId: string, nextParentId: string | null) {
  if (!nextParentId) return false;
  let cursor = byId(data.tasks, nextParentId);
  const seen = new Set<string>();
  while (cursor) {
    if (cursor.id === taskId || seen.has(cursor.id)) return true;
    seen.add(cursor.id);
    cursor = cursor.parentId ? byId(data.tasks, cursor.parentId) : undefined;
  }
  return false;
}

export function getVisibleTask(req: Request, res: Response, taskId: string) {
  const task = byId(data.tasks, taskId);
  if (!task) {
    res.status(404).json({ error: "TASK_NOT_FOUND", requestId: req.requestId });
    return null;
  }
  if (!req.user || !visibleTaskIdsFor(req.user).has(task.id)) {
    res.status(403).json({ error: "FORBIDDEN", requestId: req.requestId });
    return null;
  }
  return task;
}

export function validateMembers(ids: string[]) {
  const known = new Set(data.members.map((member) => member.id));
  return ids.every((id) => known.has(id));
}

export function validateNoteRefs(user: Member, noteIds: string[]) {
  const visibleTaskIds = visibleTaskIdsFor(user);
  const allowed = new Set(data.notes.filter((note) => visibleTaskIds.has(note.taskId)).map((note) => note.id));
  return noteIds.every((id) => allowed.has(id));
}

export function validateMentions(user: Member, mentions: Mention[]) {
  const visibleTaskIds = visibleTaskIdsFor(user);
  const memberIds = new Set(data.members.map((member) => member.id));
  const noteIds = new Set(data.notes.filter((note) => visibleTaskIds.has(note.taskId)).map((note) => note.id));

  return mentions.every((mention) => {
    if (mention.type === "MEMBER") return memberIds.has(mention.targetId);
    if (mention.type === "NOTE") return noteIds.has(mention.targetId);
    const task = byId(data.tasks, mention.targetId);
    if (!task || !visibleTaskIds.has(task.id)) return false;
    if (mention.type === "TASK") return true;
    if (mention.type === "FORM_FIELD") return Boolean(mention.fieldKey && Object.prototype.hasOwnProperty.call(task.formValues, mention.fieldKey));
    return false;
  });
}

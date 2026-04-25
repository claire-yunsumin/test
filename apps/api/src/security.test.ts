import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./server.js";
import { resetData } from "./domain/store.js";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  resetData();
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function api(path: string, init: RequestInit & { userId?: string } = {}) {
  const { userId = "u-admin", headers, ...requestInit } = init;
  const response = await fetch(`${baseUrl}${path}`, {
    ...requestInit,
    headers: {
      "Content-Type": "application/json",
      "X-Demo-User-Id": userId,
      ...headers
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

describe("security baseline", () => {
  test("emits hardening headers and hides Express fingerprint", async () => {
    const { response, body } = await api("/health", { headers: {} });

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'none'/);
    assert.ok(response.headers.get("x-request-id"));
  });

  test("rejects unknown demo users", async () => {
    const { response, body } = await api("/api/bootstrap", { userId: "u-missing" });

    assert.equal(response.status, 401);
    assert.equal(body.error, "UNAUTHORIZED");
    assert.ok(body.requestId);
  });

  test("blocks disallowed CORS origins", async () => {
    const { response, body } = await api("/api/bootstrap", {
      headers: { Origin: "https://evil.example" }
    });

    assert.equal(response.status, 403);
    assert.equal(body.error, "ORIGIN_NOT_ALLOWED");
  });
});

describe("authorization boundaries", () => {
  test("allows MEMBER users to create tasks", async () => {
    const { response, body } = await api("/api/tasks", {
      userId: "u-viewer",
      method: "POST",
      body: JSON.stringify({ title: "Member write attempt", templateType: "TASK" })
    });

    assert.equal(response.status, 201);
    assert.equal(body.title, "Member write attempt");
  });

  test("prevents IDOR access to tasks outside the user's visible scope", async () => {
    const { response, body } = await api("/api/tasks/task-file-block", { userId: "u-viewer" });

    assert.equal(response.status, 403);
    assert.equal(body.error, "FORBIDDEN");
  });

  test("prevents non-owners from deleting visible tasks", async () => {
    const { response, body } = await api("/api/tasks/task-marketing-strategy", {
      userId: "u-marketing",
      method: "DELETE"
    });

    assert.equal(response.status, 403);
    assert.equal(body.error, "FORBIDDEN");
  });

  test("prevents watchers from editing task fields while allowing assignees", async () => {
    const watcherPatch = await api("/api/tasks/task-marketing-strategy", {
      userId: "u-viewer",
      method: "PATCH",
      body: JSON.stringify({ title: "Watcher title takeover" })
    });

    assert.equal(watcherPatch.response.status, 403);
    assert.equal(watcherPatch.body.error, "FORBIDDEN");

    const assigneePatch = await api("/api/tasks/task-marketing-strategy", {
      userId: "u-marketing",
      method: "PATCH",
      body: JSON.stringify({ title: "Assignee title update" })
    });

    assert.equal(assigneePatch.response.status, 200);
    assert.equal(assigneePatch.body.title, "Assignee title update");
  });

  test("hides child tasks outside the user's visible scope in task detail", async () => {
    const { response, body } = await api("/api/tasks/task-marketing-strategy", { userId: "u-viewer" });

    assert.equal(response.status, 200);
    assert.equal(body.task.id, "task-marketing-strategy");
    assert.ok(body.children.every((child: { id: string }) => child.id !== "task-competitive-context"));
    assert.ok(body.referenceableTasks.every((task: { id: string }) => task.id !== "task-competitive-context"));
  });

  test("prevents comment edits by users who are neither author nor ADMIN", async () => {
    const created = await api("/api/tasks/task-marketing-strategy/comments", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({ content: "Admin-only comment", referencedNoteIds: [] })
    });
    assert.equal(created.response.status, 201);

    const { response, body } = await api(`/api/comments/${created.body.id}`, {
      userId: "u-marketing",
      method: "PATCH",
      body: JSON.stringify({ content: "Hijack attempt", referencedNoteIds: [] })
    });

    assert.equal(response.status, 403);
    assert.equal(body.error, "FORBIDDEN");
  });

  test("prevents ADMIN self-removal", async () => {
    const { response, body } = await api("/api/admin/members/u-admin", {
      userId: "u-admin",
      method: "DELETE"
    });

    assert.equal(response.status, 400);
    assert.equal(body.error, "CANNOT_REMOVE_SELF");
  });

  test("allows unit owners to invite members into their unit", async () => {
    const { response, body } = await api("/api/admin/invitations", {
      userId: "u-pm",
      method: "POST",
      body: JSON.stringify({ email: "unit.owner.invite@example.com", role: "MEMBER", unitId: "unit-growth" })
    });

    assert.equal(response.status, 201);
    assert.equal(body.member.unit, "성장 전략");
  });

  test("prevents non-owners from inviting members into a unit", async () => {
    const { response, body } = await api("/api/admin/invitations", {
      userId: "u-viewer",
      method: "POST",
      body: JSON.stringify({ email: "blocked.invite@example.com", role: "MEMBER", unitId: "unit-growth" })
    });

    assert.equal(response.status, 403);
    assert.equal(body.error, "FORBIDDEN");
  });

  test("limits read-all inbox changes to the acting user even for admins", async () => {
    const comment = await api("/api/tasks/task-marketing-strategy/comments", {
      userId: "u-marketing",
      method: "POST",
      body: JSON.stringify({
        content: "Admin mention",
        mentions: [{ type: "MEMBER", targetId: "u-admin", label: "관리자" }]
      })
    });
    assert.equal(comment.response.status, 201);

    const readAll = await api("/api/inbox/read-all", {
      userId: "u-admin",
      method: "PATCH",
      body: JSON.stringify({ componentType: "DISCUSSION" })
    });
    assert.equal(readAll.response.status, 200);
    assert.equal(readAll.body.changed, 2);

    const pmBootstrap = await api("/api/bootstrap", { userId: "u-pm" });
    const pmDiscussion = pmBootstrap.body.inbox.find((item: { id: string }) => item.id === "inbox-2");
    assert.equal(pmDiscussion.readAt, null);
  });
});

describe("input validation", () => {
  test("allows cross-task note references inside the user's visible graph", async () => {
    const { response, body } = await api("/api/tasks/task-target-research/comments", {
      userId: "u-pm",
      method: "POST",
      body: JSON.stringify({ content: "Cross-task graph reference", referencedNoteIds: ["note-analysis"] })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(body.referencedNoteIds, ["note-analysis"]);
  });

  test("rejects invalid note references across tasks", async () => {
    const { response, body } = await api("/api/tasks/task-marketing-strategy/comments", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({ content: "Bad note reference", referencedNoteIds: ["note-missing"] })
    });

    assert.equal(response.status, 400);
    assert.equal(body.error, "INVALID_NOTE_REFERENCE");
  });

  test("validates required task titles", async () => {
    const { response, body } = await api("/api/tasks", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({ title: "", templateType: "TASK" })
    });

    assert.equal(response.status, 400);
    assert.equal(body.error, "VALIDATION_ERROR");
    assert.deepEqual(body.issues, ["title"]);
  });

  test("creates a FREEFORM node and then connects it to a parent", async () => {
    const created = await api("/api/tasks", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({ title: "Freeform strategy node", structureState: "FREEFORM" })
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.structureState, "FREEFORM");
    assert.equal(created.body.templateId, null);

    const connected = await api(`/api/tasks/${created.body.id}`, {
      userId: "u-admin",
      method: "PATCH",
      body: JSON.stringify({ parentId: "task-vision" })
    });
    assert.equal(connected.response.status, 200);
    assert.equal(connected.body.parentId, "task-vision");
  });

  test("rejects task creation when folder and list do not match", async () => {
    const { response, body } = await api("/api/tasks", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({
        title: "Invalid folder/list pair",
        unitId: "unit-growth",
        listId: "list-growth-objective",
        folderId: "folder-growth-exec"
      })
    });

    assert.equal(response.status, 400);
    assert.equal(body.error, "FOLDER_LIST_MISMATCH");
  });

  test("applies a template and initializes form fields", async () => {
    const created = await api("/api/tasks", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({ title: "Template target", structureState: "FREEFORM" })
    });
    assert.equal(created.response.status, 201);

    const applied = await api(`/api/tasks/${created.body.id}`, {
      userId: "u-admin",
      method: "PATCH",
      body: JSON.stringify({ templateId: "tpl-marketing-objective" })
    });
    assert.equal(applied.response.status, 200);
    assert.equal(applied.body.structureState, "TEMPLATED");
    assert.equal(applied.body.templateId, "tpl-marketing-objective");
    assert.equal(applied.body.templateType, "OBJECTIVE");
    assert.ok(Object.prototype.hasOwnProperty.call(applied.body.formValues, "marketAnalysis"));
  });

  test("rejects task patch when folder and list do not match", async () => {
    const created = await api("/api/tasks", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({
        title: "Patch target",
        unitId: "unit-growth",
        listId: "list-growth-objective"
      })
    });
    assert.equal(created.response.status, 201);

    const patched = await api(`/api/tasks/${created.body.id}`, {
      userId: "u-admin",
      method: "PATCH",
      body: JSON.stringify({
        listId: "list-growth-objective",
        folderId: "folder-growth-exec"
      })
    });

    assert.equal(patched.response.status, 400);
    assert.equal(patched.body.error, "FOLDER_LIST_MISMATCH");
  });

  test("rejects parent changes that would create hierarchy cycles", async () => {
    const { response, body } = await api("/api/tasks/task-marketing-strategy", {
      userId: "u-admin",
      method: "PATCH",
      body: JSON.stringify({ parentId: "task-target-research" })
    });

    assert.equal(response.status, 400);
    assert.equal(body.error, "INVALID_PARENT");
  });

  test("rejects invalid mentions and accepts valid member, task, field, and note mentions", async () => {
    const invalid = await api("/api/tasks/task-marketing-strategy/comments", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({
        content: "Bad mention",
        mentions: [{ type: "TASK", targetId: "missing-task", label: "Missing" }]
      })
    });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.body.error, "INVALID_MENTION");

    const valid = await api("/api/tasks/task-marketing-strategy/comments", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({
        content: "Valid mention bundle",
        mentions: [
          { type: "MEMBER", targetId: "u-lead", label: "이팀장" },
          { type: "TASK", targetId: "task-market-validation", label: "시장성 검증" },
          { type: "FORM_FIELD", targetId: "task-marketing-strategy", fieldKey: "marketAnalysis", label: "M2 시장 분석" },
          { type: "NOTE", targetId: "note-analysis", label: "분석 요약" }
        ]
      })
    });
    assert.equal(valid.response.status, 201);
    assert.equal(valid.body.mentions.length, 4);
    assert.deepEqual(valid.body.referencedNoteIds, ["note-analysis"]);
  });

  test("calculates retention analytics from engagement events", async () => {
    await api("/api/tasks/task-marketing-strategy/comments", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({
        content: "Analytics mention",
        mentions: [{ type: "MEMBER", targetId: "u-lead", label: "이팀장" }]
      })
    });

    const { response, body } = await api("/api/analytics/retention", { userId: "u-admin" });
    assert.equal(response.status, 200);
    assert.ok(body.shapedNodeCount >= 1);
    assert.ok(body.mentionCount >= 1);
    assert.ok(body.mentionThreadCount >= 1);
  });

  test("creates and applies approval policy on transition", async () => {
    const policy = await api("/api/admin/approval-policies", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({
        name: "Test parallel policy",
        mode: "PARALLEL",
        approverType: "MEMBER",
        approverIds: ["u-lead", "u-admin"],
        minApprovals: 2,
        approvalLines: [
          { type: "CONSENSUS", participantIds: ["u-lead", "u-admin"], minApprovals: 2 },
          { type: "APPROVAL", participantIds: ["u-admin"], minApprovals: 1 }
        ],
        finalApproverId: "u-admin"
      })
    });
    assert.equal(policy.response.status, 201);
    assert.equal(policy.body.approvalLines.length, 2);
    assert.equal(policy.body.finalApproverId, "u-admin");

    const transitioned = await api("/api/tasks/task-marketing-strategy/transition", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({
        toState: "DONE",
        decisionType: "APPROVE",
        reason: "policy test",
        approvalPolicyId: policy.body.id
      })
    });
    assert.equal(transitioned.response.status, 200);
    assert.equal(transitioned.body.task.approvalPolicyId, policy.body.id);
    assert.equal(transitioned.body.event.payload.approvalPolicyId, policy.body.id);
    assert.equal(transitioned.body.event.payload.approvalLineCount, 2);
    assert.equal(transitioned.body.event.payload.finalApproverId, "u-admin");
  });

  test("rejects invalid transition combination", async () => {
    const transitioned = await api("/api/tasks/task-customer-interview/transition", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({
        toState: "DONE",
        decisionType: "APPROVE",
        reason: "skip flow"
      })
    });
    assert.equal(transitioned.response.status, 400);
    assert.equal(transitioned.body.error, "INVALID_TRANSITION");
  });

  test("rejects invalid approvalPolicyId regardless of target state", async () => {
    const transitioned = await api("/api/tasks/task-marketing-strategy/transition", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({
        toState: "IN_PROGRESS",
        decisionType: "SUPPLEMENT",
        reason: "rollback",
        approvalPolicyId: "ap-missing"
      })
    });
    assert.equal(transitioned.response.status, 400);
    assert.equal(transitioned.body.error, "INVALID_APPROVAL_POLICY");
  });

  test("blocks decision when actor is not policy approver", async () => {
    const policy = await api("/api/admin/approval-policies", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({
        name: "Admin only final",
        mode: "SINGLE",
        approverType: "MEMBER",
        approverIds: ["u-admin"],
        minApprovals: 1,
        approvalLines: [{ type: "APPROVAL", participantIds: ["u-admin"], minApprovals: 1 }]
      })
    });
    assert.equal(policy.response.status, 201);

    const transitioned = await api("/api/tasks/task-marketing-strategy/transition", {
      userId: "u-lead",
      method: "POST",
      body: JSON.stringify({
        toState: "DONE",
        decisionType: "APPROVE",
        reason: "attempt by non policy approver",
        approvalPolicyId: policy.body.id
      })
    });
    assert.equal(transitioned.response.status, 403);
    assert.equal(transitioned.body.error, "NOT_POLICY_APPROVER");
  });

  test("applies unit default approval policy when requesting approval", async () => {
    const unitPatch = await api("/api/units/unit-growth", {
      userId: "u-admin",
      method: "PATCH",
      body: JSON.stringify({ defaultApprovalPolicyId: "ap-growth-consensus" })
    });
    assert.equal(unitPatch.response.status, 200);

    const transitioned = await api("/api/tasks/task-market-validation/transition", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({
        toState: "IN_PROGRESS",
        decisionType: "SUPPLEMENT",
        reason: "use unit default policy"
      })
    });
    assert.equal(transitioned.response.status, 200);
    assert.equal(transitioned.body.event.payload.approvalPolicyId, "ap-growth-consensus");
  });

  test("supports template workflow transition via toStatusId", async () => {
    const template = await api("/api/templates", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({ name: "WF Template", type: "TASK", enabled: true })
    });
    assert.equal(template.response.status, 201);
    const workflowPatch = await api(`/api/templates/${template.body.id}/workflow`, {
      userId: "u-admin",
      method: "PATCH",
      body: JSON.stringify({
        statuses: [
          { id: "open", name: "Open", category: "OPEN", isDefault: true },
          { id: "review", name: "Review", category: "IN_PROGRESS" },
          { id: "done", name: "Done", category: "DONE" }
        ],
        transitions: [
          { fromStatusId: "open", toStatusId: "review", label: "검토", decisionType: "STATE_ONLY", isDecision: false },
          { fromStatusId: "review", toStatusId: "done", label: "완료", decisionType: "APPROVE", isDecision: true }
        ]
      })
    });
    assert.equal(workflowPatch.response.status, 200);

    const task = await api("/api/tasks", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({ title: "workflow task", templateId: template.body.id })
    });
    assert.equal(task.response.status, 201);
    assert.equal(task.body.workflowStatusId, "open");

    const transitioned = await api(`/api/tasks/${task.body.id}/transition`, {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({
        toState: "IN_PROGRESS",
        toStatusId: "review",
        decisionType: "STATE_ONLY",
        reason: "move review"
      })
    });
    assert.equal(transitioned.response.status, 200);
    assert.equal(transitioned.body.task.workflowStatusId, "review");
  });

  test("requires approval policy when transition approval is enabled", async () => {
    const template = await api("/api/templates", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({ name: "Approval Transition Template", type: "TASK", enabled: true })
    });
    assert.equal(template.response.status, 201);
    const workflowPatch = await api(`/api/templates/${template.body.id}/workflow`, {
      userId: "u-admin",
      method: "PATCH",
      body: JSON.stringify({
        statuses: [
          { id: "open", name: "Open", category: "OPEN", isDefault: true },
          { id: "approve_gate", name: "Approve Gate", category: "PENDING_APPROVAL" },
          { id: "done", name: "Done", category: "DONE" }
        ],
        transitions: [
          { fromStatusId: "open", toStatusId: "approve_gate", label: "승인요청", decisionType: "SUPPLEMENT", isDecision: true, onExit: { approvalGate: { enabled: true, policyId: "ap-default-unit-approver" } } },
          { fromStatusId: "approve_gate", toStatusId: "done", label: "완료", decisionType: "APPROVE", isDecision: true, onExit: { approvalGate: { enabled: false, policyId: null } } }
        ]
      })
    });
    assert.equal(workflowPatch.response.status, 200);

    const task = await api("/api/tasks", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({ title: "approval task", templateId: template.body.id })
    });
    assert.equal(task.response.status, 201);

    const transitioned = await api(`/api/tasks/${task.body.id}/transition`, {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({
        toState: "IN_PROGRESS",
        toStatusId: "approve_gate",
        decisionType: "SUPPLEMENT",
        reason: "need approval"
      })
    });
    assert.equal(transitioned.response.status, 200);
    assert.equal(transitioned.body.event.payload.transitionApprovalEnabled, true);
    assert.equal(transitioned.body.event.payload.approvalPolicyId, "ap-default-unit-approver");
  });
});

describe("admin CRUD smoke path", () => {
  test("creates, updates, and deletes mutable resources", async () => {
    const workflowStatuses = await api("/api/workflow/statuses", {
      method: "PATCH",
      body: JSON.stringify({
        statuses: [
          { id: "open", name: "Open", category: "OPEN", isDefault: true },
          { id: "doing", name: "Doing", category: "IN_PROGRESS" },
          { id: "done", name: "Done", category: "DONE" }
        ]
      })
    });
    assert.equal(workflowStatuses.response.status, 200);
    assert.equal(workflowStatuses.body.length, 3);

    const createdTask = await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Automated CRUD task", templateType: "TASK" })
    });
    assert.equal(createdTask.response.status, 201);

    const updatedTask = await api(`/api/tasks/${createdTask.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Automated CRUD task updated", description: "verified", workflowPhase: "ACTIVE" })
    });
    assert.equal(updatedTask.response.status, 200);
    assert.equal(updatedTask.body.title, "Automated CRUD task updated");
    assert.equal(updatedTask.body.workflowPhase, "ACTIVE");

    const note = await api(`/api/tasks/${createdTask.body.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ title: "CRUD note", content: "note body" })
    });
    assert.equal(note.response.status, 201);

    const comment = await api(`/api/tasks/${createdTask.body.id}/comments`, {
      method: "POST",
      body: JSON.stringify({ content: "CRUD comment", referencedNoteIds: [note.body.id] })
    });
    assert.equal(comment.response.status, 201);

    const linkAttachment = await api(`/api/tasks/${createdTask.body.id}/attachments/link`, {
      method: "POST",
      body: JSON.stringify({ name: "Git PR", url: "https://github.com/example/repo/pull/1" })
    });
    assert.equal(linkAttachment.response.status, 201);

    const fileAttachment = await api(`/api/tasks/${createdTask.body.id}/attachments/file`, {
      method: "POST",
      body: JSON.stringify({
        name: "spec.md",
        mimeType: "text/markdown",
        size: 128,
        contentDataUrl: "data:text/markdown;base64,IyBTcGVj"
      })
    });
    assert.equal(fileAttachment.response.status, 201);

    const template = await api("/api/templates", {
      method: "POST",
      body: JSON.stringify({ name: "CRUD Template", type: "TASK", enabled: true })
    });
    assert.equal(template.response.status, 201);

    const memberInvite = await api("/api/admin/invitations", {
      method: "POST",
      body: JSON.stringify({ email: "crud.member@example.com", role: "MEMBER", unitId: "unit-growth" })
    });
    assert.equal(memberInvite.response.status, 201);
    assert.equal(memberInvite.body.member.unit, "성장 전략");

    const memberDelete = await api(`/api/admin/members/${memberInvite.body.member.id}`, { method: "DELETE" });
    assert.equal(memberDelete.response.status, 200);

    const createdUnit = await api("/api/units", {
      method: "POST",
      body: JSON.stringify({ name: "Temp Unit", purpose: "CRUD test" })
    });
    assert.equal(createdUnit.response.status, 201);

    const updatedUnit = await api(`/api/units/${createdUnit.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Temp Unit Renamed", defaultApprovalPolicyId: "ap-default-unit-approver" })
    });
    assert.equal(updatedUnit.response.status, 200);
    assert.equal(updatedUnit.body.name, "Temp Unit Renamed");
    assert.equal(updatedUnit.body.defaultApprovalPolicyId, "ap-default-unit-approver");

    const deletedUnit = await api(`/api/units/${createdUnit.body.id}`, { method: "DELETE" });
    assert.equal(deletedUnit.response.status, 200);

    const templateDelete = await api(`/api/templates/${template.body.id}`, { method: "DELETE" });
    assert.equal(templateDelete.response.status, 200);

    const taskDelete = await api(`/api/tasks/${createdTask.body.id}`, { method: "DELETE" });
    assert.equal(taskDelete.response.status, 200);
    assert.deepEqual(taskDelete.body.deletedIds, [createdTask.body.id]);
  });
});

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
  test("prevents VIEWER users from creating tasks", async () => {
    const { response, body } = await api("/api/tasks", {
      userId: "u-viewer",
      method: "POST",
      body: JSON.stringify({ title: "Viewer write attempt", templateType: "TASK" })
    });

    assert.equal(response.status, 403);
    assert.equal(body.error, "FORBIDDEN");
  });

  test("prevents IDOR access to tasks outside the user's visible scope", async () => {
    const { response, body } = await api("/api/tasks/task-kr1", { userId: "u-viewer" });

    assert.equal(response.status, 403);
    assert.equal(body.error, "FORBIDDEN");
  });

  test("prevents non-owners from deleting visible tasks", async () => {
    const { response, body } = await api("/api/tasks/task-kr2", {
      userId: "u-marketing",
      method: "DELETE"
    });

    assert.equal(response.status, 403);
    assert.equal(body.error, "FORBIDDEN");
  });

  test("prevents comment edits by users who are neither author nor ADMIN", async () => {
    const created = await api("/api/tasks/task-objective/comments", {
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
});

describe("input validation", () => {
  test("allows cross-task note references inside the user's visible graph", async () => {
    const { response, body } = await api("/api/tasks/task-exec1/comments", {
      userId: "u-pm",
      method: "POST",
      body: JSON.stringify({ content: "Cross-task graph reference", referencedNoteIds: ["note-analysis"] })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(body.referencedNoteIds, ["note-analysis"]);
  });

  test("rejects invalid note references across tasks", async () => {
    const { response, body } = await api("/api/tasks/task-objective/comments", {
      userId: "u-admin",
      method: "POST",
      body: JSON.stringify({ content: "Bad note reference", referencedNoteIds: ["note-kr1-research"] })
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
});

describe("admin CRUD smoke path", () => {
  test("creates, updates, and deletes mutable resources", async () => {
    const createdTask = await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Automated CRUD task", templateType: "TASK" })
    });
    assert.equal(createdTask.response.status, 201);

    const updatedTask = await api(`/api/tasks/${createdTask.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Automated CRUD task updated", description: "verified" })
    });
    assert.equal(updatedTask.response.status, 200);
    assert.equal(updatedTask.body.title, "Automated CRUD task updated");

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

    const template = await api("/api/templates", {
      method: "POST",
      body: JSON.stringify({ name: "CRUD Template", type: "TASK", enabled: true })
    });
    assert.equal(template.response.status, 201);

    const memberInvite = await api("/api/admin/invitations", {
      method: "POST",
      body: JSON.stringify({ email: "crud.member@example.com", role: "VIEWER" })
    });
    assert.equal(memberInvite.response.status, 201);

    const memberDelete = await api(`/api/admin/members/${memberInvite.body.member.id}`, { method: "DELETE" });
    assert.equal(memberDelete.response.status, 200);

    const templateDelete = await api(`/api/templates/${template.body.id}`, { method: "DELETE" });
    assert.equal(templateDelete.response.status, 200);

    const taskDelete = await api(`/api/tasks/${createdTask.body.id}`, { method: "DELETE" });
    assert.equal(taskDelete.response.status, 200);
    assert.deepEqual(taskDelete.body.deletedIds, [createdTask.body.id]);
  });
});

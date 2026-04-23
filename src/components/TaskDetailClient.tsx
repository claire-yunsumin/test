"use client";

import { useEffect, useState } from "react";

// ─── Types ───────────────────────────────────────────────────
type TaskReadModel = {
  task_id: string;
  org_id: string;
  template_version_id: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  due_date: string | null;
  assignee_id: string | null;
  assignee_email: string | null;
  assignee_name: string | null;
  project_id: string | null;
  project_name: string | null;
  project_color: string | null;
  current_state: string;
  last_event_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type OrgMember = {
  user_id: string;
  email: string;
  full_name: string | null;
};

type Project = {
  id: string;
  name: string;
  color: string;
};

// ─── Constants ───────────────────────────────────────────────
const STATE_META: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: "Draft", color: "#6b7280", bg: "#f3f4f6" },
  IN_PROGRESS: { label: "In Progress", color: "#2563eb", bg: "#eff6ff" },
  PENDING_APPROVAL: { label: "Pending Approval", color: "#d97706", bg: "#fffbeb" },
  DONE: { label: "Done", color: "#059669", bg: "#ecfdf5" },
};

const PRIORITY_META: Record<string, { label: string; color: string; dot: string }> = {
  LOW: { label: "Low", color: "#6b7280", dot: "#d1d5db" },
  MEDIUM: { label: "Medium", color: "#2563eb", dot: "#93c5fd" },
  HIGH: { label: "High", color: "#d97706", dot: "#fcd34d" },
  URGENT: { label: "Urgent", color: "#dc2626", dot: "#fca5a5" },
};


// ─── Helpers ─────────────────────────────────────────────────
function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function getDueDateStatus(due: string | null) {
  if (!due) return null;
  const d = new Date(due);
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: `${Math.abs(diff)}일 지남`, color: "#dc2626" };
  if (diff === 0) return { label: "오늘 마감", color: "#d97706" };
  if (diff <= 3) return { label: `D-${diff}`, color: "#d97706" };
  return { label: `D-${diff}`, color: "#6b7280" };
}

// ─── Sub Components ───────────────────────────────────────────
function MetaRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ fontSize: 15, width: 20, textAlign: "center", marginTop: 1 }}>{icon}</span>
      <span style={{ fontSize: 12, color: "#9ca3af", width: 64, flexShrink: 0, marginTop: 2 }}>{label}</span>
      <div style={{ flex: 1, fontSize: 14, color: "#111827" }}>{children}</div>
    </div>
  );
}

function EditableText({
  value, placeholder, onSave, multiline = false,
}: {
  value: string | null;
  placeholder: string;
  onSave: (v: string) => void;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const commit = () => {
    onSave(draft);
    setEditing(false);
  };

  if (!editing) {
    return (
      <span
        onClick={() => { setDraft(value ?? ""); setEditing(true); }}
        style={{
          cursor: "text",
          color: value ? "#111827" : "#d1d5db",
          borderBottom: "1px dashed #e5e7eb",
          paddingBottom: 1,
          whiteSpace: "pre-wrap",
        }}
      >
        {value || placeholder}
      </span>
    );
  }

  return multiline ? (
    <textarea
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      rows={3}
      style={{
        width: "100%", padding: "6px 8px", fontSize: 14,
        border: "1px solid #6366f1", borderRadius: 6, outline: "none",
        resize: "vertical", fontFamily: "inherit",
      }}
    />
  ) : (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      style={{
        width: "100%", padding: "4px 8px", fontSize: 14,
        border: "1px solid #6366f1", borderRadius: 6, outline: "none",
      }}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────
export default function TaskDetailClient({ taskId }: { taskId: string }) {
  const [events, setEvents] = useState<any[]>([]);
  const [task, setTask] = useState<TaskReadModel | null>(null);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── loaders ──
  const loadTask = async () => {
    const res = await fetch("/api/task-read-model", { cache: "no-store" });
    if (!res.ok) return;
    const data: TaskReadModel[] = await res.json();
    const found = data.find((t) => t.task_id === taskId);
    setTask(found ?? null);
    setLoading(false);
  };

  const loadEvents = async () => {
    const res = await fetch(`/api/tasks/${taskId}/events`);
    if (!res.ok) return;
    setEvents(await res.json());
  };

  const loadApproval = async () => {
    const res = await fetch(`/api/tasks/${taskId}/approval`);
    if (!res.ok) return;
    const data = await res.json();
    setApprovalId(data.approval_id ?? null);
  };

  const loadMembers = async () => {
    const res = await fetch("/api/org/members");
    if (!res.ok) return;
    setMembers(await res.json());
  };

  const loadProjects = async () => {
    const res = await fetch("/api/projects");
    if (!res.ok) return;
    setProjects(await res.json());
  };

  useEffect(() => {
    loadTask();
    loadMembers();
    loadProjects();
    loadEvents();
  }, [taskId]);

  useEffect(() => {
    if (task?.current_state === "PENDING_APPROVAL") loadApproval();
  }, [task?.current_state]);

  // ── patch helper ──
  const patch = async (fields: Partial<TaskReadModel>) => {
    setSaving(true);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    await loadTask();
    setSaving(false);
  };

  // ── transition ──
  const transition = async (to_state: string) => {
    setExecuting(true);
    const res = await fetch(`/api/tasks/${taskId}/transition`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ to_state }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Transition 실패");
    } else {
      await loadTask();
      await loadEvents();   // 🔥 이 줄 추가
    }
    setExecuting(false);
  };

  const approve = async () => {
    if (!approvalId) return;
    setExecuting(true);
    const res = await fetch(`/api/approvals/${approvalId}/approve`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Approve 실패");
    } else {
      await loadTask();
      await loadEvents();   // 🔥 이 줄 추가
      setApprovalId(null);
    }
    setExecuting(false);
  };

  // ─── Render ───────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: 40, color: "#9ca3af", fontSize: 14 }}>불러오는 중...</div>
  );
  if (!task) return (
    <div style={{ padding: 40, color: "#ef4444" }}>Task를 찾을 수 없습니다.</div>
  );

  const stateMeta =
    STATE_META[task.current_state] ??
    {
      label: task.current_state,
      color: "#6b7280",
      bg: "#f3f4f6",
    };

  const priMeta =
    PRIORITY_META[task.priority ?? "MEDIUM"] ??
    PRIORITY_META["MEDIUM"];
  const dueStatus = getDueDateStatus(task.due_date);

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── 상단 네비 ── */}
        <div style={{ marginBottom: 24 }}>
          <a href="/dashboard" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
            ← 대시보드
          </a>
        </div>

        {/* ── 제목 + 상태 ── */}
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{
            background: stateMeta.bg, color: stateMeta.color,
            padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
          }}>
            {stateMeta.label}
          </span>

          {saving && (
            <span style={{ fontSize: 12, color: "#9ca3af" }}>저장 중...</span>
          )}
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 24, color: "#111827", lineHeight: 1.3 }}>
          <EditableText
            value={task.title}
            placeholder="제목 없음"
            onSave={(v) => patch({ title: v } as any)}
          />
        </h1>

        {/* ── 메인 레이아웃 ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 24, alignItems: "start" }}>

          {/* 왼쪽: 설명 + 액션 */}
          <div>
            {/* 설명 */}
            <div style={{
              background: "white", borderRadius: 12, padding: 20,
              border: "1px solid #e5e7eb", marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 10, letterSpacing: "0.05em" }}>
                DESCRIPTION
              </div>
              <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
                <EditableText
                  value={task.description}
                  placeholder="설명을 입력하세요..."
                  onSave={(v) => patch({ description: v } as any)}
                  multiline
                />
              </div>
            </div>

            {/* 액션 버튼 */}
            <div style={{
              background: "white", borderRadius: 12, padding: 20,
              border: "1px solid #e5e7eb", marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 12, letterSpacing: "0.05em" }}>
                ACTIONS
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {task.current_state === "DRAFT" && (
                  <ActionButton
                    label="Start Work"
                    color="#2563eb"
                    disabled={executing}
                    onClick={() => transition("IN_PROGRESS")}
                  />
                )}
                {task.current_state === "IN_PROGRESS" && (
                  <ActionButton
                    label="Submit for Approval"
                    color="#d97706"
                    disabled={executing}
                    onClick={() => transition("DONE")} // ✅ 최종 목표 상태를 보냄
                  />
                )}
                {task.current_state === "PENDING_APPROVAL" && approvalId && (
                  <ActionButton
                    label="✓ Approve"
                    color="#059669"
                    disabled={executing}
                    onClick={approve}
                  />
                )}
                {task.current_state === "PENDING_APPROVAL" && approvalId && (
                  <ActionButton
                    label="✕ Reject"
                    color="#dc2626"
                    disabled={executing}
                    onClick={() => alert("Reject Flow - 구현 예정")}
                  />
                )}
              </div>
            </div>


            {/* 타임라인 */}
            <div
              style={{
                background: "white",
                borderRadius: 12,
                padding: 20,
                border: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#6b7280",
                  marginBottom: 14,
                  letterSpacing: "0.05em",
                }}
              >
                TIMELINE
              </div>

              {events.length === 0 && (
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  이벤트가 없습니다.
                </div>
              )}

              {events.map((e) => (
                <TimelineItem
                  key={e.id}
                  dot={getEventDotColor(e.event_type)}
                  label={formatEventLabel(e)}
                  time={formatDate(e.created_at) ?? ""}
                />
              ))}
            </div>
          </div>

          {/* 오른쪽: 메타 패널 */}
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 20,
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
                fontSize: 12,
                fontWeight: 600,
                color: "#6b7280",
                marginBottom: 4,
                letterSpacing: "0.05em",
              }}
            >
              DETAILS
            </div>

            {/* 담당자 */}
            <MetaRow icon="👤" label="담당자">
              <select
                value={task.assignee_id ?? ""}
                onChange={(e) => patch({ assignee_id: e.target.value || null } as any)}
                style={selectStyle}
              >
                <option value="">미배정</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
            </MetaRow>

            {/* 마감일 */}
            <MetaRow icon="📅" label="마감일">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <input
                  type="date"
                  value={task.due_date ? task.due_date.slice(0, 10) : ""}
                  onChange={(e) =>
                    patch({ due_date: e.target.value || null } as any)
                  }
                  style={{
                    ...selectStyle,
                    cursor: "pointer",
                    width: "100%",
                    minWidth: 0,
                    boxSizing: "border-box",
                  }}
                />
                {dueStatus && (
                  <span
                    style={{
                      fontSize: 11,
                      color: dueStatus.color,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {dueStatus.label}
                  </span>
                )}
              </div>
            </MetaRow>

            {/* 우선순위 */}
            <MetaRow icon="🚦" label="우선순위">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: priMeta.dot, display: "inline-block", flexShrink: 0,
                }} />
                <select
                  value={task.priority ?? "MEDIUM"}
                  onChange={(e) => patch({ priority: e.target.value } as any)}
                  style={{ ...selectStyle, color: priMeta.color, fontWeight: 600 }}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
            </MetaRow>

            {/* 프로젝트 */}
            <MetaRow icon="📁" label="프로젝트">
              <select
                value={task.project_id ?? ""}
                onChange={(e) => patch({ project_id: e.target.value || null } as any)}
                style={selectStyle}
              >
                <option value="">없음</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </MetaRow>

            {/* 생성일 */}
            <MetaRow icon="🕐" label="생성일">
              <span style={{ color: "#6b7280" }}>{formatDate(task.created_at) ?? "-"}</span>
            </MetaRow>

            {/* 마지막 이벤트 */}
            <MetaRow icon="⚡" label="최근 활동">
              <span style={{ color: "#6b7280" }}>{formatDate(task.last_event_at) ?? "-"}</span>
            </MetaRow>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Small Components ─────────────────────────────────────────
function ActionButton({
  label, color, disabled, onClick,
}: {
  label: string; color: string; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "8px 16px", borderRadius: 8, border: "none",
        backgroundColor: color, color: "white", fontSize: 13,
        fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1, transition: "opacity 0.15s",
      }}
    >
      {label}
    </button>
  );
}

function TimelineItem({ dot, label, time }: { dot: string; label: string; time: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: dot, marginTop: 3, flexShrink: 0 }} />
      </div>
      <div>
        <div style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: "#9ca3af" }}>{time}</div>
      </div>
    </div>
  );
}

function formatEventLabel(event: any) {
  switch (event.event_type) {
    case "TASK_CREATED":
      return "Task 생성됨";

    case "STATE_TRANSITION":
      return `상태 변경 → ${event.payload_json?.to_state ?? ""}`;

    case "APPROVAL_REQUESTED":
      return "승인 요청됨";

    case "APPROVAL_APPROVED":
      return "승인 완료";

    case "APPROVAL_REJECTED":
      return "반려됨";

    default:
      return event.event_type;
  }
}

function getEventDotColor(eventType: string): string {
  switch (eventType) {
    case "TASK_CREATED":
      return "#9ca3af"; // 회색

    case "STATE_TRANSITION":
      return "#2563eb"; // 파랑

    case "APPROVAL_REQUESTED":
      return "#d97706"; // 주황

    case "APPROVAL_APPROVED":
      return "#059669"; // 초록

    case "APPROVAL_REJECTED":
      return "#dc2626"; // 빨강

    default:
      return "#6366f1";
  }
}

const selectStyle: React.CSSProperties = {
  fontSize: 13, color: "#374151", border: "1px solid #e5e7eb",
  borderRadius: 6, padding: "3px 6px", background: "white",
  outline: "none", width: "100%", cursor: "pointer",
};
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

type Project = {
  id: string;
  name: string;
  color: string;
};

// ─── Constants ───────────────────────────────────────────────
const STATE_META: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:            { label: "Draft",            color: "#6b7280", bg: "#f3f4f6" },
  IN_PROGRESS:      { label: "In Progress",      color: "#2563eb", bg: "#eff6ff" },
  PENDING_APPROVAL: { label: "Pending Approval", color: "#d97706", bg: "#fffbeb" },
  DONE:             { label: "Done",             color: "#059669", bg: "#ecfdf5" },
};

const PRIORITY_DOT: Record<string, string> = {
  LOW: "#d1d5db", MEDIUM: "#93c5fd", HIGH: "#fcd34d", URGENT: "#fca5a5",
};

// ─── Helpers ─────────────────────────────────────────────────
function getDueDateStatus(due: string | null) {
  if (!due) return null;
  const diff = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000);
  if (diff < 0)  return { label: `${Math.abs(diff)}일 지남`, color: "#ef4444" };
  if (diff === 0) return { label: "오늘",    color: "#f59e0b" };
  if (diff <= 3)  return { label: `D-${diff}`, color: "#f59e0b" };
  return { label: `D-${diff}`, color: "#9ca3af" };
}

function getInitial(name: string | null, email: string | null) {
  const src = name || email || "?";
  return src.charAt(0).toUpperCase();
}

// ─── Main Component ───────────────────────────────────────────
export default function DashboardClient() {
  const [tasks, setTasks]       = useState<TaskReadModel[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [title, setTitle]       = useState("");
  const [creating, setCreating] = useState(false);

  // ── filters ──
  const [filterState,   setFilterState]   = useState("ALL");
  const [filterProject, setFilterProject] = useState("ALL");
  const [filterPriority, setFilterPriority] = useState("ALL");

  const loadTasks = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const res = await fetch("/api/task-read-model");
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (res.status === 403) { setError("조직 권한이 없습니다."); setTasks([]); return; }
      if (!res.ok)            { setError("데이터를 불러오지 못했습니다."); setTasks([]); return; }
      const data = await res.json();
      if (!Array.isArray(data)) { setError("잘못된 응답 형식입니다."); setTasks([]); return; }
      setTasks(data);
    } catch (err) {
      setError("알 수 없는 오류가 발생했습니다.");
      setTasks([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadProjects = async () => {
    const res = await fetch("/api/projects");
    if (res.ok) setProjects(await res.json());
  };

  const createTask = async () => {
    if (!title.trim()) { alert("제목을 입력하세요."); return; }
    try {
      setCreating(true);
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "생성 실패"); return; }
      setTitle("");
      await loadTasks(true);
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    loadTasks();
    loadProjects();
    const interval = setInterval(() => loadTasks(true), 5000);
    return () => clearInterval(interval);
  }, []);

  // ── filter logic ──
  const filtered = tasks.filter((t) => {
    if (filterState   !== "ALL" && t.current_state !== filterState)   return false;
    if (filterProject !== "ALL" && t.project_id    !== filterProject) return false;
    if (filterPriority !== "ALL" && t.priority     !== filterPriority) return false;
    return true;
  });

  // ── stat counts ──
  const counts = {
    total:   tasks.length,
    draft:   tasks.filter(t => t.current_state === "DRAFT").length,
    active:  tasks.filter(t => t.current_state === "IN_PROGRESS").length,
    pending: tasks.filter(t => t.current_state === "PENDING_APPROVAL").length,
    done:    tasks.filter(t => t.current_state === "DONE").length,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── 헤더 ── */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 4 }}>
            Task OS
          </h1>
          <p style={{ fontSize: 13, color: "#9ca3af" }}>
            Projection 기반 워크플로우 엔진
          </p>
        </div>

        {/* ── 스탯 카드 ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { label: "Draft",    count: counts.draft,   color: "#6b7280", bg: "#f3f4f6" },
            { label: "진행 중", count: counts.active,  color: "#2563eb", bg: "#eff6ff" },
            { label: "승인 대기", count: counts.pending, color: "#d97706", bg: "#fffbeb" },
            { label: "완료",    count: counts.done,    color: "#059669", bg: "#ecfdf5" },
          ].map((s) => (
            <div key={s.label} style={{
              background: "white", borderRadius: 12, padding: "14px 18px",
              border: "1px solid #e5e7eb",
            }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Task 생성 ── */}
        <div style={{
          background: "white", borderRadius: 12, padding: 16,
          border: "1px solid #e5e7eb", marginBottom: 20,
          display: "flex", gap: 10, alignItems: "center",
        }}>
          <input
            placeholder="+ 새 Task 제목 입력..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createTask()}
            style={{
              flex: 1, padding: "8px 12px", fontSize: 14,
              border: "1px solid #e5e7eb", borderRadius: 8,
              outline: "none", color: "#111827",
            }}
          />
          <button
            onClick={createTask}
            disabled={creating}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: "#111827", color: "white", fontSize: 13,
              fontWeight: 600, cursor: creating ? "not-allowed" : "pointer",
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? "생성 중..." : "Create"}
          </button>
        </div>

        {/* ── 필터 ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {/* 상태 필터 */}
          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="ALL">모든 상태</option>
            <option value="DRAFT">Draft</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="DONE">Done</option>
          </select>

          {/* 프로젝트 필터 */}
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="ALL">모든 프로젝트</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* 우선순위 필터 */}
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            style={filterSelectStyle}
          >
            <option value="ALL">모든 우선순위</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <span style={{ fontSize: 12, color: "#9ca3af", alignSelf: "center", marginLeft: 4 }}>
            {filtered.length}개
          </span>
        </div>

        {/* ── 에러 / 로딩 ── */}
        {loading && <p style={{ color: "#9ca3af", fontSize: 14 }}>불러오는 중...</p>}
        {error   && <p style={{ color: "#ef4444", fontSize: 14 }}>⚠ {error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#d1d5db" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14 }}>Task가 없습니다</div>
          </div>
        )}

        {/* ── Task 목록 ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((task) => {
            const sm        = STATE_META[task.current_state] ?? STATE_META.DRAFT;
            const dueStatus = getDueDateStatus(task.due_date);
            const priDot    = PRIORITY_DOT[task.priority ?? "MEDIUM"];

            return (
              <Link
                key={task.task_id}
                href={`/dashboard/${task.task_id}`}
                style={{ textDecoration: "none" }}
              >
                <div style={{
                  background: "white", borderRadius: 12, padding: "14px 18px",
                  border: "1px solid #e5e7eb", cursor: "pointer",
                  transition: "box-shadow 0.15s, transform 0.1s",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "center",
                }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
                    (e.currentTarget as HTMLDivElement).style.transform  = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                    (e.currentTarget as HTMLDivElement).style.transform  = "none";
                  }}
                >
                  {/* 왼쪽 */}
                  <div>
                    {/* 프로젝트 + 우선순위 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: priDot, display: "inline-block", flexShrink: 0,
                      }} />
                      {task.project_name && (
                        <span style={{
                          fontSize: 11, color: task.project_color ?? "#6b7280",
                          fontWeight: 600, letterSpacing: "0.03em",
                        }}>
                          {task.project_name}
                        </span>
                      )}
                    </div>

                    {/* 제목 */}
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 6 }}>
                      {task.title}
                    </div>

                    {/* 메타 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      {/* 담당자 */}
                      {task.assignee_name || task.assignee_email ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: "50%",
                            background: "#e0e7ff", color: "#4f46e5",
                            fontSize: 10, fontWeight: 700,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {getInitial(task.assignee_name, task.assignee_email)}
                          </div>
                          <span style={{ fontSize: 12, color: "#6b7280" }}>
                            {task.assignee_name || task.assignee_email}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: "#d1d5db" }}>미배정</span>
                      )}

                      {/* 마감일 */}
                      {dueStatus && (
                        <span style={{ fontSize: 12, color: dueStatus.color, fontWeight: 500 }}>
                          📅 {dueStatus.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 오른쪽: 상태 뱃지 */}
                  <span style={{
                    background: sm.bg, color: sm.color,
                    padding: "4px 10px", borderRadius: 999,
                    fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
                  }}>
                    {sm.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const filterSelectStyle: React.CSSProperties = {
  fontSize: 12, color: "#374151", border: "1px solid #e5e7eb",
  borderRadius: 8, padding: "6px 10px", background: "white",
  outline: "none", cursor: "pointer",
};
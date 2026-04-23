import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  INBOX_COMPONENTS,
  STATE_META,
  TEMPLATE_META,
  type Analytics,
  type AppData,
  type DecisionType,
  type InboxComponent,
  type Member,
  type Note,
  type Role,
  type Task,
  type TaskState,
  type Template,
  type TemplateType,
  type ThreadComment,
  type TimelineEvent
} from "@hwe/shared";
import { Badge, Centered, Meta, PageHeader, PanelHeader, PanelTitle, Select, Tabs } from "./components/ui";
import { request } from "./lib/api";
import { currentRoute, go, type Route } from "./lib/router";
import type { TaskDetail, TaskView } from "./lib/viewTypes";

const templateOrder: TemplateType[] = ["VISION", "AXIS", "OBJECTIVE", "KEYRESULT", "TASK"];
const states: Array<"ALL" | TaskState> = ["ALL", "DRAFT", "IN_PROGRESS", "PENDING_APPROVAL", "DONE", "CANCELED"];
const templateTypes: Array<"ALL" | TemplateType> = ["ALL", "VISION", "AXIS", "OBJECTIVE", "KEYRESULT", "TASK"];
const roleLabel: Record<Role, string> = {
  VIEWER: "뷰어",
  EDITOR: "편집자",
  APPROVER: "승인자",
  ADMIN: "관리자"
};
const priorityLabel: Record<TaskView["priority"], string> = {
  LOW: "낮음",
  MEDIUM: "보통",
  HIGH: "높음",
  URGENT: "긴급"
};
const decisionLabel: Record<DecisionType, string> = {
  APPROVE: "승인",
  REJECT: "반려",
  SUPPLEMENT: "보완 요청",
  STATE_ONLY: "상태 변경"
};
const eventLabel: Record<string, string> = {
  TASK_CREATED: "태스크 생성",
  STATE_TRANSITION: "상태 변경",
  APPROVAL_REQUESTED: "승인 요청",
  APPROVAL_APPROVED: "승인 완료",
  APPROVAL_REJECTED: "승인 반려",
  NOTE_UPDATED: "노트 수정",
  COMMENT: "댓글",
  MENTION: "호출",
  HIERARCHY_CHANGE: "계층 변경",
  COMPLETED: "완료",
  CANCELED: "취소"
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(value));
}

function elapsed(value: string) {
  const hours = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 36e5));
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

function hasChangedSinceSeen(task: TaskView, parent: TaskView | null, userId: string) {
  const seenAt = task.lastSeenAtByUser[userId];
  if (!seenAt) return Boolean(parent);
  return parent ? new Date(parent.updatedAt).getTime() > new Date(seenAt).getTime() : false;
}

function memberName(members: Member[], id: string) {
  return members.find((member) => member.id === id)?.name ?? "알 수 없음";
}

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

export function App() {
  const [route, setRoute] = useState<Route>(() => currentRoute());
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      setError(null);
      setData(await request<AppData>("/api/bootstrap"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    }
  };

  useEffect(() => {
    const onPop = () => setRoute(currentRoute());
    window.addEventListener("popstate", onPop);
    void reload();
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (error) {
    return (
      <Centered>
        <div className="error-panel">
          <div className="eyebrow">API 오류</div>
          <h1>백엔드 서버 연결이 필요합니다</h1>
          <p>{error}</p>
          <button className="button primary" onClick={() => void reload()}>
            다시 시도
          </button>
        </div>
      </Centered>
    );
  }

  if (!data) {
    return (
      <Centered>
        <div className="loader" />
      </Centered>
    );
  }

  return (
    <Shell route={route.path} me={data.me} inbox={data.inbox} onNavigate={go}>
      {route.path.startsWith("/tasks/") && route.taskId ? (
        <TaskWorkspace taskId={route.taskId} me={data.me} onReload={reload} />
      ) : route.path === "/tasks" ? (
        <TasksView tasks={data.tasks as TaskView[]} members={data.members} onReload={reload} />
      ) : route.path === "/graph" ? (
        <DecisionGraphView data={data} />
      ) : route.path === "/inbox" ? (
        <InboxView data={data} onReload={reload} />
      ) : route.path === "/templates" ? (
        <TemplatesView templates={data.templates} onReload={reload} />
      ) : route.path === "/admin/members" ? (
        <MembersView members={data.members} onReload={reload} />
      ) : route.path === "/admin/analytics" ? (
        <AnalyticsView analytics={data.analytics} />
      ) : (
        <HierarchyView data={data} />
      )}
    </Shell>
  );
}

function Shell({
  route,
  me,
  inbox,
  onNavigate,
  children
}: {
  route: string;
  me: Member;
  inbox: AppData["inbox"];
  onNavigate: (path: string) => void;
  children: ReactNode;
}) {
  const unread = inbox.filter((item) => !item.readAt).length;
	  const links = [
		    { path: "/hierarchy", label: "계층", mark: "H" },
		    { path: "/graph", label: "결정 그래프", mark: "G" },
		    { path: "/inbox", label: "알림함", mark: String(unread) },
    { path: "/tasks", label: "태스크", mark: "T" },
    { path: "/templates", label: "템플릿", mark: "P" },
    { path: "/admin/members", label: "멤버", mark: "M" },
    { path: "/admin/analytics", label: "분석", mark: "A" }
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => onNavigate("/hierarchy")}>
          <span className="brand-mark">S4</span>
          <span>
            <strong>SelvasIn4</strong>
            <small>HWE 결정 운영체계</small>
          </span>
        </button>
        <nav className="nav-list">
          {links.map((link) => (
            <button
              key={link.path}
              className={`nav-item ${route === link.path || (link.path === "/hierarchy" && route === "/") ? "active" : ""}`}
              onClick={() => onNavigate(link.path)}
            >
              <span className="nav-mark">{link.mark}</span>
              {link.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">HWE MVP R2/R3</div>
            <strong>결정 워크스페이스</strong>
          </div>
          <div className="top-actions">
            <button className="search-button">검색</button>
            <Badge tone="blue">{roleLabel[me.role]}</Badge>
            <div className="avatar">{me.name.slice(0, 1)}</div>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

function HierarchyView({ data }: { data: AppData }) {
  const tasks = data.tasks as TaskView[];
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"ALL" | TemplateType>("ALL");
  const [state, setState] = useState<"ALL" | TaskState>("ALL");
  const [assignee, setAssignee] = useState("ALL");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tasks.map((task) => task.id)));

  const filteredIds = useMemo(() => {
    const matched = new Set<string>();
    tasks.forEach((task) => {
      const okSearch = !search || `${task.title} ${task.description}`.toLowerCase().includes(search.toLowerCase());
      const okType = type === "ALL" || task.templateType === type;
      const okState = state === "ALL" || task.currentState === state;
      const okAssignee = assignee === "ALL" || task.assigneeIds.includes(assignee);
      if (okSearch && okType && okState && okAssignee) {
        let cursor: Task | undefined = task;
        while (cursor) {
          matched.add(cursor.id);
          cursor = cursor.parentId ? tasks.find((row) => row.id === cursor?.parentId) : undefined;
        }
      }
    });
    return matched;
  }, [assignee, search, state, tasks, type]);

  const byParent = useMemo(() => {
    const map = new Map<string | null, TaskView[]>();
    tasks.forEach((task) => {
      if (!filteredIds.has(task.id)) return;
      const rows = map.get(task.parentId) ?? [];
      rows.push(task);
      rows.sort((a, b) => templateOrder.indexOf(a.templateType) - templateOrder.indexOf(b.templateType));
      map.set(task.parentId, rows);
    });
    return map;
  }, [filteredIds, tasks]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const param = [...next].join(",");
      window.history.replaceState({}, "", `/hierarchy?expanded=${param}`);
      return next;
    });
  };

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="계층"
        title="결정 대상 구조"
        action={<button className="button primary" onClick={() => go("/tasks")}>새 태스크</button>}
      />
      <div className="toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="태스크 검색" />
        <Select value={type} onChange={(v) => setType(v as typeof type)} options={templateTypes.map((v) => [v, v === "ALL" ? "전체 유형" : TEMPLATE_META[v].label])} />
        <Select value={state} onChange={(v) => setState(v as typeof state)} options={states.map((v) => [v, v === "ALL" ? "전체 상태" : STATE_META[v].label])} />
        <Select value={assignee} onChange={setAssignee} options={[["ALL", "전체 담당자"], ...data.members.map((m) => [m.id, m.name] as [string, string])]} />
      </div>
      <div className="hierarchy-board">
        {(byParent.get(null) ?? []).map((task) => (
          <TreeNode key={task.id} task={task} byParent={byParent} expanded={expanded} onToggle={toggle} level={0} />
        ))}
      </div>
    </section>
  );
}

function TreeNode({
  task,
  byParent,
  expanded,
  onToggle,
  level
}: {
  task: TaskView;
  byParent: Map<string | null, TaskView[]>;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  level: number;
}) {
  const children = byParent.get(task.id) ?? [];
  return (
    <div className="tree-node" style={{ marginLeft: level ? 24 : 0 }}>
      <div className="tree-card">
        <button className="tree-toggle" onClick={() => onToggle(task.id)} aria-label="toggle">
          {children.length ? (expanded.has(task.id) ? "−" : "+") : ""}
        </button>
        <button className="tree-main" onClick={() => go(`/tasks/${task.id}`)}>
          <Badge tone={TEMPLATE_META[task.templateType].tone}>{TEMPLATE_META[task.templateType].label}</Badge>
          <span className="tree-title">{task.title}</span>
          <span className="tree-meta">
            노트 {task.activity.notesCount} · 스레드 {task.activity.commentsCount} · 파일 {task.activity.filesCount}
          </span>
        </button>
        <Badge tone={STATE_META[task.currentState].tone}>{STATE_META[task.currentState].label}</Badge>
      </div>
      {expanded.has(task.id) && children.length > 0 && (
        <div className="tree-children">
          {children.map((child) => (
            <TreeNode key={child.id} task={child} byParent={byParent} expanded={expanded} onToggle={onToggle} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

type GraphLayer = "context" | "decision" | "refs";

function shortText(value: string, max = 32) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function DecisionGraphView({ data }: { data: AppData }) {
  const tasks = data.tasks as TaskView[];
  const [focusId, setFocusId] = useState("ALL");
  const [layers, setLayers] = useState<Set<GraphLayer>>(() => new Set(["context", "decision", "refs"]));

  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const noteMap = useMemo(() => new Map(data.notes.map((note) => [note.id, note])), [data.notes]);
  const byParent = useMemo(() => {
    const map = new Map<string | null, TaskView[]>();
    tasks.forEach((task) => {
      const rows = map.get(task.parentId) ?? [];
      rows.push(task);
      rows.sort((a, b) => templateOrder.indexOf(a.templateType) - templateOrder.indexOf(b.templateType));
      map.set(task.parentId, rows);
    });
    return map;
  }, [tasks]);

  const orderedTasks = useMemo(() => {
    const rows: TaskView[] = [];
    const visit = (parentId: string | null) => {
      (byParent.get(parentId) ?? []).forEach((task) => {
        rows.push(task);
        visit(task.id);
      });
    };
    visit(null);
    return rows;
  }, [byParent]);

  const visibleTaskIds = useMemo(() => {
    if (focusId === "ALL") return new Set(tasks.map((task) => task.id));
    const ids = new Set<string>([focusId]);
    const addAncestors = (taskId: string) => {
      let cursor = taskMap.get(taskId);
      while (cursor?.parentId) {
        ids.add(cursor.parentId);
        cursor = taskMap.get(cursor.parentId);
      }
    };
    const addDescendants = (taskId: string) => {
      (byParent.get(taskId) ?? []).forEach((child) => {
        ids.add(child.id);
        addDescendants(child.id);
      });
    };
    addAncestors(focusId);
    addDescendants(focusId);
    data.comments.forEach((comment) => {
      if (comment.taskId !== focusId && !ids.has(comment.taskId)) return;
      comment.referencedNoteIds.forEach((noteId) => {
        const note = noteMap.get(noteId);
        if (note) ids.add(note.taskId);
      });
    });
    return ids;
  }, [byParent, data.comments, focusId, noteMap, taskMap, tasks]);

  const graphTasks = orderedTasks.filter((task) => visibleTaskIds.has(task.id));
  const depthOf = (task: TaskView) => {
    let depth = 0;
    let cursor = task.parentId ? taskMap.get(task.parentId) : undefined;
    while (cursor) {
      depth += 1;
      cursor = cursor.parentId ? taskMap.get(cursor.parentId) : undefined;
    }
    return depth;
  };
  const positions = new Map(graphTasks.map((task, index) => [task.id, { x: 56 + depthOf(task) * 190, y: 48 + index * 88, width: 158, height: 52 }]));
  const width = Math.max(1020, Math.max(...graphTasks.map((task) => (positions.get(task.id)?.x ?? 0) + 260), 900));
  const height = Math.max(460, graphTasks.length * 88 + 96);
  const noteCounts = new Map(graphTasks.map((task) => [task.id, data.notes.filter((note) => note.taskId === task.id).length]));
  const commentCounts = new Map(graphTasks.map((task) => [task.id, data.comments.filter((comment) => comment.taskId === task.id).length]));
  const decisionCounts = new Map(graphTasks.map((task) => [task.id, data.timeline.filter((event) => event.taskId === task.id && event.decisionType).length]));
  const refEdges = data.comments.flatMap((comment) =>
    comment.referencedNoteIds
      .map((noteId) => ({ sourceTaskId: comment.taskId, targetTaskId: noteMap.get(noteId)?.taskId, noteId }))
      .filter((edge): edge is { sourceTaskId: string; targetTaskId: string; noteId: string } => Boolean(edge.targetTaskId))
      .filter((edge) => visibleTaskIds.has(edge.sourceTaskId) && visibleTaskIds.has(edge.targetTaskId))
  );
  const decisionRefEdges = data.timeline.flatMap((event) =>
    event.referencedNoteIds
      .map((noteId) => ({ sourceTaskId: event.taskId, targetTaskId: noteMap.get(noteId)?.taskId, noteId }))
      .filter((edge): edge is { sourceTaskId: string; targetTaskId: string; noteId: string } => Boolean(edge.targetTaskId))
      .filter((edge) => visibleTaskIds.has(edge.sourceTaskId) && visibleTaskIds.has(edge.targetTaskId))
  );
  const selectedTask = focusId === "ALL" ? null : taskMap.get(focusId);
  const toggleLayer = (layer: GraphLayer) => {
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="결정 그래프"
        title="조직 결정 자산 지도"
        action={<button className="button secondary" onClick={() => go("/hierarchy")}>계층 보기</button>}
      />
      <div className="toolbar graph-toolbar">
        <Select value={focusId} onChange={setFocusId} options={[["ALL", "전체 그래프"], ...orderedTasks.map((task) => [task.id, task.title] as [string, string])]} />
        <button className={`button ${layers.has("context") ? "primary" : "secondary"}`} onClick={() => toggleLayer("context")}>맥락</button>
        <button className={`button ${layers.has("decision") ? "primary" : "secondary"}`} onClick={() => toggleLayer("decision")}>결정</button>
        <button className={`button ${layers.has("refs") ? "primary" : "secondary"}`} onClick={() => toggleLayer("refs")}>#참조</button>
      </div>
      <div className="graph-metrics">
        <article className="metric-card"><small>노드</small><strong>{graphTasks.length}</strong></article>
        <article className="metric-card"><small>노트</small><strong>{data.notes.filter((note) => visibleTaskIds.has(note.taskId)).length}</strong></article>
        <article className="metric-card"><small>스레드 참조</small><strong>{refEdges.length}</strong></article>
        <article className="metric-card"><small>결정 참조</small><strong>{decisionRefEdges.length}</strong></article>
      </div>
      <div className="decision-graph-layout">
        <section className="graph-board" aria-label="결정 그래프 시각화">
          <svg viewBox={`0 0 ${width} ${height}`} role="img">
            <defs>
              <marker id="arrow-solid" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
              <marker id="arrow-ref" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            {graphTasks.map((task) => {
              if (!task.parentId || !visibleTaskIds.has(task.parentId)) return null;
              const from = positions.get(task.parentId);
              const to = positions.get(task.id);
              if (!from || !to) return null;
              return <path key={`${task.parentId}-${task.id}`} className="graph-edge hierarchy" d={`M ${from.x + from.width} ${from.y + from.height / 2} C ${from.x + from.width + 44} ${from.y + from.height / 2}, ${to.x - 44} ${to.y + to.height / 2}, ${to.x} ${to.y + to.height / 2}`} markerEnd="url(#arrow-solid)" />;
            })}
            {layers.has("refs") && refEdges.map((edge, index) => {
              const from = positions.get(edge.sourceTaskId);
              const to = positions.get(edge.targetTaskId);
              if (!from || !to) return null;
              const sameTask = edge.sourceTaskId === edge.targetTaskId;
              const yOffset = sameTask ? 32 + index * 2 : 0;
              return <path key={`${edge.sourceTaskId}-${edge.noteId}-${index}`} className="graph-edge ref" d={`M ${from.x + from.width / 2} ${from.y + from.height + 4} C ${from.x + 40} ${from.y + 88 + yOffset}, ${to.x + to.width - 40} ${to.y - 36 - yOffset}, ${to.x + to.width / 2} ${to.y - 4}`} markerEnd="url(#arrow-ref)" />;
            })}
            {layers.has("decision") && decisionRefEdges.map((edge, index) => {
              const from = positions.get(edge.sourceTaskId);
              const to = positions.get(edge.targetTaskId);
              if (!from || !to || edge.sourceTaskId === edge.targetTaskId) return null;
              return <path key={`decision-${edge.sourceTaskId}-${edge.noteId}-${index}`} className="graph-edge decision" d={`M ${from.x + from.width} ${from.y + 12} C ${from.x + 86} ${from.y - 34}, ${to.x + 80} ${to.y - 34}, ${to.x} ${to.y + 12}`} markerEnd="url(#arrow-solid)" />;
            })}
            {graphTasks.map((task) => {
              const pos = positions.get(task.id)!;
              const notes = noteCounts.get(task.id) ?? 0;
              const comments = commentCounts.get(task.id) ?? 0;
              const decisions = decisionCounts.get(task.id) ?? 0;
              return (
                <g key={task.id} className={`graph-node graph-node-${task.templateType.toLowerCase()} ${task.id === focusId ? "focused" : ""}`} onClick={() => go(`/tasks/${task.id}`)} tabIndex={0} role="button">
                  <rect x={pos.x} y={pos.y} width={pos.width} height={pos.height} rx="8" />
                  <text x={pos.x + 12} y={pos.y + 19} className="graph-node-type">{TEMPLATE_META[task.templateType].label}</text>
                  <text x={pos.x + 12} y={pos.y + 38} className="graph-node-title">{shortText(task.title, 25)}</text>
                  {layers.has("context") && (
                    <>
                      <circle cx={pos.x + pos.width - 48} cy={pos.y + pos.height - 13} r="10" className="graph-context-note" />
                      <text x={pos.x + pos.width - 48} y={pos.y + pos.height - 9} className="graph-count">{notes}</text>
                      <circle cx={pos.x + pos.width - 22} cy={pos.y + pos.height - 13} r="10" className="graph-context-thread" />
                      <text x={pos.x + pos.width - 22} y={pos.y + pos.height - 9} className="graph-count">{comments}</text>
                    </>
                  )}
                  {layers.has("decision") && decisions > 0 && (
                    <>
                      <circle cx={pos.x + pos.width - 10} cy={pos.y + 8} r="11" className="graph-decision-ring" />
                      <text x={pos.x + pos.width - 10} y={pos.y + 12} className="graph-count">{decisions}</text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </section>
        <aside className="graph-inspector">
          <PanelTitle title="레이어" />
          <div className="graph-legend">
            <span><i className="legend hierarchy" />계층 parentId</span>
            <span><i className="legend context-note" />노트 맥락</span>
            <span><i className="legend context-thread" />스레드 맥락</span>
            <span><i className="legend decision" />타임라인 결정</span>
            <span><i className="legend ref" /># 참조</span>
          </div>
          <div className="graph-inspector-card">
            <small>초점</small>
            <strong>{selectedTask ? selectedTask.title : "전체 그래프"}</strong>
            <p>{selectedTask ? selectedTask.description : "태스크 계층, 노트, 스레드, 타임라인, # 참조가 한 화면에서 연결됩니다."}</p>
          </div>
          <div className="graph-inspector-card">
            <small>축적 행위</small>
            <strong>결정 그래프</strong>
            <p>노드 생성, 맥락 축적, 결정 근거 기록, 횡단 참조가 쌓일수록 다음 루프의 재방문 이유가 커집니다.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function TaskWorkspace({ taskId, me, onReload }: { taskId: string; me: Member; onReload: () => Promise<void> }) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [decision, setDecision] = useState<{ toState: TaskState; decisionType: DecisionType; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState(false);
  const [taskDraft, setTaskDraft] = useState({ title: "", description: "" });

  const load = async () => {
    setDetail(await request<TaskDetail>(`/api/tasks/${taskId}`));
  };

  useEffect(() => {
    void load();
  }, [taskId]);

  useEffect(() => {
    if (!detail) return;
    setTaskDraft({ title: detail.task.title, description: detail.task.description });
  }, [detail?.task.description, detail?.task.id, detail?.task.title]);

  if (!detail) return <Centered><div className="loader" /></Centered>;

	  const { task, parent, notes, referenceableNotes = notes, comments, timeline, members, children } = detail;
  const changed = hasChangedSinceSeen(task, parent, me.id);
  const canApprove = ["APPROVER", "ADMIN"].includes(me.role);
  const canDeleteTask = me.role === "ADMIN" || task.ownerId === me.id;

  const saveTask = async () => {
    if (!taskDraft.title.trim()) {
      setActionError("태스크 제목은 비워둘 수 없습니다.");
      return;
    }
    try {
      setBusy(true);
      setActionError(null);
      await request(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(taskDraft) });
      setEditingTask(false);
      await Promise.all([load(), onReload()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "태스크 저장 실패. 입력값과 권한을 확인하세요.");
    } finally {
      setBusy(false);
    }
  };

  const deleteTask = async () => {
    if (!canDeleteTask || !window.confirm("이 태스크와 하위 태스크, 노트, 스레드, 타임라인을 삭제할까요?")) return;
    try {
      setBusy(true);
      setActionError(null);
      await request(`/api/tasks/${task.id}`, { method: "DELETE" });
      await onReload();
      go("/tasks");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "태스크 삭제 실패. 권한과 하위 구조를 확인하세요.");
    } finally {
      setBusy(false);
    }
  };

  const transition = async (payload: { toState: TaskState; decisionType: DecisionType; reason: string; referencedNoteIds: string[] }) => {
    try {
      setBusy(true);
      setActionError(null);
      await request(`/api/tasks/${task.id}/transition`, { method: "POST", body: JSON.stringify(payload) });
      await Promise.all([load(), onReload()]);
      setDecision(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "처리 실패. 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-stack">
      <div className="task-heading">
        <button className="back-link" onClick={() => go("/hierarchy")}>계층으로 돌아가기</button>
        <div className="task-title-row">
          <Badge tone={TEMPLATE_META[task.templateType].tone}>{TEMPLATE_META[task.templateType].label}</Badge>
          <h1>{task.title}</h1>
          <Badge tone={STATE_META[task.currentState].tone}>{STATE_META[task.currentState].label}</Badge>
          <div className="task-heading-actions">
            <button className="button secondary" disabled={busy} onClick={() => setEditingTask((value) => !value)}>{editingTask ? "닫기" : "수정"}</button>
            <button className="button danger" disabled={busy || !canDeleteTask} title={canDeleteTask ? "태스크 삭제" : "소유자 또는 관리자만 삭제할 수 있습니다."} onClick={() => void deleteTask()}>삭제</button>
          </div>
        </div>
        {editingTask ? (
          <div className="task-editor">
            <input value={taskDraft.title} maxLength={120} onChange={(event) => setTaskDraft((prev) => ({ ...prev, title: event.target.value }))} placeholder="태스크 제목" />
            <textarea value={taskDraft.description} maxLength={1200} rows={3} onChange={(event) => setTaskDraft((prev) => ({ ...prev, description: event.target.value }))} placeholder="태스크 설명" />
            <div className="row-actions">
              <button className="button secondary" disabled={busy} onClick={() => setEditingTask(false)}>취소</button>
              <button className="button primary" disabled={busy || !taskDraft.title.trim()} onClick={() => void saveTask()}>태스크 저장</button>
            </div>
          </div>
        ) : (
          <p className="task-description">{task.description || "설명이 아직 없습니다."}</p>
        )}
      </div>

      {changed && parent && (
        <div className="change-banner">
          <strong>{parent.title}</strong>
          <span>상위 결정 대상이 마지막 방문 이후 업데이트되었습니다.</span>
          <button className="button secondary" onClick={() => go(`/tasks/${parent.id}`)}>확인</button>
        </div>
      )}

      <div className="decision-layout">
        <SystemFieldsPanel task={task} members={members} childrenCount={children.length} notes={notes} comments={comments} onReload={load} />

        <div className="main-column">
          <NotesSection taskId={task.id} notes={notes} members={members} onReload={load} />
          <FormOutput task={task} onReload={load} />
	          <TimelinePanel timeline={timeline} notes={referenceableNotes} members={members} />
	        </div>
	
	        <ThreadPanel taskId={task.id} notes={referenceableNotes} comments={comments} members={members} me={me} onReload={load} />
      </div>

      <div className="decision-bar">
        <div>
          <strong>결정 액션</strong>
          <span>{actionError ?? "사유와 참조 노트가 타임라인에 기록됩니다."}</span>
        </div>
        <div className="bar-actions">
          {task.currentState === "DRAFT" && (
            <button className="button secondary" onClick={() => setDecision({ toState: "IN_PROGRESS", decisionType: "STATE_ONLY", title: "작업 시작" })}>시작</button>
          )}
          {task.currentState === "IN_PROGRESS" && (
            <button className="button primary" onClick={() => setDecision({ toState: "PENDING_APPROVAL", decisionType: "SUPPLEMENT", title: "검토 요청" })}>검토 요청</button>
          )}
          {task.currentState === "PENDING_APPROVAL" && canApprove && (
            <>
              <button className="button secondary" onClick={() => setDecision({ toState: "IN_PROGRESS", decisionType: "SUPPLEMENT", title: "보완 요청" })}>보완 요청</button>
              <button className="button danger" onClick={() => setDecision({ toState: "CANCELED", decisionType: "REJECT", title: "반려" })}>반려</button>
              <button className="button primary" onClick={() => setDecision({ toState: "DONE", decisionType: "APPROVE", title: "승인" })}>승인</button>
            </>
          )}
          {task.currentState === "PENDING_APPROVAL" && !canApprove && (
            <button className="button secondary" disabled title="승인자 또는 관리자만 결정 전이를 실행할 수 있습니다.">
              승인 권한 필요
            </button>
          )}
        </div>
      </div>

      {decision && (
        <DecisionModal
	          decision={decision}
	          notes={referenceableNotes}
          busy={busy}
          onClose={() => setDecision(null)}
          onSubmit={transition}
        />
      )}
    </section>
  );
}

function SystemFieldsPanel({
  task,
  members,
  childrenCount,
  notes,
  comments,
  onReload
}: {
  task: TaskView;
  members: Member[];
  childrenCount: number;
  notes: Note[];
  comments: ThreadComment[];
  onReload: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const patchTask = async (label: string, patch: Partial<Pick<TaskView, "priority" | "dueDate" | "assigneeIds" | "watcherIds">>) => {
    try {
      setSaving(label);
      setError(null);
      await request(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "시스템 필드 저장 실패. 권한과 입력값을 확인한 뒤 다시 시도하세요.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <aside className="system-panel">
      <div className="panel-header">
        <PanelTitle title="시스템" />
        {saving && <span className="save-indicator">저장 중</span>}
      </div>
      {error && <p className="form-error">{error}</p>}
      <Meta label="소유자">{task.owner.name}</Meta>
      <Meta label="우선순위">
        <Select
          value={task.priority}
          onChange={(priority) => void patchTask("priority", { priority: priority as TaskView["priority"] })}
          options={["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => [value, priorityLabel[value as TaskView["priority"]]])}
        />
      </Meta>
      <Meta label="기한">
        <input
          type="date"
          value={task.dueDate?.slice(0, 10) ?? ""}
          onChange={(event) => void patchTask("dueDate", { dueDate: event.target.value || null })}
        />
      </Meta>
      <Meta label="담당자">
        <div className="check-stack">
          {members.map((member) => (
            <label key={member.id}>
              <input
                type="checkbox"
                checked={task.assigneeIds.includes(member.id)}
                onChange={() => void patchTask("assignees", { assigneeIds: toggleId(task.assigneeIds, member.id) })}
              />
              <span>{member.name}</span>
            </label>
          ))}
        </div>
      </Meta>
      <Meta label="참관자">
        <div className="check-stack">
          {members.map((member) => (
            <label key={member.id}>
              <input
                type="checkbox"
                checked={task.watcherIds.includes(member.id)}
                onChange={() => void patchTask("watchers", { watcherIds: toggleId(task.watcherIds, member.id) })}
              />
              <span>{member.name}</span>
            </label>
          ))}
        </div>
      </Meta>
      <Meta label="하위 항목">{childrenCount}</Meta>
      <Meta label="노트">{notes.length}</Meta>
      <Meta label="스레드">{comments.length}</Meta>
      <Meta label="파일">{notes.flatMap((note) => note.attachments).length}</Meta>
    </aside>
  );
}

function NotesSection({ taskId, notes, members, onReload }: { taskId: string; notes: Note[]; members: Member[]; onReload: () => Promise<void> }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(notes.map((note) => note.id)));
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createNote = async () => {
    if (!title.trim()) {
      setError("노트 제목이 필요합니다. 제목을 입력하면 생성할 수 있습니다.");
      return;
    }
    try {
      setCreating(true);
      setError(null);
      await request(`/api/tasks/${taskId}/notes`, { method: "POST", body: JSON.stringify({ title, content }) });
      setTitle("");
      setContent("");
      setCreateOpen(false);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "노트 생성 실패. 입력값을 확인한 뒤 다시 시도하세요.");
    } finally {
      setCreating(false);
    }
  };

  return (
	    <section className="panel">
	      <PanelHeader title={`노트 (${notes.length})`} action={<button className="button secondary" onClick={() => setCreateOpen((v) => !v)}>{createOpen ? "닫기" : "추가"}</button>} />
	      {error && !createOpen && <p className="form-error">{error}</p>}
	      {createOpen && (
        <div className="note-create">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="노트 제목" maxLength={120} />
          <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="핵심 맥락이나 결정 근거를 작성하세요" rows={4} maxLength={5000} />
          {error && <p className="form-error">{error}</p>}
          <div className="row-actions">
            <button className="button secondary" onClick={() => setCreateOpen(false)}>취소</button>
            <button className="button primary" disabled={creating || !title.trim()} onClick={() => void createNote()}>노트 생성</button>
          </div>
        </div>
      )}
      <div className="accordion-list">
        {notes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            author={memberName(members, note.lastEditorId)}
            open={open.has(note.id)}
            creating={creating}
            onToggle={() => setOpen((prev) => {
              const next = new Set(prev);
              if (next.has(note.id)) next.delete(note.id);
              else next.add(note.id);
              return next;
            })}
	            onSave={async (patch) => {
	              try {
	                setCreating(true);
	                setError(null);
	                await request(`/api/notes/${note.id}`, { method: "PATCH", body: JSON.stringify(patch) });
	                await onReload();
	              } catch (err) {
	                setError(err instanceof Error ? err.message : "노트 저장 실패. 권한과 입력값을 확인하세요.");
	              } finally {
	                setCreating(false);
	              }
	            }}
	            onDelete={async () => {
	              if (!window.confirm("이 노트를 삭제할까요? 스레드의 참조도 함께 정리됩니다.")) return;
	              try {
	                setCreating(true);
	                setError(null);
	                await request(`/api/notes/${note.id}`, { method: "DELETE" });
	                await onReload();
	              } catch (err) {
	                setError(err instanceof Error ? err.message : "노트 삭제 실패. 권한과 대상 노트를 확인하세요.");
	              } finally {
	                setCreating(false);
	              }
	            }}
	          />
        ))}
      </div>
    </section>
  );
}

function NoteCard({
  note,
  author,
  open,
  creating,
	  onToggle,
	  onSave,
	  onDelete
	}: {
	  note: Note;
	  author: string;
	  open: boolean;
	  creating: boolean;
	  onToggle: () => void;
	  onSave: (patch: { title?: string; content?: string }) => Promise<void>;
	  onDelete: () => Promise<void>;
	}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
  }, [note.content, note.title]);

  return (
    <div className="note-card">
      <button className="note-head" onClick={onToggle}>
        <span>{open ? "−" : "+"}</span>
        <strong>{note.title}</strong>
        <small>{author} · {elapsed(note.updatedAt)}</small>
      </button>
      {open && (
        <div className="note-body">
          {editing ? (
            <>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
              <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} />
              <div className="row-actions">
                <button className="button secondary" onClick={() => setEditing(false)}>취소</button>
                <button className="button primary" disabled={creating} onClick={() => {
                  void onSave({ title, content }).then(() => setEditing(false));
                }}>저장</button>
              </div>
            </>
          ) : (
            <>
              <p>{note.content}</p>
              {note.attachments.length > 0 && (
                <div className="file-list">
                  {note.attachments.map((file) => <span key={file}>{file}</span>)}
                </div>
              )}
	              <div className="row-actions left">
	                <button className="text-button" onClick={() => setEditing(true)}>노트 수정</button>
	                <button className="text-button danger-text" disabled={creating} onClick={() => void onDelete()}>노트 삭제</button>
	              </div>
	            </>
	          )}
        </div>
      )}
    </div>
  );
}

function ThreadPanel({
  taskId,
  notes,
  comments,
  members,
  me,
  onReload
}: {
  taskId: string;
  notes: Note[];
  comments: ThreadComment[];
  members: Member[];
  me: Member;
  onReload: () => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [refs, setRefs] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editRefs, setEditRefs] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!content.trim()) return;
    try {
      setBusy(true);
      setError(null);
      await request(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content, referencedNoteIds: [...refs] })
      });
      setContent("");
      setRefs(new Set());
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "스레드 작성 실패. 입력값과 참조 노트를 확인하세요.");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (comment: ThreadComment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
    setEditRefs(new Set(comment.referencedNoteIds));
  };

  const saveEdit = async (commentId: string) => {
    if (!editContent.trim()) return;
    try {
      setBusy(true);
      setError(null);
      await request(`/api/comments/${commentId}`, {
        method: "PATCH",
        body: JSON.stringify({ content: editContent, referencedNoteIds: [...editRefs] })
      });
      setEditingId(null);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "스레드 수정 실패. 작성자 또는 관리자 권한이 필요합니다.");
    } finally {
      setBusy(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!window.confirm("이 스레드 댓글을 삭제할까요?")) return;
    try {
      setBusy(true);
      setError(null);
      await request(`/api/comments/${commentId}`, { method: "DELETE" });
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "스레드 삭제 실패. 작성자 또는 관리자 권한이 필요합니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="thread-panel">
      <PanelTitle title="스레드" />
      {error && <p className="form-error">{error}</p>}
      <div className="comment-list">
        {comments.map((comment) => {
          const canManage = comment.authorId === me.id || me.role === "ADMIN";
          return (
            <div className="comment" key={comment.id}>
              <div className="comment-meta">
                <strong>{memberName(members, comment.authorId)}</strong>
                <span>{elapsed(comment.createdAt)}</span>
              </div>
              {editingId === comment.id ? (
                <>
                  <textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} rows={4} maxLength={2000} />
                  <div className="ref-list selectable">
                    {notes.map((note) => (
                      <button
                        key={note.id}
                        className={editRefs.has(note.id) ? "selected" : ""}
                        onClick={() => setEditRefs((prev) => {
                          const next = new Set(prev);
                          if (next.has(note.id)) next.delete(note.id);
                          else next.add(note.id);
                          return next;
                        })}
                      >
                        #{note.title}
                      </button>
                    ))}
                  </div>
                  <div className="row-actions">
                    <button className="button secondary" disabled={busy} onClick={() => setEditingId(null)}>취소</button>
                    <button className="button primary" disabled={busy || !editContent.trim()} onClick={() => void saveEdit(comment.id)}>저장</button>
                  </div>
                </>
              ) : (
                <>
                  <p>{comment.content}</p>
                  {comment.referencedNoteIds.length > 0 && (
                    <div className="ref-list">
                      {comment.referencedNoteIds.map((id) => <span key={id}>#{notes.find((note) => note.id === id)?.title ?? "노트"}</span>)}
                    </div>
                  )}
                  {canManage && (
                    <div className="row-actions left">
                      <button className="text-button" disabled={busy} onClick={() => startEdit(comment)}>수정</button>
                      <button className="text-button danger-text" disabled={busy} onClick={() => void deleteComment(comment.id)}>삭제</button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="composer">
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder="댓글을 작성하세요" />
        <div className="ref-list selectable">
          {notes.map((note) => (
            <button
              key={note.id}
              className={refs.has(note.id) ? "selected" : ""}
              onClick={() => setRefs((prev) => {
                const next = new Set(prev);
                if (next.has(note.id)) next.delete(note.id);
                else next.add(note.id);
                return next;
              })}
            >
              #{note.title}
            </button>
          ))}
        </div>
        <button className="button primary full" disabled={busy || !content.trim()} onClick={() => void submit()}>댓글 작성</button>
      </div>
    </aside>
  );
}

function FormOutput({ task, onReload }: { task: TaskView; onReload: () => Promise<void> }) {
  const entries = Object.entries(task.formValues);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => entries.length ? entries : [["", ""]]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextEntries = Object.entries(task.formValues);
    setRows(nextEntries.length ? nextEntries : [["", ""]]);
  }, [task.formValues]);

  const save = async () => {
    const next = Object.fromEntries(rows.filter(([key]) => key.trim()).map(([key, value]) => [key.trim(), value.trim()]));
    try {
      setError(null);
      await request(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ formValues: next }) });
      setEditing(false);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "양식 산출물 저장 실패. 입력값을 확인한 뒤 다시 시도하세요.");
    }
  };

  return (
    <section className="panel">
      <PanelHeader
        title="양식 산출물"
        action={<button className="button secondary" onClick={() => setEditing((v) => !v)}>{editing ? "닫기" : "수정"}</button>}
      />
      {editing ? (
        <div className="form-output-editor">
          {rows.map(([key, value], index) => (
            <div className="form-output-row" key={`${key}-${index}`}>
              <input
                value={key}
                placeholder="필드"
                maxLength={80}
                onChange={(event) => setRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? [event.target.value, row[1]] : row))}
              />
              <input
                value={value}
                placeholder="값"
                maxLength={1000}
                onChange={(event) => setRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? [row[0], event.target.value] : row))}
              />
              <button className="button secondary" onClick={() => setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}>삭제</button>
            </div>
          ))}
          {error && <p className="form-error">{error}</p>}
          <div className="row-actions">
            <button className="button secondary" onClick={() => setRows((prev) => [...prev, ["", ""]])}>필드 추가</button>
            <button className="button primary" onClick={() => void save()}>산출물 저장</button>
          </div>
        </div>
      ) : (
        <div className="kv-grid">
          {entries.length ? entries.map(([key, value]) => (
            <div key={key}>
              <small>{key}</small>
              <strong>{value}</strong>
            </div>
          )) : <p className="muted">입력된 양식 값이 없습니다</p>}
        </div>
      )}
    </section>
  );
}

function TimelinePanel({ timeline, notes, members }: { timeline: TimelineEvent[]; notes: Note[]; members: Member[] }) {
  return (
    <section className="panel">
      <PanelHeader title="타임라인" action={<button className="button secondary">전체</button>} />
      <div className="timeline">
        {timeline.map((event) => (
          <div className="timeline-item" key={event.id}>
            <span className="timeline-dot" />
            <div>
              <strong>{eventLabel[event.type] ?? event.type}</strong>
              <p>
                {memberName(members, event.actorId)}
                {event.decisionType ? ` · ${decisionLabel[event.decisionType]}` : ""}
                {event.reason ? ` · ${event.reason}` : ""}
              </p>
              {event.referencedNoteIds.length > 0 && (
                <div className="ref-list">
                  {event.referencedNoteIds.map((id) => <span key={id}>#{notes.find((note) => note.id === id)?.title ?? "노트"}</span>)}
                </div>
              )}
            </div>
            <time>{formatDate(event.createdAt)}</time>
          </div>
        ))}
      </div>
    </section>
  );
}

function DecisionModal({
  decision,
  notes,
  busy,
  onClose,
  onSubmit
}: {
  decision: { toState: TaskState; decisionType: DecisionType; title: string };
  notes: Note[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: { toState: TaskState; decisionType: DecisionType; reason: string; referencedNoteIds: string[] }) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [refs, setRefs] = useState<Set<string>>(new Set(notes.slice(0, 1).map((note) => note.id)));

  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({ ...decision, reason, referencedNoteIds: [...refs] });
        }}
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">결정</div>
            <h2>{decision.title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>×</button>
        </div>
        <label>
          사유
          <textarea required value={reason} onChange={(e) => setReason(e.target.value)} rows={5} placeholder="결정 근거를 입력하세요" />
        </label>
        <div className="check-grid">
          {notes.map((note) => (
            <label key={note.id}>
              <input
                type="checkbox"
                checked={refs.has(note.id)}
                onChange={() => setRefs((prev) => {
                  const next = new Set(prev);
                  if (next.has(note.id)) next.delete(note.id);
                  else next.add(note.id);
                  return next;
                })}
              />
              {note.title}
            </label>
          ))}
        </div>
        <div className="row-actions">
          <button type="button" className="button secondary" onClick={onClose}>취소</button>
          <button className="button primary" disabled={busy || !reason.trim()}>제출</button>
        </div>
      </form>
    </div>
  );
}

function InboxView({ data, onReload }: { data: AppData; onReload: () => Promise<void> }) {
  const [tab, setTab] = useState<InboxComponent>("DECISION");
  const items = data.inbox.filter((item) => item.componentType === tab);
  const taskMap = new Map(data.tasks.map((task) => [task.id, task]));

  const markRead = async (id: string) => {
    await request(`/api/inbox/${id}/read`, { method: "PATCH" });
    await onReload();
  };

  return (
    <section className="page-stack">
      <PageHeader eyebrow="알림함" title="알림 분류" />
      <Tabs value={tab} onChange={(v) => setTab(v as InboxComponent)} tabs={INBOX_COMPONENTS.map((item) => ({ value: item.value, label: item.label, count: data.inbox.filter((row) => row.componentType === item.value && !row.readAt).length }))} />
      <div className="list-panel">
        {items.map((item) => (
          <div className={`inbox-row ${item.readAt ? "" : "unread"}`} key={item.id}>
            <div>
              <Badge tone={item.componentType === "DECISION" ? "amber" : item.componentType === "DISCUSSION" ? "blue" : item.componentType === "RESULT" ? "green" : "slate"}>
                {eventLabel[item.eventType] ?? item.eventType}
              </Badge>
              <h3>{item.title}</h3>
              <p>{item.message}</p>
              <small>{taskMap.get(item.taskId)?.title}</small>
            </div>
            <div className="row-actions">
              <button className="button secondary" onClick={() => go(`/tasks/${item.taskId}`)}>열기</button>
              <button className="button secondary" onClick={() => void markRead(item.id)}>{item.readAt ? "안 읽음" : "읽음"}</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TasksView({ tasks, members, onReload }: { tasks: TaskView[]; members: Member[]; onReload: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [templateType, setTemplateType] = useState<TemplateType>("TASK");
  const [query, setQuery] = useState("");
  const [filterState, setFilterState] = useState<"ALL" | TaskState>("ALL");
  const [filterType, setFilterType] = useState<"ALL" | TemplateType>("ALL");
  const [sortBy, setSortBy] = useState("updated");

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const task = await request<TaskView>("/api/tasks", { method: "POST", body: JSON.stringify({ title, parentId, templateType }) });
    setTitle("");
    await onReload();
    go(`/tasks/${task.id}`);
  };

  const filteredTasks = [...tasks]
    .filter((task) => !query || `${task.title} ${task.description}`.toLowerCase().includes(query.toLowerCase()))
    .filter((task) => filterState === "ALL" || task.currentState === filterState)
    .filter((task) => filterType === "ALL" || task.templateType === filterType)
    .sort((a, b) => {
      if (sortBy === "due") return String(a.dueDate ?? "9999").localeCompare(String(b.dueDate ?? "9999"));
      if (sortBy === "priority") return ["URGENT", "HIGH", "MEDIUM", "LOW"].indexOf(a.priority) - ["URGENT", "HIGH", "MEDIUM", "LOW"].indexOf(b.priority);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  return (
    <section className="page-stack">
      <PageHeader eyebrow="태스크" title="실행 관점 목록" action={<Badge tone="blue">{filteredTasks.length} / {tasks.length}</Badge>} />
      <form className="create-card" onSubmit={create}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="새 태스크 제목" />
        <Select value={templateType} onChange={(v) => setTemplateType(v as TemplateType)} options={templateTypes.filter((v) => v !== "ALL").map((v) => [v, TEMPLATE_META[v].label])} />
        <Select value={parentId ?? ""} onChange={(v) => setParentId(v || null)} options={[["", "상위 항목 없음"], ...tasks.map((task) => [task.id, task.title] as [string, string])]} />
        <button className="button primary">생성</button>
      </form>
      <div className="toolbar task-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목 또는 설명 검색" />
        <Select value={filterState} onChange={(v) => setFilterState(v as typeof filterState)} options={states.map((v) => [v, v === "ALL" ? "전체 상태" : STATE_META[v].label])} />
        <Select value={filterType} onChange={(v) => setFilterType(v as typeof filterType)} options={templateTypes.map((v) => [v, v === "ALL" ? "전체 유형" : TEMPLATE_META[v].label])} />
        <Select value={sortBy} onChange={setSortBy} options={[["updated", "최근 수정순"], ["due", "기한순"], ["priority", "우선순위순"]]} />
      </div>
      <div className="task-table">
        {filteredTasks.map((task) => (
          <button key={task.id} className="task-row" onClick={() => go(`/tasks/${task.id}`)}>
            <Badge tone={TEMPLATE_META[task.templateType].tone}>{TEMPLATE_META[task.templateType].label}</Badge>
            <strong>{task.title}</strong>
            <span>{task.assigneeIds.map((id) => memberName(members, id)).join(", ")}</span>
            <Badge tone={STATE_META[task.currentState].tone}>{STATE_META[task.currentState].label}</Badge>
          </button>
        ))}
      </div>
    </section>
  );
}

function TemplatesView({ templates, onReload }: { templates: Template[]; onReload: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<TemplateType>("TASK");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createTemplate = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      setBusy(true);
      setError(null);
      await request("/api/templates", { method: "POST", body: JSON.stringify({ name, type, enabled }) });
      setName("");
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "템플릿 생성 실패. 권한과 입력값을 확인하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-stack">
      <PageHeader eyebrow="템플릿" title="방법론 자산" />
      <form className="create-card template-create" onSubmit={createTemplate}>
        <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="템플릿 이름" />
        <Select value={type} onChange={(value) => setType(value as TemplateType)} options={templateTypes.filter((value) => value !== "ALL").map((value) => [value, TEMPLATE_META[value].label])} />
        <label className="toggle-row">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          활성화
        </label>
        <button className="button primary" disabled={busy || !name.trim()}>생성</button>
      </form>
      {error && <div className="inline-error">{error}</div>}
      <div className="template-grid">
        {templates.map((template) => (
          <TemplateCard key={template.id} template={template} onReload={onReload} />
        ))}
      </div>
    </section>
  );
}

function TemplateCard({ template, onReload }: { template: Template; onReload: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: template.name, type: template.type, enabled: template.enabled });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({ name: template.name, type: template.type, enabled: template.enabled });
  }, [template.enabled, template.name, template.type]);

  const save = async () => {
    if (!draft.name.trim()) return;
    try {
      setBusy(true);
      setError(null);
      await request(`/api/templates/${template.id}`, { method: "PATCH", body: JSON.stringify(draft) });
      setEditing(false);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "템플릿 저장 실패. 편집자 이상 권한이 필요합니다.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("이 템플릿을 삭제할까요? 사용 중이면 비활성화로 처리됩니다.")) return;
    try {
      setBusy(true);
      setError(null);
      await request(`/api/templates/${template.id}`, { method: "DELETE" });
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "템플릿 삭제 실패. 관리자 권한 또는 대상 상태를 확인하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="panel">
      <PanelHeader
        title={template.name}
        action={<Badge tone={template.enabled ? "green" : "slate"}>{template.enabled ? "활성" : "비활성"} · v{template.version}</Badge>}
      />
      {error && <p className="form-error">{error}</p>}
      {editing ? (
        <div className="template-editor">
          <input value={draft.name} maxLength={120} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} />
          <Select value={draft.type} onChange={(value) => setDraft((prev) => ({ ...prev, type: value as TemplateType }))} options={templateTypes.filter((value) => value !== "ALL").map((value) => [value, TEMPLATE_META[value].label])} />
          <label className="toggle-row">
            <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((prev) => ({ ...prev, enabled: event.target.checked }))} />
            활성화
          </label>
          <div className="row-actions">
            <button className="button secondary" disabled={busy} onClick={() => setEditing(false)}>취소</button>
            <button className="button primary" disabled={busy || !draft.name.trim()} onClick={() => void save()}>저장</button>
          </div>
        </div>
      ) : (
        <>
          <div className="template-summary">
            <Badge tone={TEMPLATE_META[template.type].tone}>{TEMPLATE_META[template.type].label}</Badge>
            <div className="row-actions left">
              <button className="text-button" disabled={busy} onClick={() => setEditing(true)}>수정</button>
              <button className="text-button danger-text" disabled={busy} onClick={() => void remove()}>삭제</button>
            </div>
          </div>
          <div className="workflow-list">
            {template.workflow.map((rule) => (
              <div key={`${rule.from}-${rule.to}`}>
                <span>{rule.from}</span>
                <strong>{rule.label}</strong>
                <span>{rule.to}</span>
                {rule.isDecision && <Badge tone="amber">{decisionLabel[rule.decisionType]}</Badge>}
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

function MembersView({ members, onReload }: { members: Member[]; onReload: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    const result = await request<{ inviteUrl: string }>("/api/admin/invitations", { method: "POST", body: JSON.stringify({ email, role }) });
    setInviteUrl(result.inviteUrl);
    setEmail("");
    await onReload();
  };

  const changeRole = async (memberId: string, nextRole: Role) => {
    try {
      setError(null);
      await request(`/api/admin/members/${memberId}`, { method: "PATCH", body: JSON.stringify({ role: nextRole }) });
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "역할 변경 실패. 권한과 대상 멤버를 확인하세요.");
    }
  };

  const removeMember = async (member: Member) => {
    if (!window.confirm(`${member.name} 멤버를 제거할까요? 연결된 담당자/참관자와 알림도 정리됩니다.`)) return;
    try {
      setError(null);
      await request(`/api/admin/members/${member.id}`, { method: "DELETE" });
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "멤버 제거 실패. 관리자 권한 또는 대상 멤버를 확인하세요.");
    }
  };

  return (
    <section className="page-stack">
      <PageHeader eyebrow="관리" title="멤버와 역할" />
      <form className="create-card" onSubmit={invite}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@company.com" />
        <Select value={role} onChange={(v) => setRole(v as Role)} options={["VIEWER", "EDITOR", "APPROVER", "ADMIN"].map((v) => [v, roleLabel[v as Role]])} />
        <button className="button primary">초대</button>
      </form>
      {inviteUrl && <div className="change-banner"><strong>초대 URL</strong><span>{inviteUrl}</span></div>}
      {error && <div className="inline-error">{error}</div>}
      <div className="task-table">
        {members.map((member) => (
	          <div className="task-row static" key={member.id}>
	            <div className="avatar">{member.name.slice(0, 1)}</div>
	            <strong>{member.name}</strong>
	            <span>{member.email}</span>
	            <div className="row-actions">
	              <Select
	                value={member.role}
	                onChange={(nextRole) => void changeRole(member.id, nextRole as Role)}
		                options={["VIEWER", "EDITOR", "APPROVER", "ADMIN"].map((v) => [v, roleLabel[v as Role]])}
		              />
	              <button className="button danger" onClick={() => void removeMember(member)}>제거</button>
	            </div>
	          </div>
        ))}
      </div>
    </section>
  );
}

function AnalyticsView({ analytics }: { analytics: Analytics }) {
  const cards = [
    ["주간 재방문", `${Math.round(analytics.weeklyReturnRate * 100)}%`],
    ["노트 : 스레드", analytics.notesThreadBalance],
    ["비개발 편집", `${Math.round(analytics.nonDevContributionRate * 100)}%`],
    ["#참조율", `${Math.round(analytics.noteReferenceRate * 100)}%`],
    ["자발 방문", `${analytics.voluntaryVisitsPerWeek}/주`],
    ["결정 이벤트", String(analytics.decisionEvents)]
  ];
  return (
    <section className="page-stack">
      <PageHeader eyebrow="분석" title="파일럿 판정 대시보드" />
      <div className="metric-grid">
        {cards.map(([label, value]) => (
          <article className="metric-card" key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

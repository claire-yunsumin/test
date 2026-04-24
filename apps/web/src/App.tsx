import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  INBOX_COMPONENTS,
  STATE_META,
  STRUCTURE_META,
  TEMPLATE_META,
  type Analytics,
  type AppData,
  type DecisionType,
  type Mention,
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
import { Badge, Centered, FilterShell, Meta, PageHeader, PanelHeader, PanelTitle, Select, Tabs } from "./components/ui";
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
const fallbackTemplateLabel = "자유 노드";

function templateTone(type: TemplateType | null | undefined) {
  return type ? TEMPLATE_META[type].tone : "slate";
}

function templateLabel(type: TemplateType | null | undefined) {
  return type ? TEMPLATE_META[type].label : fallbackTemplateLabel;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(value));
}

function elapsed(value: string) {
  const hours = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 36e5));
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

function formatFailure(cause: string, impact: string, nextAction: string) {
  return `${cause}. ${impact}. ${nextAction}.`;
}

function decisionHint(state: TaskState, canApprove: boolean) {
  if (state === "DRAFT") return "다음 권장 액션: 시작";
  if (state === "IN_PROGRESS") return "다음 권장 액션: 검토 요청";
  if (state === "PENDING_APPROVAL") {
    return canApprove ? "다음 권장 액션: 승인" : "승인자 확인 대기: 승인 권한이 필요합니다";
  }
  if (state === "DONE") return "완료 상태입니다";
  return "현재 상태에서는 추가 액션이 제한됩니다";
}

function isDueToday(value: string | null | undefined) {
  if (!value) return false;
  const today = new Date();
  const due = new Date(value);
  return (
    due.getFullYear() === today.getFullYear() &&
    due.getMonth() === today.getMonth() &&
    due.getDate() === today.getDate()
  );
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

function useDebouncedEffect(effect: () => void, deps: unknown[], delay = 900) {
  useEffect(() => {
    const timer = window.setTimeout(effect, delay);
    return () => window.clearTimeout(timer);
  }, deps);
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function densitySignal(task: TaskView) {
  return task.activity.notesCount + task.activity.commentsCount + task.activity.filesCount;
}

type TaskViewMode = "list" | "table" | "board" | "backlog" | "hierarchy" | "graph";

function taskViewTabs(tasks: TaskView[]) {
  const backlogCount = tasks.filter((task) => task.currentState === "DRAFT").length;
  return [
    { value: "list", label: "리스트", count: tasks.length },
    { value: "table", label: "테이블" },
    { value: "board", label: "보드" },
    { value: "backlog", label: "백로그", count: backlogCount },
    { value: "hierarchy", label: "계층" },
    { value: "graph", label: "결정 그래프" }
  ] as Array<{ value: TaskViewMode; label: string; count?: number }>;
}

function goTaskViewTab(value: TaskViewMode) {
  if (value === "hierarchy") {
    go("/hierarchy");
    return;
  }
  if (value === "graph") {
    go("/graph");
    return;
  }
  if (value === "list") {
    go("/tasks");
    return;
  }
  go(`/tasks?view=${value}`);
}

function TaskViewTabs({
  value,
  tasks,
  onChange
}: {
  value: TaskViewMode;
  tasks: TaskView[];
  onChange?: (value: TaskViewMode) => void;
}) {
  return (
    <div className="tabs-section">
      <small className="tabs-section-label">뷰</small>
      <Tabs
        variant="segmented"
        value={value}
        onChange={(next) => {
          const tab = next as TaskViewMode;
          onChange?.(tab);
          goTaskViewTab(tab);
        }}
        tabs={taskViewTabs(tasks)}
      />
    </div>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>(() => currentRoute());
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [density, setDensity] = useState<"compact" | "comfortable">(() => {
    const stored = window.localStorage.getItem("ui-density");
    return stored === "comfortable" ? "comfortable" : "compact";
  });

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

  useEffect(() => {
    window.localStorage.setItem("ui-density", density);
  }, [density]);

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
    <Shell
      route={route.path}
      me={data.me}
      inbox={data.inbox}
      tasks={data.tasks as TaskView[]}
      analytics={data.analytics}
      onNavigate={go}
      density={density}
      onToggleDensity={() => setDensity((prev) => (prev === "compact" ? "comfortable" : "compact"))}
    >
      {route.path.startsWith("/tasks/") && route.taskId ? (
        <TaskWorkspace taskId={route.taskId} me={data.me} onReload={reload} />
      ) : route.path === "/tasks" ? (
        <TasksView tasks={data.tasks as TaskView[]} members={data.members} me={data.me} onReload={reload} />
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
        <HierarchyView data={data} onReload={reload} />
      )}
    </Shell>
  );
}

function Shell({
  route,
  me,
  inbox,
  tasks,
  analytics,
  onNavigate,
  density,
  onToggleDensity,
  children
}: {
  route: string;
  me: Member;
  inbox: AppData["inbox"];
  tasks: TaskView[];
  analytics: Analytics;
  onNavigate: (path: string) => void;
  density: "compact" | "comfortable";
  onToggleDensity: () => void;
  children: ReactNode;
}) {
  const unread = inbox.filter((item) => !item.readAt).length;
  const pending = tasks.filter((task) => task.currentState === "PENDING_APPROVAL").length;
  const done = tasks.filter((task) => task.currentState === "DONE").length;
  const templated = tasks.filter((task) => task.structureState === "TEMPLATED").length;
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const globalResults = tasks
    .filter((task) => !globalQuery.trim() || `${task.title} ${task.description}`.toLowerCase().includes(globalQuery.toLowerCase()))
    .slice(0, 8);
  const links = [
    { path: "/inbox", label: "알림함", mark: String(unread) },
    { path: "/tasks", label: "태스크", mark: "T" },
    { path: "/templates", label: "템플릿", mark: "P" },
    { path: "/admin/members", label: "멤버", mark: "M" },
    { path: "/admin/analytics", label: "분석", mark: "A" }
  ];

  return (
    <div className={`app-shell density-${density}`}>
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
              className={`nav-item ${route === link.path || (link.path === "/tasks" && ["/tasks", "/hierarchy", "/graph"].includes(route)) ? "active" : ""}`}
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
          <div className="market-tape" aria-label="운영 지표">
            <span><small>Pending</small><strong>{pending}</strong></span>
            <span><small>Done</small><strong>{done}</strong></span>
            <span><small>Templated</small><strong>{templated}/{tasks.length}</strong></span>
            <span><small>Retention</small><strong>{pct(analytics.weeklyReturnRate)}</strong></span>
          </div>
          <div className="top-actions">
            <button className="density-button" onClick={onToggleDensity}>
              {density === "compact" ? "Comfortable" : "Compact"}
            </button>
            <button className="search-button" onClick={() => setSearchOpen(true)}>검색</button>
            <Badge tone="blue">{roleLabel[me.role]}</Badge>
            <div className="avatar">{me.name.slice(0, 1)}</div>
          </div>
        </header>
        <main>{children}</main>
      </div>
      {searchOpen && (
        <div className="modal-backdrop">
          <section className="command-palette" role="dialog" aria-label="검색">
            <div className="command-head">
              <div>
                <div className="eyebrow">Command Search</div>
                <h2>결정 대상 검색</h2>
              </div>
              <button className="icon-button" onClick={() => setSearchOpen(false)}>×</button>
            </div>
            <input autoFocus value={globalQuery} onChange={(event) => setGlobalQuery(event.target.value)} placeholder="노드, 태스크, 설명 검색" />
            <div className="command-results">
              {globalResults.map((task) => (
                <button key={task.id} onClick={() => { setSearchOpen(false); go(`/tasks/${task.id}`); }}>
                  <span>
                    <strong>{task.title}</strong>
                    <small>{templateLabel(task.templateType)} · {STATE_META[task.currentState].label}</small>
                  </span>
                  <span className="signal-chip">N{task.activity.notesCount} T{task.activity.commentsCount}</span>
                </button>
              ))}
              {!globalResults.length && <p className="muted">검색 결과가 없습니다.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function HierarchyView({ data, onReload }: { data: AppData; onReload: () => Promise<void> }) {
  const tasks = data.tasks as TaskView[];
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"ALL" | TemplateType>("ALL");
  const [state, setState] = useState<"ALL" | TaskState>("ALL");
  const [assignee, setAssignee] = useState("ALL");
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
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
      rows.sort((a, b) => templateOrder.indexOf(a.templateType ?? "TASK") - templateOrder.indexOf(b.templateType ?? "TASK"));
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

  const createNode = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const task = await request<TaskView>("/api/tasks", { method: "POST", body: JSON.stringify({ title, parentId, templateId: templateId || null }) });
    setTitle("");
    setTemplateId("");
    setParentId(task.id);
    await onReload();
  };

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="계층"
        title="결정 대상 구조"
        action={<button className="button primary" onClick={() => go("/tasks")}>새 태스크</button>}
      />
      <TaskViewTabs value="hierarchy" tasks={tasks} />
      <FilterShell
        meta={<span>{filteredIds.size} visible · {tasks.length} total</span>}
        action={<button className="button secondary" onClick={() => { setSearch(""); setType("ALL"); setState("ALL"); setAssignee("ALL"); }}>필터 초기화</button>}
      >
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="태스크 검색" />
        <Select label="유형" tone="filter" value={type} onChange={(v) => setType(v as typeof type)} options={templateTypes.map((v) => [v, v === "ALL" ? "전체 유형" : TEMPLATE_META[v].label])} />
        <Select label="상태" tone="filter" value={state} onChange={(v) => setState(v as typeof state)} options={states.map((v) => [v, v === "ALL" ? "전체 상태" : STATE_META[v].label])} />
        <Select label="담당자" tone="filter" value={assignee} onChange={setAssignee} options={[["ALL", "전체 담당자"], ...data.members.map((m) => [m.id, m.name] as [string, string])]} />
      </FilterShell>
      <form className="create-card" onSubmit={createNode}>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Work Graph 노드 이름" />
        <Select label="상위" value={parentId ?? ""} onChange={(value) => setParentId(value || null)} options={[["", "상위 없음"], ...tasks.map((task) => [task.id, task.title] as [string, string])]} />
        <Select label="템플릿" value={templateId} onChange={setTemplateId} options={[["", "자유 노드"], ...data.templates.filter((template) => template.enabled).map((template) => [template.id, template.name] as [string, string])]} />
        <button className="button primary" disabled={!title.trim()}>형상화</button>
      </form>
      <div className="hierarchy-board">
        {(byParent.get(null) ?? []).map((task) => (
          <TreeNode key={task.id} task={task} templates={data.templates} byParent={byParent} expanded={expanded} onToggle={toggle} onReload={onReload} level={0} />
        ))}
      </div>
    </section>
  );
}

function TreeNode({
  task,
  templates,
  byParent,
  expanded,
  onToggle,
  onReload,
  level
}: {
  task: TaskView;
  templates: Template[];
  byParent: Map<string | null, TaskView[]>;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onReload: () => Promise<void>;
  level: number;
}) {
  const children = byParent.get(task.id) ?? [];
  const [applyId, setApplyId] = useState(task.templateId ?? "");
  const applySelectedTemplate = async () => {
    if (!applyId) return;
    await request(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ templateId: applyId }) });
    await onReload();
  };
  return (
    <div className="tree-node" style={{ marginLeft: level ? 24 : 0 }}>
      <div className="tree-card">
        <button className="tree-toggle" onClick={() => onToggle(task.id)} aria-label="toggle">
          {children.length ? (expanded.has(task.id) ? "−" : "+") : ""}
        </button>
        <button className="tree-main" onClick={() => go(`/tasks/${task.id}`)}>
          <Badge tone={templateTone(task.templateType)}>{templateLabel(task.templateType)}</Badge>
          <Badge tone={STRUCTURE_META[task.structureState].tone}>{STRUCTURE_META[task.structureState].label}</Badge>
          <span className="tree-title">{task.title}</span>
          <span className="tree-meta">
            노트 {task.activity.notesCount} · 스레드 {task.activity.commentsCount} · 파일 {task.activity.filesCount}
          </span>
        </button>
        <Badge tone={STATE_META[task.currentState].tone}>{STATE_META[task.currentState].label}</Badge>
        <Select tone="inline" value={applyId} onChange={setApplyId} options={[["", "Template 적용"], ...templates.filter((template) => template.enabled).map((template) => [template.id, template.name] as [string, string])]} />
        <button className="button secondary" disabled={!applyId || applyId === task.templateId} onClick={() => void applySelectedTemplate()}>정형화</button>
      </div>
      {expanded.has(task.id) && children.length > 0 && (
        <div className="tree-children">
          {children.map((child) => (
            <TreeNode key={child.id} task={child} templates={templates} byParent={byParent} expanded={expanded} onToggle={onToggle} onReload={onReload} level={level + 1} />
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
      rows.sort((a, b) => templateOrder.indexOf(a.templateType ?? "TASK") - templateOrder.indexOf(b.templateType ?? "TASK"));
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
      <TaskViewTabs value="graph" tasks={tasks} />
      <div className="toolbar graph-toolbar">
        <Select label="Focus" tone="filter" value={focusId} onChange={setFocusId} options={[["ALL", "전체 그래프"], ...orderedTasks.map((task) => [task.id, task.title] as [string, string])]} />
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
                <g key={task.id} className={`graph-node graph-node-${(task.templateType ?? "task").toLowerCase()} ${task.structureState === "FREEFORM" ? "graph-node-freeform" : ""} ${task.id === focusId ? "focused" : ""}`} onClick={() => go(`/tasks/${task.id}`)} tabIndex={0} role="button">
                  <rect x={pos.x} y={pos.y} width={pos.width} height={pos.height} rx="8" />
                  <text x={pos.x + 12} y={pos.y + 19} className="graph-node-type">{templateLabel(task.templateType)} · {STRUCTURE_META[task.structureState].label}</text>
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
  const [taskDraft, setTaskDraft] = useState({ title: "", description: "" });
  const [autoSaving, setAutoSaving] = useState(false);
  const loadedTaskId = useRef<string | null>(null);

  const load = async () => {
    setDetail(await request<TaskDetail>(`/api/tasks/${taskId}`));
  };

  useEffect(() => {
    void load();
  }, [taskId]);

  useEffect(() => {
    if (!detail) return;
    setTaskDraft({ title: detail.task.title, description: detail.task.description });
    loadedTaskId.current = detail.task.id;
  }, [detail?.task.description, detail?.task.id, detail?.task.title]);

  const task = detail?.task;

  const saveTask = async (nextDraft = taskDraft, quiet = false) => {
    if (!nextDraft.title.trim() || !detail || !task) return;
    if (nextDraft.title === detail.task.title && nextDraft.description === detail.task.description) return;
    try {
      if (quiet) setAutoSaving(true);
      else setBusy(true);
      setActionError(null);
      await request(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(nextDraft) });
      await Promise.all([load(), onReload()]);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : formatFailure("태스크 저장 실패", "변경사항이 반영되지 않았습니다", "입력값과 권한을 확인한 뒤 다시 저장하세요")
      );
    } finally {
      if (quiet) setAutoSaving(false);
      else setBusy(false);
    }
  };

  useDebouncedEffect(() => {
    if (!detail || loadedTaskId.current !== detail.task.id) return;
    if (taskDraft.title === detail.task.title && taskDraft.description === detail.task.description) return;
    void saveTask(taskDraft, true);
  }, [taskDraft.title, taskDraft.description, detail?.task.id], 1100);

  if (!detail || !task) return <Centered><div className="loader" /></Centered>;

	  const { parent, notes, referenceableNotes = notes, referenceableTasks = [task], comments, timeline, members, children, permissions } = detail;
  const canEditForm = permissions?.canEditForm ?? ["ADMIN", "EDITOR", "APPROVER"].includes(me.role);
  const changed = hasChangedSinceSeen(task, parent, me.id);
  const canApprove = ["APPROVER", "ADMIN"].includes(me.role);
  const canDeleteTask = me.role === "ADMIN" || task.ownerId === me.id;

  const deleteTask = async () => {
    if (!canDeleteTask || !window.confirm("이 태스크와 하위 태스크, 노트, 스레드, 타임라인을 삭제할까요?")) return;
    try {
      setBusy(true);
      setActionError(null);
      await request(`/api/tasks/${task.id}`, { method: "DELETE" });
      await onReload();
      go("/tasks");
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : formatFailure("태스크 삭제 실패", "대상 태스크가 그대로 유지됩니다", "권한과 하위 구조를 확인한 뒤 다시 시도하세요")
      );
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
      setActionError(
        err instanceof Error
          ? err.message
          : formatFailure("상태 전이 처리 실패", "상태와 타임라인이 변경되지 않았습니다", "사유와 참조 노트를 확인한 뒤 다시 시도하세요")
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-stack">
      <div className="task-heading">
        <button className="back-link" onClick={() => go("/hierarchy")}>계층으로 돌아가기</button>
        <div className="task-title-row">
          <Badge tone={templateTone(task.templateType)}>{templateLabel(task.templateType)}</Badge>
          <Badge tone={STRUCTURE_META[task.structureState].tone}>{STRUCTURE_META[task.structureState].label}</Badge>
          <input
            className="task-title-input"
            value={taskDraft.title}
            maxLength={120}
            onChange={(event) => setTaskDraft((prev) => ({ ...prev, title: event.target.value }))}
            onBlur={() => void saveTask(taskDraft, true)}
            aria-label="태스크 제목"
          />
          <Badge tone={STATE_META[task.currentState].tone}>{STATE_META[task.currentState].label}</Badge>
          <div className="task-heading-actions">
            {autoSaving && <span className="save-indicator">자동저장 중</span>}
            {actionError && <button className="button secondary" onClick={() => setTaskDraft({ title: task.title, description: task.description })}>되돌리기</button>}
            <button
              className="button danger"
              disabled={busy || !canDeleteTask}
              title={
                canDeleteTask
                  ? "태스크 삭제"
                  : "삭제 불가: 현재 사용자는 삭제 권한이 없습니다. 소유자이거나 관리자 권한일 때 삭제할 수 있습니다."
              }
              onClick={() => void deleteTask()}
            >
              삭제
            </button>
          </div>
        </div>
        <textarea
          className="task-description-input"
          value={taskDraft.description}
          maxLength={1200}
          rows={3}
          onChange={(event) => setTaskDraft((prev) => ({ ...prev, description: event.target.value }))}
          onBlur={() => void saveTask(taskDraft, true)}
          placeholder="설명이 아직 없습니다."
          aria-label="태스크 설명"
        />
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
          <FormOutput task={task} canEditForm={canEditForm} onReload={load} />
          <NotesSection taskId={task.id} notes={notes} members={members} onReload={load} />
        </div>

        <TaskRightPanel
          taskId={task.id}
          notes={referenceableNotes}
          tasks={referenceableTasks}
          comments={comments}
          members={members}
          timeline={timeline}
          me={me}
          onReload={load}
        />
      </div>

      <div className="decision-bar">
        <div>
          <strong>결정 액션</strong>
          <span>{actionError ?? decisionHint(task.currentState, canApprove)}</span>
        </div>
        <div className="bar-actions">
          {task.currentState === "DRAFT" && (
            <button className="button primary" onClick={() => setDecision({ toState: "IN_PROGRESS", decisionType: "STATE_ONLY", title: "작업 시작" })}>시작</button>
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
            <button
              className="button secondary"
              disabled
              title="결정 전이 불가: 승인 권한이 필요합니다. 승인자 또는 관리자 권한으로 요청하거나 권한 변경 후 다시 시도하세요."
            >
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

function TaskRightPanel({
  taskId,
  notes,
  tasks,
  comments,
  members,
  timeline,
  me,
  onReload
}: {
  taskId: string;
  notes: Note[];
  tasks: TaskView[];
  comments: ThreadComment[];
  members: Member[];
  timeline: TimelineEvent[];
  me: Member;
  onReload: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"thread" | "timeline">(() => {
    const value = new URLSearchParams(window.location.search).get("rt");
    return value === "timeline" ? "timeline" : "thread";
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (tab === "thread") url.searchParams.delete("rt");
    else url.searchParams.set("rt", tab);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [tab]);
  return (
    <aside className="task-right-panel">
      <Tabs
        variant="segmented"
        value={tab}
        onChange={(value) => setTab(value as typeof tab)}
        tabs={[
          { value: "thread", label: "스레드", count: comments.length },
          { value: "timeline", label: "타임라인", count: timeline.length }
        ]}
      />
      {tab === "thread" ? (
        <ThreadPanel taskId={taskId} notes={notes} tasks={tasks} comments={comments} members={members} me={me} onReload={onReload} />
      ) : (
        <TimelinePanel timeline={timeline} notes={notes} members={members} />
      )}
    </aside>
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
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("시스템 필드 저장 실패", "변경값이 반영되지 않았습니다", "권한과 입력값을 확인한 뒤 다시 시도하세요")
      );
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
          tone="inline"
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
  const [open, setOpen] = useState<Set<string>>(() => {
    const stored = window.localStorage.getItem(`task-notes-open:${taskId}`);
    if (stored) return new Set(stored.split(",").filter(Boolean));
    return new Set(notes.map((note) => note.id));
  });
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(`task-notes-open:${taskId}`, [...open].join(","));
  }, [open, taskId]);

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
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("노트 생성 실패", "새 노트가 추가되지 않았습니다", "노트 제목과 내용을 확인한 뒤 다시 생성하세요")
      );
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
	                setError(
                    err instanceof Error
                      ? err.message
                      : formatFailure("노트 저장 실패", "노트 수정사항이 반영되지 않았습니다", "권한과 입력값을 확인한 뒤 다시 저장하세요")
                  );
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
	                setError(
                    err instanceof Error
                      ? err.message
                      : formatFailure("노트 삭제 실패", "대상 노트가 그대로 유지됩니다", "권한과 대상 노트를 확인한 뒤 다시 삭제하세요")
                  );
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
  tasks,
  comments,
  members,
  me,
  onReload
}: {
  taskId: string;
  notes: Note[];
  tasks: TaskView[];
  comments: ThreadComment[];
  members: Member[];
  me: Member;
  onReload: () => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [refs, setRefs] = useState<Set<string>>(new Set());
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editRefs, setEditRefs] = useState<Set<string>>(new Set());
  const [editMentions, setEditMentions] = useState<Mention[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!content.trim()) return;
    try {
      setBusy(true);
      setError(null);
      await request(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content, referencedNoteIds: [...refs], mentions })
      });
      setContent("");
      setRefs(new Set());
      setMentions([]);
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("스레드 작성 실패", "댓글이 등록되지 않았습니다", "입력 내용과 참조 노트를 확인한 뒤 다시 등록하세요")
      );
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (comment: ThreadComment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
    setEditRefs(new Set(comment.referencedNoteIds));
    setEditMentions(comment.mentions);
  };

  const saveEdit = async (commentId: string) => {
    if (!editContent.trim()) return;
    try {
      setBusy(true);
      setError(null);
      await request(`/api/comments/${commentId}`, {
        method: "PATCH",
        body: JSON.stringify({ content: editContent, referencedNoteIds: [...editRefs], mentions: editMentions })
      });
      setEditingId(null);
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("스레드 수정 실패", "기존 댓글 내용이 유지됩니다", "작성자 또는 관리자 권한을 확인한 뒤 다시 수정하세요")
      );
    } finally {
      setBusy(false);
    }
  };

  const mentionOptions: Mention[] = [
    ...members.map((member) => ({ id: `member-${member.id}`, type: "MEMBER" as const, targetId: member.id, label: member.name })),
    ...tasks.map((task) => ({ id: `task-${task.id}`, type: "TASK" as const, targetId: task.id, label: task.title })),
    ...tasks.flatMap((task) => (task.template?.formDefinition ?? []).map((field) => ({
      id: `field-${task.id}-${field.key}`,
      type: "FORM_FIELD" as const,
      targetId: task.id,
      fieldKey: field.key,
      label: `${task.title}.${field.label}`
    }))),
  ];

  const deleteComment = async (commentId: string) => {
    if (!window.confirm("이 스레드 댓글을 삭제할까요?")) return;
    try {
      setBusy(true);
      setError(null);
      await request(`/api/comments/${commentId}`, { method: "DELETE" });
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("스레드 삭제 실패", "댓글이 그대로 유지됩니다", "작성자 또는 관리자 권한을 확인한 뒤 다시 삭제하세요")
      );
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
                  <MentionComposer
                    value={editContent}
                    onChange={setEditContent}
                    refs={editRefs}
                    onRefsChange={setEditRefs}
                    mentions={editMentions}
                    onMentionsChange={setEditMentions}
                    notes={notes}
                    mentionOptions={mentionOptions}
                    placeholder="댓글을 수정하세요. @ 또는 #으로 대상을 검색합니다."
                  />
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
                  {comment.mentions.length > 0 && (
                    <div className="ref-list mention-list">
                      {comment.mentions.map((mention) => <span key={mention.id}>{mention.type === "NOTE" ? "#" : "@"}{mention.label}</span>)}
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
        <MentionComposer
          value={content}
          onChange={setContent}
          refs={refs}
          onRefsChange={setRefs}
          mentions={mentions}
          onMentionsChange={setMentions}
          notes={notes}
          mentionOptions={mentionOptions}
          placeholder="댓글을 작성하세요. @사람·노드·필드, #노트를 검색합니다."
        />
        <button className="button primary full" disabled={busy || !content.trim()} onClick={() => void submit()}>댓글 작성</button>
      </div>
    </aside>
  );
}

function mentionKey(mention: Mention) {
  return `${mention.type}-${mention.targetId}-${mention.fieldKey ?? ""}`;
}

function MentionComposer({
  value,
  onChange,
  refs,
  onRefsChange,
  mentions,
  onMentionsChange,
  notes,
  mentionOptions,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  refs: Set<string>;
  onRefsChange: (refs: Set<string>) => void;
  mentions: Mention[];
  onMentionsChange: (mentions: Mention[]) => void;
  notes: Note[];
  mentionOptions: Mention[];
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const command = value.match(/(^|\s)([@#])([^\s@#]*)$/);
  const commandType = command?.[2] as "@" | "#" | undefined;
  const query = command?.[3]?.toLowerCase() ?? "";
  const noteOptions = notes
    .filter((note) => note.title.toLowerCase().includes(query) || note.content.toLowerCase().includes(query))
    .slice(0, 6);
  const atOptions = mentionOptions
    .filter((mention) => mention.label.toLowerCase().includes(query))
    .slice(0, 6);
  const selectedNotes = notes.filter((note) => refs.has(note.id));

  const replaceCommand = (token: string) => {
    const next = command ? `${value.slice(0, command.index ?? 0)}${command[1]}${token} ` : `${value}${token} `;
    onChange(next);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const selectNote = (note: Note) => {
    onRefsChange(new Set([...refs, note.id]));
    replaceCommand(`#${note.title}`);
  };

  const selectMention = (mention: Mention) => {
    if (!mentions.some((row) => mentionKey(row) === mentionKey(mention))) {
      onMentionsChange([...mentions, mention]);
    }
    replaceCommand(`@${mention.label}`);
  };

  const removeNote = (noteId: string) => {
    const next = new Set(refs);
    next.delete(noteId);
    onRefsChange(next);
  };

  const removeMention = (target: Mention) => {
    onMentionsChange(mentions.filter((mention) => mentionKey(mention) !== mentionKey(target)));
  };

  return (
    <div className="mention-composer">
      <textarea ref={textareaRef} value={value} onChange={(event) => onChange(event.target.value)} rows={4} maxLength={2000} placeholder={placeholder} />
      {commandType && (
        <div className="mention-command-menu">
          <div className="mention-command-head">
            <strong>{commandType === "@" ? "대상 멘션" : "노트 참조"}</strong>
            <span>{commandType}{query || "검색"}</span>
          </div>
          {commandType === "#"
            ? noteOptions.map((note) => (
              <button key={note.id} onClick={() => selectNote(note)}>
                <strong>{note.title}</strong>
                <small>{shortText(note.content, 56)}</small>
              </button>
            ))
            : atOptions.map((mention) => (
              <button key={mentionKey(mention)} onClick={() => selectMention(mention)}>
                <strong>{mention.label}</strong>
                <small>{mention.type === "MEMBER" ? "사람" : mention.type === "TASK" ? "결정 노드" : "Form 필드"}</small>
              </button>
            ))}
          {((commandType === "#" && !noteOptions.length) || (commandType === "@" && !atOptions.length)) && <p className="muted">검색 결과가 없습니다.</p>}
        </div>
      )}
      {(selectedNotes.length > 0 || mentions.length > 0) && (
        <div className="selected-mentions">
          {selectedNotes.map((note) => <button key={note.id} onClick={() => removeNote(note.id)}>#{note.title} ×</button>)}
          {mentions.map((mention) => <button key={mentionKey(mention)} onClick={() => removeMention(mention)}>@{mention.label} ×</button>)}
        </div>
      )}
    </div>
  );
}

function FormOutput({ task, canEditForm, onReload }: { task: TaskView; canEditForm: boolean; onReload: () => Promise<void> }) {
  const fields = task.template?.formDefinition ?? [];
  const entries = fields.length ? fields.map((field) => [field.key, task.formValues[field.key] ?? ""] as [string, string]) : Object.entries(task.formValues);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => entries.length ? entries : [["", ""]]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextEntries = fields.length ? fields.map((field) => [field.key, task.formValues[field.key] ?? ""] as [string, string]) : Object.entries(task.formValues);
    setRows(nextEntries.length ? nextEntries : [["", ""]]);
  }, [task.formValues, task.templateId]);

  const save = async () => {
    if (!canEditForm) {
      setError("양식 수정 권한이 없습니다. 소유자, 담당자 또는 관리자에게 권한을 요청하세요.");
      return;
    }
    const next = Object.fromEntries(rows.filter(([key]) => key.trim()).map(([key, value]) => [key.trim(), value.trim()]));
    try {
      setError(null);
      await request(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ formValues: next }) });
      setEditing(false);
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("양식 산출물 저장 실패", "산출물 값이 반영되지 않았습니다", "입력값을 확인한 뒤 다시 저장하세요")
      );
    }
  };

  return (
    <section className="panel">
      <PanelHeader
        title="양식 산출물"
        action={
          <button
            className="button secondary"
            disabled={!canEditForm}
            title={canEditForm ? "양식 산출물 수정" : "수정 불가: 소유자, 담당자 또는 관리자만 양식을 수정할 수 있습니다."}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "닫기" : "수정"}
          </button>
        }
      />
      {editing ? (
        <div className="form-output-editor">
          {rows.map(([key, value], index) => {
            const field = fields.find((row) => row.key === key);
            return (
            <div className="form-output-row" key={`${key}-${index}`}>
              <input
                value={key}
                placeholder={field?.label ?? "필드"}
                maxLength={80}
                readOnly={Boolean(field)}
                onChange={(event) => setRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? [event.target.value, row[1]] : row))}
              />
              {field?.type === "LONG_TEXT" ? (
                <textarea
                  value={value}
                  placeholder={field.helpText ?? "값"}
                  maxLength={1000}
                  rows={3}
                  onChange={(event) => setRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? [row[0], event.target.value] : row))}
                />
              ) : (
                <input
                  value={value}
                  placeholder={field?.helpText ?? "값"}
                  maxLength={1000}
                  onChange={(event) => setRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? [row[0], event.target.value] : row))}
                />
              )}
              {!field && <button className="button secondary" onClick={() => setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}>삭제</button>}
            </div>
          );
          })}
          {error && <p className="form-error">{error}</p>}
          <div className="row-actions">
            {!fields.length && <button className="button secondary" onClick={() => setRows((prev) => [...prev, ["", ""]])}>필드 추가</button>}
            <button className="button primary" onClick={() => void save()}>산출물 저장</button>
          </div>
        </div>
      ) : (
        <div className="kv-grid">
          {entries.length ? entries.map(([key, value]) => (
            <div key={key}>
              <small>{fields.find((field) => field.key === key)?.label ?? key}</small>
              <strong>{value}</strong>
            </div>
          )) : <p className="muted">입력된 양식 값이 없습니다</p>}
        </div>
      )}
      {task.template?.inspectionCriteria.length ? (
        <div className="criteria-list">
          {task.template.inspectionCriteria.map((criterion) => <span key={criterion}>{criterion}</span>)}
        </div>
      ) : null}
    </section>
  );
}

function TimelinePanel({ timeline, notes, members }: { timeline: TimelineEvent[]; notes: Note[]; members: Member[] }) {
  const [openSessions, setOpenSessions] = useState<Set<string>>(() => {
    const value = window.localStorage.getItem("task-timeline-open-sessions");
    return value ? new Set(value.split(",").filter(Boolean)) : new Set();
  });
  const sessions = useMemo(() => {
    const rows: Array<{ id: string; representative: TimelineEvent; hidden: TimelineEvent[] }> = [];
    timeline.forEach((event) => {
      const minuteKey = new Date(event.createdAt).toISOString().slice(0, 16);
      const previous = rows[rows.length - 1];
      if (previous && new Date(previous.representative.createdAt).toISOString().slice(0, 16) === minuteKey && previous.representative.actorId === event.actorId) {
        previous.hidden.push(event);
      } else {
        rows.push({ id: `${event.actorId}-${minuteKey}`, representative: event, hidden: [] });
      }
    });
    return rows;
  }, [timeline]);
  const hiddenSessionIds = sessions.filter((session) => session.hidden.length > 0).map((session) => session.id);
  const allOpen = hiddenSessionIds.length > 0 && hiddenSessionIds.every((id) => openSessions.has(id));
  useEffect(() => {
    window.localStorage.setItem("task-timeline-open-sessions", [...openSessions].join(","));
  }, [openSessions]);
  const renderEvent = (event: TimelineEvent) => (
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
  );

  return (
    <section className="panel">
      <PanelHeader
        title="타임라인"
        action={hiddenSessionIds.length > 0 ? (
          <button className="button secondary" onClick={() => setOpenSessions(allOpen ? new Set() : new Set(hiddenSessionIds))}>
            {allOpen ? "접기" : "전체 펼침"}
          </button>
        ) : <button className="button secondary" disabled>전체</button>}
      />
      <div className="timeline">
        {sessions.map((session) => {
          const open = openSessions.has(session.id);
          return (
            <div className="timeline-session" key={session.id}>
              {renderEvent(session.representative)}
              {session.hidden.length > 0 && (
                <>
                  <button
                    className="show-more"
                    onClick={() => setOpenSessions((prev) => {
                      const next = new Set(prev);
                      if (next.has(session.id)) next.delete(session.id);
                      else next.add(session.id);
                      return next;
                    })}
                  >
                    {open ? "Show less" : `Show ${session.hidden.length} more`}
                  </button>
                  {open && <div className="timeline-hidden">{session.hidden.map(renderEvent)}</div>}
                </>
              )}
            </div>
          );
        })}
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

function TasksView({ tasks, members, me, onReload }: { tasks: TaskView[]; members: Member[]; me: Member; onReload: () => Promise<void> }) {
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialViewMode = searchParams.get("view");
  const initialSortBy = searchParams.get("sort");
  const initialGroupBy = searchParams.get("group");
  const initialFilterState = searchParams.get("state");
  const initialFilterType = searchParams.get("type");
  const initialQuery = searchParams.get("q");
  const initialQuickFilter = searchParams.get("qf");
  const initialAdvancedFilter = searchParams.get("af");
  const initialTableColumns = searchParams.get("tc");
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [templateType, setTemplateType] = useState<TemplateType>("TASK");
  const [query, setQuery] = useState(initialQuery ?? "");
  const [filterState, setFilterState] = useState<"ALL" | TaskState>(() =>
    initialFilterState && states.includes(initialFilterState as "ALL" | TaskState) ? (initialFilterState as "ALL" | TaskState) : "ALL"
  );
  const [filterType, setFilterType] = useState<"ALL" | TemplateType>(() =>
    initialFilterType && templateTypes.includes(initialFilterType as "ALL" | TemplateType) ? (initialFilterType as "ALL" | TemplateType) : "ALL"
  );
  const [sortBy, setSortBy] = useState(() =>
    initialSortBy && ["manual", "updated", "due", "priority"].includes(initialSortBy) ? initialSortBy : "manual"
  );
  const [viewMode, setViewMode] = useState<TaskViewMode>(() =>
    initialViewMode === "table" || initialViewMode === "board" || initialViewMode === "backlog" || initialViewMode === "hierarchy" || initialViewMode === "graph" ? initialViewMode : "list"
  );
  const [groupBy, setGroupBy] = useState<"none" | "state" | "assignee">(() =>
    initialGroupBy === "state" || initialGroupBy === "assignee" ? initialGroupBy : "none"
  );
  const [quickFilter, setQuickFilter] = useState<"all" | "mine" | "pending" | "due-today">(() =>
    initialQuickFilter === "mine" || initialQuickFilter === "pending" || initialQuickFilter === "due-today" ? initialQuickFilter : "all"
  );
  const [tableColumns, setTableColumns] = useState(() => {
    const stored = window.localStorage.getItem("task-table-columns");
    const source = initialTableColumns ?? stored;
    if (!source) return { assignee: true, dueDate: true, updatedAt: true, priority: true };
    const keys = new Set(source.split(",").filter(Boolean));
    return {
      assignee: keys.has("assignee"),
      dueDate: keys.has("dueDate"),
      updatedAt: keys.has("updatedAt"),
      priority: keys.has("priority")
    };
  });
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(() =>
    initialAdvancedFilter === "1" || Boolean(initialQuery || initialFilterState || initialFilterType || initialSortBy || initialGroupBy || initialQuickFilter)
  );
  const meId = me.id;

  useEffect(() => {
    const url = new URL(window.location.href);
    if (quickFilter === "all") url.searchParams.delete("qf");
    else url.searchParams.set("qf", quickFilter);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [quickFilter]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (viewMode === "list") url.searchParams.delete("view");
    else url.searchParams.set("view", viewMode);
    if (sortBy === "manual") url.searchParams.delete("sort");
    else url.searchParams.set("sort", sortBy);
    if (groupBy === "none") url.searchParams.delete("group");
    else url.searchParams.set("group", groupBy);
    if (filterState === "ALL") url.searchParams.delete("state");
    else url.searchParams.set("state", filterState);
    if (filterType === "ALL") url.searchParams.delete("type");
    else url.searchParams.set("type", filterType);
    if (!query.trim()) url.searchParams.delete("q");
    else url.searchParams.set("q", query.trim());
    if (advancedFilterOpen) url.searchParams.set("af", "1");
    else url.searchParams.delete("af");
    const activeColumns = (Object.entries(tableColumns).filter(([, enabled]) => enabled).map(([key]) => key) as Array<keyof typeof tableColumns>).join(",");
    if (activeColumns === "assignee,dueDate,updatedAt,priority") url.searchParams.delete("tc");
    else url.searchParams.set("tc", activeColumns);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [advancedFilterOpen, filterState, filterType, groupBy, query, sortBy, tableColumns, viewMode]);

  useEffect(() => {
    const activeColumns = (Object.entries(tableColumns).filter(([, enabled]) => enabled).map(([key]) => key) as Array<keyof typeof tableColumns>).join(",");
    window.localStorage.setItem("task-table-columns", activeColumns);
  }, [tableColumns]);

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
    .filter((task) => {
      if (quickFilter === "all") return true;
      if (quickFilter === "mine") return task.assigneeIds.includes(meId) || task.ownerId === meId;
      if (quickFilter === "pending") return task.currentState === "PENDING_APPROVAL";
      return isDueToday(task.dueDate);
    })
    .sort((a, b) => {
      if (sortBy === "manual") return 0;
      if (sortBy === "due") return String(a.dueDate ?? "9999").localeCompare(String(b.dueDate ?? "9999"));
      if (sortBy === "priority") return ["URGENT", "HIGH", "MEDIUM", "LOW"].indexOf(a.priority) - ["URGENT", "HIGH", "MEDIUM", "LOW"].indexOf(b.priority);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  const dragDisabled = sortBy !== "manual" || groupBy !== "none";
  const backlogTasks = filteredTasks.filter((task) => task.currentState === "DRAFT");
  const sprintTasks = filteredTasks.filter((task) => task.currentState !== "DRAFT");
  const opsMetrics = [
    ["Scope", filteredTasks.length, `${tasks.length} total`],
    ["Backlog", backlogTasks.length, "draft queue"],
    ["Approval", filteredTasks.filter((task) => task.currentState === "PENDING_APPROVAL").length, "decision wait"],
    ["Templated", filteredTasks.filter((task) => task.structureState === "TEMPLATED").length, "structured"],
    ["Mentions", filteredTasks.reduce((sum, task) => sum + task.activity.commentsCount, 0), "thread load"],
    ["Evidence", filteredTasks.reduce((sum, task) => sum + task.activity.notesCount + task.activity.filesCount, 0), "notes/files"]
  ];

  const patchTask = async (taskId: string, patch: Partial<Pick<TaskView, "currentState" | "priority" | "parentId">>) => {
    await request(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(patch) });
    await onReload();
  };
  const quickFilterLabel: Record<typeof quickFilter, string> = {
    all: "전체",
    mine: "내 할 일",
    pending: "승인 대기",
    "due-today": "오늘 기한"
  };
  const filterSummary = [
    quickFilter !== "all" ? `빠른필터 ${quickFilterLabel[quickFilter]}` : null,
    filterState !== "ALL" ? `상태 ${STATE_META[filterState].label}` : null,
    filterType !== "ALL" ? `유형 ${TEMPLATE_META[filterType].label}` : null,
    query.trim() ? `검색 '${query.trim()}'` : null
  ].filter(Boolean).join(" · ");

  return (
    <section className="page-stack">
      <PageHeader eyebrow="태스크" title="실행 관점 목록" action={<Badge tone="blue">{filteredTasks.length} / {tasks.length}</Badge>} />
      <div className="ops-strip">
        {opsMetrics.map(([label, value, caption]) => (
          <article className="ops-cell" key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
            <span>{caption}</span>
          </article>
        ))}
      </div>
      <section className="tabs-stack">
        <TaskViewTabs value={viewMode} tasks={tasks} onChange={setViewMode} />
        <div className="advanced-filter-shell">
          <div className="advanced-filter-head">
            <div className="advanced-filter-label">
              <small className="tabs-section-label">고급 필터</small>
              <span>{filterSummary || "빠른 필터, 검색, 상태/유형/정렬/그룹을 한 번에 관리합니다."}</span>
            </div>
            <button
              className="filter-toggle-icon"
              onClick={() => setAdvancedFilterOpen((prev) => !prev)}
              aria-label={advancedFilterOpen ? "고급 필터 접기" : "고급 필터 펼치기"}
              title={advancedFilterOpen ? "고급 필터 접기" : "고급 필터 펼치기"}
            >
              {advancedFilterOpen ? "−" : "+"}
            </button>
          </div>
          {advancedFilterOpen && (
            <>
              <div className="advanced-quick-tabs">
                <Tabs
                  variant="segmented"
                  value={quickFilter}
                  onChange={(value) => setQuickFilter(value as typeof quickFilter)}
                  tabs={[
                    { value: "all", label: "전체", count: tasks.length },
                    { value: "mine", label: "내 할 일", count: tasks.filter((task) => task.assigneeIds.includes(meId) || task.ownerId === meId).length },
                    { value: "pending", label: "승인 대기", count: tasks.filter((task) => task.currentState === "PENDING_APPROVAL").length },
                    { value: "due-today", label: "오늘 기한", count: tasks.filter((task) => isDueToday(task.dueDate)).length }
                  ]}
                />
              </div>
              <FilterShell
                meta={<span>{filteredTasks.length}개 표시 · 정렬 {sortBy} · 그룹 {groupBy}</span>}
                action={<button className="button secondary" onClick={() => { setQuery(""); setFilterState("ALL"); setFilterType("ALL"); setSortBy("manual"); setGroupBy("none"); setQuickFilter("all"); }}>필터 초기화</button>}
              >
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목 또는 설명 검색" />
                <Select label="상태" tone="filter" value={filterState} onChange={(v) => setFilterState(v as typeof filterState)} options={states.map((v) => [v, v === "ALL" ? "전체 상태" : STATE_META[v].label])} />
                <Select label="유형" tone="filter" value={filterType} onChange={(v) => setFilterType(v as typeof filterType)} options={templateTypes.map((v) => [v, v === "ALL" ? "전체 유형" : TEMPLATE_META[v].label])} />
                <Select label="정렬" tone="filter" value={sortBy} onChange={setSortBy} options={[["manual", "수동 순서"], ["updated", "최근 수정순"], ["due", "기한순"], ["priority", "우선순위순"]]} />
                <Select label="그룹" tone="filter" value={groupBy} onChange={(value) => setGroupBy(value as typeof groupBy)} options={[["none", "그룹 없음"], ["state", "상태별"], ["assignee", "담당자별"]]} />
              </FilterShell>
            </>
          )}
        </div>
      </section>
      <form className="create-card" onSubmit={create}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="새 태스크 제목" />
        <Select label="유형" value={templateType} onChange={(v) => setTemplateType(v as TemplateType)} options={templateTypes.filter((v) => v !== "ALL").map((v) => [v, TEMPLATE_META[v].label])} />
        <Select label="상위" value={parentId ?? ""} onChange={(v) => setParentId(v || null)} options={[["", "상위 항목 없음"], ...tasks.map((task) => [task.id, task.title] as [string, string])]} />
        <button className="button primary">생성</button>
      </form>
      {dragDisabled && (viewMode === "list" || viewMode === "table" || viewMode === "backlog") && (
        <div className="sort-banner">
          <strong>정렬/그룹 중</strong>
          <span>수동 순서 이동은 정렬/그룹이 모두 꺼져 있을 때 활성화됩니다.</span>
          <button className="button secondary" onClick={() => { setSortBy("manual"); setGroupBy("none"); }}>정렬/그룹 해제</button>
        </div>
      )}
      {viewMode === "board" ? (
        <TaskBoardView tasks={filteredTasks} members={members} onPatch={patchTask} />
      ) : viewMode === "table" ? (
        <TaskTableView
          tasks={filteredTasks}
          members={members}
          columns={tableColumns}
          onToggleColumn={(key) => setTableColumns((prev) => ({ ...prev, [key]: !prev[key] }))}
          onPatch={patchTask}
        />
      ) : viewMode === "backlog" ? (
        <div className="backlog-layout">
          <TaskListPanel title="백로그" tasks={backlogTasks} members={members} dragDisabled={dragDisabled} onPatch={patchTask} />
          <TaskListPanel title="현재 스프린트" tasks={sprintTasks} members={members} dragDisabled={dragDisabled} onPatch={patchTask} />
        </div>
      ) : groupBy === "state" ? (
        <div className="grouped-list">
          {states.filter((state): state is TaskState => state !== "ALL").map((state) => (
            <TaskListPanel key={state} title={STATE_META[state].label} tasks={filteredTasks.filter((task) => task.currentState === state)} members={members} dragDisabled={dragDisabled} onPatch={patchTask} />
          ))}
        </div>
      ) : groupBy === "assignee" ? (
        <div className="grouped-list">
          {members.map((member) => (
            <TaskListPanel key={member.id} title={member.name} tasks={filteredTasks.filter((task) => task.assigneeIds.includes(member.id))} members={members} dragDisabled={dragDisabled} onPatch={patchTask} />
          ))}
        </div>
      ) : (
        <TaskListPanel title="전체 태스크" tasks={filteredTasks} members={members} dragDisabled={dragDisabled} onPatch={patchTask} />
      )}
    </section>
  );
}

function TaskTableView({
  tasks,
  members,
  columns,
  onToggleColumn,
  onPatch
}: {
  tasks: TaskView[];
  members: Member[];
  columns: { assignee: boolean; dueDate: boolean; updatedAt: boolean; priority: boolean };
  onToggleColumn: (key: "assignee" | "dueDate" | "updatedAt" | "priority") => void;
  onPatch: (taskId: string, patch: Partial<Pick<TaskView, "currentState" | "priority" | "parentId">>) => Promise<void>;
}) {
  const tableGridTemplate = [
    "minmax(280px, 1.6fr)",
    "minmax(140px, 0.7fr)",
    ...(columns.priority ? ["minmax(120px, 0.55fr)"] : []),
    ...(columns.assignee ? ["minmax(180px, 0.8fr)"] : []),
    ...(columns.dueDate ? ["minmax(110px, 0.55fr)"] : []),
    ...(columns.updatedAt ? ["minmax(110px, 0.55fr)"] : [])
  ].join(" ");
  return (
    <section className="task-list-panel table-view-panel">
      <div className="table-view-toolbar">
        <strong>테이블 컬럼</strong>
        <div className="table-column-toggles">
          <button className={`button ${columns.assignee ? "primary" : "secondary"}`} onClick={() => onToggleColumn("assignee")}>담당자</button>
          <button className={`button ${columns.dueDate ? "primary" : "secondary"}`} onClick={() => onToggleColumn("dueDate")}>기한</button>
          <button className={`button ${columns.updatedAt ? "primary" : "secondary"}`} onClick={() => onToggleColumn("updatedAt")}>수정일</button>
          <button className={`button ${columns.priority ? "primary" : "secondary"}`} onClick={() => onToggleColumn("priority")}>우선순위</button>
        </div>
      </div>
      <div className="task-table table-mode">
        <div className="task-row table-row table-head" style={{ gridTemplateColumns: tableGridTemplate }}>
          <span>제목</span>
          <span>상태</span>
          {columns.priority && <span>우선순위</span>}
          {columns.assignee && <span>담당자</span>}
          {columns.dueDate && <span>기한</span>}
          {columns.updatedAt && <span>수정일</span>}
        </div>
        {tasks.map((task) => (
          <div className="task-row table-row" key={task.id} style={{ gridTemplateColumns: tableGridTemplate }}>
            <button className="task-open-cell table-title-cell" onClick={() => go(`/tasks/${task.id}`)}>
              <strong>{task.title}</strong>
              <small>{templateLabel(task.templateType)} · {STRUCTURE_META[task.structureState].label}</small>
            </button>
            <Select
              tone="inline"
              value={task.currentState}
              onChange={(value) => void onPatch(task.id, { currentState: value as TaskState })}
              options={states.filter((state): state is TaskState => state !== "ALL").map((state) => [state, STATE_META[state].label])}
            />
            {columns.priority && (
              <Select
                tone="inline"
                value={task.priority}
                onChange={(value) => void onPatch(task.id, { priority: value as TaskView["priority"] })}
                options={["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => [value, priorityLabel[value as TaskView["priority"]]])}
              />
            )}
            {columns.assignee && <span>{task.assigneeIds.map((id) => memberName(members, id)).join(", ") || "미지정"}</span>}
            {columns.dueDate && <span>{formatDate(task.dueDate)}</span>}
            {columns.updatedAt && <span>{formatDate(task.updatedAt)}</span>}
          </div>
        ))}
        {!tasks.length && <div className="empty-row">표시할 태스크가 없습니다.</div>}
      </div>
    </section>
  );
}

function TaskListPanel({
  title,
  tasks,
  members,
  dragDisabled,
  onPatch
}: {
  title: string;
  tasks: TaskView[];
  members: Member[];
  dragDisabled: boolean;
  onPatch: (taskId: string, patch: Partial<Pick<TaskView, "currentState" | "priority" | "parentId">>) => Promise<void>;
}) {
  return (
    <section className="task-list-panel">
      <div className="task-list-head">
        <strong>{title}</strong>
        <span>{tasks.length}</span>
      </div>
      <div className="task-table">
        <div className="task-row rich-row table-head">
          <span />
          <span>Decision object</span>
          <span>Owner / signal</span>
          <span>Status</span>
          <span>Priority</span>
        </div>
        {tasks.map((task) => (
          <div key={task.id} className={`task-row rich-row priority-${task.priority.toLowerCase()}`}>
            <button className={`drag-handle ${dragDisabled ? "disabled" : ""}`} title={dragDisabled ? "정렬 또는 그룹 중에는 순서 이동이 비활성화됩니다." : "수동 순서 이동"}>⠿</button>
            <button className="task-open-cell" onClick={() => go(`/tasks/${task.id}`)}>
              <span className="object-main">
                <strong>{task.title}</strong>
                <small>{task.parentId ? "parent linked" : "root"} · {STRUCTURE_META[task.structureState].label}</small>
              </span>
              <span className="object-tags">
                <Badge tone={templateTone(task.templateType)}>{templateLabel(task.templateType)}</Badge>
                <span className="signal-chip">N{task.activity.notesCount}</span>
                <span className="signal-chip">T{task.activity.commentsCount}</span>
              </span>
            </button>
            <span className="owner-cell">
              <strong>{task.assigneeIds.map((id) => memberName(members, id)).join(", ") || "미지정"}</strong>
              <small>signal {densitySignal(task)}</small>
            </span>
            <Select tone="inline" value={task.currentState} onChange={(value) => void onPatch(task.id, { currentState: value as TaskState })} options={states.filter((state): state is TaskState => state !== "ALL").map((state) => [state, STATE_META[state].label])} />
            <Select tone="inline" value={task.priority} onChange={(value) => void onPatch(task.id, { priority: value as TaskView["priority"] })} options={["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => [value, priorityLabel[value as TaskView["priority"]]])} />
          </div>
        ))}
        {!tasks.length && <div className="empty-row">표시할 태스크가 없습니다.</div>}
      </div>
    </section>
  );
}

function TaskBoardView({
  tasks,
  members,
  onPatch
}: {
  tasks: TaskView[];
  members: Member[];
  onPatch: (taskId: string, patch: Partial<Pick<TaskView, "currentState" | "priority" | "parentId">>) => Promise<void>;
}) {
  return (
    <div className="board-view">
      {states.filter((state): state is TaskState => state !== "ALL").map((state) => {
        const rows = tasks.filter((task) => task.currentState === state);
        return (
          <section className="board-column" key={state}>
            <div className="board-column-head">
              <Badge tone={STATE_META[state].tone}>{STATE_META[state].label}</Badge>
              <span>{rows.length}</span>
            </div>
            <div className="board-card-stack">
              {rows.map((task) => (
                <article className={`board-card priority-${task.priority.toLowerCase()}`} key={task.id}>
                  <button className="board-card-title" onClick={() => go(`/tasks/${task.id}`)}>{task.title}</button>
                  <div className="board-card-meta">
                    <Badge tone={templateTone(task.templateType)}>{templateLabel(task.templateType)}</Badge>
                    <span>{task.assigneeIds.map((id) => memberName(members, id)).join(", ") || "미지정"}</span>
                  </div>
                  <div className="card-signal-row">
                    <span>notes {task.activity.notesCount}</span>
                    <span>threads {task.activity.commentsCount}</span>
                    <span>{STRUCTURE_META[task.structureState].label}</span>
                  </div>
                  <Select tone="inline" value={task.currentState} onChange={(value) => void onPatch(task.id, { currentState: value as TaskState })} options={states.filter((row): row is TaskState => row !== "ALL").map((row) => [row, `${STATE_META[row].label}로 이동`])} />
                </article>
              ))}
              <button className="board-add" onClick={() => go("/hierarchy")}>+ Add task</button>
            </div>
          </section>
        );
      })}
    </div>
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
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("템플릿 생성 실패", "새 템플릿이 추가되지 않았습니다", "권한과 입력값을 확인한 뒤 다시 생성하세요")
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-stack">
      <PageHeader eyebrow="템플릿" title="방법론 자산" />
      <form className="create-card template-create" onSubmit={createTemplate}>
        <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="템플릿 이름" />
        <Select label="유형" value={type} onChange={(value) => setType(value as TemplateType)} options={templateTypes.filter((value) => value !== "ALL").map((value) => [value, TEMPLATE_META[value].label])} />
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
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("템플릿 저장 실패", "템플릿 변경사항이 반영되지 않았습니다", "편집자 이상 권한과 입력값을 확인한 뒤 다시 저장하세요")
      );
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
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("템플릿 삭제 실패", "템플릿이 그대로 유지됩니다", "관리자 권한과 대상 상태를 확인한 뒤 다시 삭제하세요")
      );
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
          <Select label="유형" value={draft.type} onChange={(value) => setDraft((prev) => ({ ...prev, type: value as TemplateType }))} options={templateTypes.filter((value) => value !== "ALL").map((value) => [value, TEMPLATE_META[value].label])} />
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
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("역할 변경 실패", "멤버 역할이 변경되지 않았습니다", "권한과 대상 멤버 상태를 확인한 뒤 다시 시도하세요")
      );
    }
  };

  const removeMember = async (member: Member) => {
    if (!window.confirm(`${member.name} 멤버를 제거할까요? 연결된 담당자/참관자와 알림도 정리됩니다.`)) return;
    try {
      setError(null);
      await request(`/api/admin/members/${member.id}`, { method: "DELETE" });
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("멤버 제거 실패", "멤버가 그대로 유지됩니다", "관리자 권한과 대상 멤버 상태를 확인한 뒤 다시 시도하세요")
      );
    }
  };

  return (
    <section className="page-stack">
      <PageHeader eyebrow="관리" title="멤버와 역할" />
      <form className="create-card" onSubmit={invite}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@company.com" />
        <Select label="역할" value={role} onChange={(v) => setRole(v as Role)} options={["VIEWER", "EDITOR", "APPROVER", "ADMIN"].map((v) => [v, roleLabel[v as Role]])} />
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
                  tone="inline"
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
  const headline = [
    ["Unmet Needs", analytics.shapedNodeCount > 0 && analytics.mentionThreadCount > 0 ? "YES" : "WATCH", "object clarity"],
    ["Retention", analytics.voluntaryVisitsPerWeek > 0 ? "YES" : "WATCH", `${analytics.voluntaryVisitsPerWeek}/week`],
    ["Loop Quality", pct(analytics.feedbackNodeRevisionRate), "feedback revision"],
    ["Decision Flow", String(analytics.decisionEvents), "events"]
  ];
  const rows = [
    ["형상화", "Work Graph에 결정 대상이 존재하는가", analytics.shapedNodeCount, "노드 수"],
    ["관계", "Objective→KR→Task 연결이 이어지는가", analytics.relationCount, "edge 수"],
    ["정형화", "Template 적용으로 산출물 구조가 생겼는가", analytics.templatedNodeCount, "template node"],
    ["Form", "Template Form Output이 활성화됐는가", analytics.activeFormFieldCount, "field 수"],
    ["멘션", "대상을 가리켜 논의가 시작됐는가", analytics.mentionCount, "mention 수"],
    ["Thread", "멘션 기반 스레드가 만들어졌는가", analytics.mentionThreadCount, "thread 수"],
    ["Cross-Fn", "비개발/개발이 같은 노드를 보고 있는가", pct(analytics.crossFunctionalThreadRate), "rate"],
    ["Revision", "피드백 이후 구조가 다시 바뀌는가", pct(analytics.feedbackNodeRevisionRate), "rate"]
  ];
  const cards = [
    ["주간 재방문", pct(analytics.weeklyReturnRate), "자발 루프"],
    ["노트 : 스레드", analytics.notesThreadBalance, "근거/논의 균형"],
    ["비개발 편집", pct(analytics.nonDevContributionRate), "cross function"],
    ["#참조율", pct(analytics.noteReferenceRate), "evidence link"]
  ];
  return (
    <section className="page-stack">
      <PageHeader eyebrow="분석" title="Objective 1 판정 대시보드" />
      <div className="analytics-hero">
        {headline.map(([label, value, caption]) => (
          <article className="hero-metric" key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
            <span>{caption}</span>
          </article>
        ))}
      </div>
      <div className="metric-grid compact">
        {cards.map(([label, value]) => (
          <article className="metric-card" key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <section className="analytics-table">
        <div className="analytics-row analytics-head">
          <span>KR 1.1 Index</span>
          <span>판정 질문</span>
          <span>Value</span>
          <span>Unit</span>
        </div>
        {rows.map(([label, question, value, unit]) => (
          <div className="analytics-row" key={label}>
            <strong>{label}</strong>
            <span>{question}</span>
            <b>{value}</b>
            <small>{unit}</small>
          </div>
        ))}
      </section>
    </section>
  );
}

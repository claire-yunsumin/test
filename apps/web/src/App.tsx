import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  LEGACY_STATE_TO_STATUS_ID,
  type ApprovalLine,
  type ApprovalPolicy,
  INBOX_COMPONENTS,
  STATE_META,
  STRUCTURE_META,
  TEMPLATE_META,
  type Analytics,
  type AppData,
  type DecisionType,
  type FormFieldType,
  type TaskAttachment,
  type Mention,
  type InboxComponent,
  type NotificationSettings,
  type Member,
  type Note,
  type Folder,
  type Bucket,
  type TaskList,
  type Unit,
  type UnitMember,
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
const states: Array<"ALL" | TaskState> = ["ALL", "DRAFT", "IN_PROGRESS", "DONE", "CANCELED"];
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
const TASK_DESCRIPTION_FIELD_KEY = "__task_description";
const TASK_FILES_FIELD_KEY = "__task_files";

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
  if (state === "IN_PROGRESS") return canApprove ? "다음 권장 액션: 승인 / 보완 / 반려" : "다음 권장 액션: 진행";
  if (state === "DONE") return "완료 상태입니다";
  return "현재 상태에서는 추가 액션이 제한됩니다";
}

type DecisionAction = {
  toState: TaskState;
  decisionType: DecisionType;
  title: string;
  tone: "primary" | "secondary" | "danger";
};

function decisionActions(state: TaskState, canApprove: boolean): DecisionAction[] {
  if (state === "DRAFT") return [{ toState: "IN_PROGRESS", decisionType: "STATE_ONLY", title: "작업 시작", tone: "primary" }];
  if (state === "IN_PROGRESS") {
    if (!canApprove) return [{ toState: "IN_PROGRESS", decisionType: "SUPPLEMENT", title: "보완 요청", tone: "secondary" }];
    return [
      { toState: "IN_PROGRESS", decisionType: "SUPPLEMENT", title: "보완 요청", tone: "secondary" },
      { toState: "CANCELED", decisionType: "REJECT", title: "반려", tone: "danger" },
      { toState: "DONE", decisionType: "APPROVE", title: "승인", tone: "primary" }
    ];
  }
  return [];
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

function profileDisplayName(member: Member) {
  const local = member.email.split("@")[0]?.trim();
  return local || member.name;
}

type TaskAccessLevel = "ASSIGNEE" | "WATCHER" | "VIEW";

function taskAccessOf(task: TaskView, memberId: string): TaskAccessLevel {
  if (task.assigneeIds.includes(memberId)) return "ASSIGNEE";
  if (task.watcherIds.includes(memberId)) return "WATCHER";
  return "VIEW";
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

type TaskViewMode = "list" | "board" | "backlog" | "graph";

function taskViewTabs(tasks: TaskView[]) {
  const backlogCount = tasks.filter((task) => (task.phaseOverride ?? task.workflowPhase ?? (task.currentState === "DRAFT" ? "BACKLOG" : "ACTIVE")) === "BACKLOG").length;
  return [
    { value: "list", label: "리스트", count: tasks.length },
    { value: "board", label: "보드" },
    { value: "backlog", label: "백로그", count: backlogCount },
    { value: "graph", label: "결정 그래프" }
  ] as Array<{ value: TaskViewMode; label: string; count?: number }>;
}

function effectiveTaskPhase(task: TaskView) {
  return task.phaseOverride ?? task.workflowPhase ?? (task.currentState === "DRAFT" ? "BACKLOG" : task.currentState === "DONE" || task.currentState === "CANCELED" ? "CLOSED" : "ACTIVE");
}

function isBacklogTask(task: TaskView) {
  return effectiveTaskPhase(task) === "BACKLOG";
}

function goTaskViewTab(value: TaskViewMode) {
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

function headerBreadcrumb(route: string, taskId: string | undefined, tasks: TaskView[]) {
  const task = taskId ? tasks.find((row) => row.id === taskId) : null;
  if (route.startsWith("/tasks/") && task) {
    return [
      { label: "태스크", path: "/tasks" },
      { label: task.title, path: `/tasks/${task.id}` }
    ];
  }
  if (route === "/tasks") return [{ label: "태스크", path: "/tasks" }];
  if (route === "/graph") return [{ label: "태스크", path: "/tasks" }, { label: "결정 그래프", path: "/graph" }];
  if (route === "/inbox") return [{ label: "알림함", path: "/inbox" }];
  if (route === "/settings/templates" || route === "/templates") return [{ label: "설정", path: "/settings/profile" }, { label: "템플릿 센터", path: "/settings/templates" }];
  if (route === "/settings" || route === "/settings/profile") return [{ label: "설정", path: "/settings/profile" }, { label: "프로필", path: "/settings/profile" }];
  if (route === "/settings/units") return [{ label: "설정", path: "/settings" }, { label: "전역 유닛 관리", path: "/settings/units" }];
  if (route === "/settings/approval-policies") return [{ label: "설정", path: "/settings" }, { label: "전역 승인정책", path: "/settings/approval-policies" }];
  if (route === "/settings/unit") return [{ label: "설정", path: "/settings/profile" }, { label: "유닛", path: "/settings/unit" }];
  if (/^\/units\/[^/]+\/settings$/.test(route)) return [{ label: "유닛", path: route }, { label: "설정", path: route }];
  if (route === "/settings/members") return [{ label: "설정", path: "/settings/profile" }, { label: "권한 관리", path: "/settings/members" }];
  if (route === "/settings/permissions") return [{ label: "설정", path: "/settings/profile" }, { label: "전역 권한", path: "/settings/permissions" }];
  if (route === "/settings/analytics") return [{ label: "설정", path: "/settings/profile" }, { label: "분석", path: "/settings/analytics" }];
  if (route === "/settings/alerts") return [{ label: "설정", path: "/settings/profile" }, { label: "알림 설정", path: "/settings/alerts" }];
  return [{ label: "태스크", path: "/tasks" }];
}

export function App() {
  const [route, setRoute] = useState<Route>(() => currentRoute());
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string>(() => new URLSearchParams(window.location.search).get("unit") ?? "");
  const [selectedListId, setSelectedListId] = useState<string>(() => new URLSearchParams(window.location.search).get("list") ?? "");

  const reload = async () => {
    try {
      setError(null);
      setData(await request<AppData>("/api/bootstrap"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    }
  };

  useEffect(() => {
    const onPop = () => {
      setRoute(currentRoute());
      const params = new URLSearchParams(window.location.search);
      setSelectedUnitId(params.get("unit") ?? "");
      setSelectedListId(params.get("list") ?? "");
    };
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

  const tasksByUnit = selectedUnitId
    ? (data.tasks as TaskView[]).filter((task) => task.unitId === selectedUnitId)
    : (data.tasks as TaskView[]);
  const tasksByContext = selectedListId ? tasksByUnit.filter((task) => task.listId === selectedListId) : tasksByUnit;
  const setUnit = (unitId: string) => {
    setSelectedUnitId(unitId);
    setSelectedListId("");
    const url = new URL(window.location.href);
    if (!unitId) url.searchParams.delete("unit");
    else url.searchParams.set("unit", unitId);
    url.searchParams.delete("list");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  };
  const setList = (listId: string) => {
    setSelectedListId(listId);
    const list = data.lists.find((row) => row.id === listId);
    if (list) setSelectedUnitId(list.unitId);
    const url = new URL(window.location.href);
    if (list?.unitId) url.searchParams.set("unit", list.unitId);
    if (!listId) url.searchParams.delete("list");
    else url.searchParams.set("list", listId);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  };
  return (
    <Shell
      route={route.path}
      taskId={route.taskId}
      me={data.me}
      inbox={data.inbox}
      tasks={tasksByContext}
      units={data.units}
      unitMembers={data.unitMembers}
      folders={data.folders}
      lists={data.lists}
      selectedUnitId={selectedUnitId}
      selectedListId={selectedListId}
      onSelectUnit={setUnit}
      onSelectList={setList}
      onNavigate={go}
    >
      {route.path.startsWith("/tasks/") && route.taskId ? (
        <TaskWorkspace taskId={route.taskId} me={data.me} templates={data.templates} onReload={reload} />
      ) : route.path === "/tasks" ? (
        <TasksView tasks={tasksByContext} members={data.members} buckets={data.buckets} me={data.me} selectedUnitId={selectedUnitId} selectedListId={selectedListId} onReload={reload} />
      ) : route.path === "/graph" ? (
        <DecisionGraphView data={{ ...data, tasks: tasksByContext }} />
      ) : route.path === "/inbox" ? (
        <InboxView data={data} onReload={reload} />
      ) : route.path === "/settings/templates" || route.path === "/templates" ? (
        <TemplatesView templates={data.templates} workflowStatuses={data.workflowStatuses} onReload={reload} />
      ) : route.path === "/settings/members" ? (
        <MembersView members={data.members} onReload={reload} />
      ) : route.path === "/settings/permissions" ? (
        <AdminPermissionsView onNavigate={go} />
      ) : route.path === "/settings" || route.path === "/settings/profile" ? (
        <ProfileSettingsView me={data.me} onNavigate={go} />
      ) : route.path === "/settings/units" ? (
        <GlobalUnitManagementView units={data.units} onSelectUnit={setUnit} onNavigate={go} onReload={reload} />
      ) : route.path === "/settings/approval-policies" ? (
        <GlobalApprovalPolicySettingsView approvalPolicies={data.approvalPolicies} members={data.members} onReload={reload} />
      ) : route.path === "/settings/unit" || /^\/units\/[^/]+\/settings$/.test(route.path) ? (
        <UnitSettingsView
          me={data.me}
          unit={data.units.find((unit) => unit.id === (route.unitId ?? selectedUnitId)) ?? null}
          members={data.members}
          unitMembers={data.unitMembers}
          approvalPolicies={data.approvalPolicies}
          onNavigate={go}
          onReload={reload}
        />
      ) : route.path === "/settings/analytics" ? (
        <AnalyticsView analytics={data.analytics} />
      ) : route.path === "/settings/alerts" ? (
        <NotificationSettingsView />
      ) : null}
    </Shell>
  );
}

function Shell({
  route,
  taskId,
  me,
  inbox,
  tasks,
  units,
  unitMembers,
  folders,
  lists,
  selectedUnitId,
  selectedListId,
  onSelectUnit,
  onSelectList,
  onNavigate,
  children
}: {
  route: string;
  taskId?: string;
  me: Member;
  inbox: AppData["inbox"];
  tasks: TaskView[];
  units: Unit[];
  unitMembers: UnitMember[];
  folders: Folder[];
  lists: TaskList[];
  selectedUnitId: string;
  selectedListId: string;
  onSelectUnit: (unitId: string) => void;
  onSelectList: (listId: string) => void;
  onNavigate: (path: string) => void;
  children: ReactNode;
}) {
  const unread = inbox.filter((item) => item.userId === me.id && !item.readAt).length;
  const breadcrumbs = headerBreadcrumb(route, taskId, tasks);
  const [searchOpen, setSearchOpen] = useState(false);
  const [gnbExpanded, setGnbExpanded] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const unitRoleLabel = useMemo(() => {
    if (!selectedUnitId) return me.role === "ADMIN" ? "전역 관리자" : "전역 참여자";
    const row = unitMembers.find((member) => member.unitId === selectedUnitId && member.memberId === me.id);
    if (row?.role === "OWNER") return "유닛 오너";
    if (row?.role === "MEMBER") return "유닛 멤버";
    if (row?.role === "VIEWER") return "유닛 뷰어";
    if (me.role === "ADMIN") return "관리자(전역)";
    return "유닛 외부 사용자";
  }, [me.id, me.role, selectedUnitId, unitMembers]);
  const activeUnit = units.find((unit) => unit.id === selectedUnitId);
  const activeWorkspaceValue = selectedListId ? `list:${selectedListId}` : selectedUnitId ? `unit:${selectedUnitId}` : "global";
  const globalResults = tasks
    .filter((task) => !globalQuery.trim() || `${task.title} ${task.description}`.toLowerCase().includes(globalQuery.toLowerCase()))
    .slice(0, 8);
  const links = [
    { path: "/inbox", label: "알림함", mark: "I", unread },
    { path: "/tasks", label: "태스크", mark: "T" },
    { path: "/settings", label: "설정", mark: "S" }
  ];
  const currentWorkspaceSettingsItems = [
    { path: selectedUnitId ? `/units/${selectedUnitId}/settings` : "/settings/unit", label: "유닛 설정", match: (path: string) => path === "/settings/unit" || /^\/units\/[^/]+\/settings$/.test(path) },
    ...(me.role === "ADMIN" ? [{ path: "/settings/members", label: "권한 관리", match: (path: string) => path === "/settings/members" }] : [])
  ];
  const globalManagementItems = [
    { path: "/settings/profile", label: "프로필 설정", match: (path: string) => path === "/settings" || path === "/settings/profile" },
    { path: "/settings/alerts", label: "알림 설정", match: (path: string) => path === "/settings/alerts" },
    ...(me.role === "ADMIN"
      ? [
          { path: "/settings/units", label: "전역 유닛 관리", match: (path: string) => path === "/settings/units" },
            { path: "/settings/approval-policies", label: "전역 승인정책", match: (path: string) => path === "/settings/approval-policies" },
            { path: "/settings/templates", label: "템플릿 센터", match: (path: string) => path === "/settings/templates" || path === "/templates" },
          { path: "/settings/permissions", label: "전역 권한", match: (path: string) => path === "/settings/permissions" },
          { path: "/settings/analytics", label: "분석", match: (path: string) => path === "/settings/analytics" }
        ]
      : [])
  ];
  const settingsItems = [...currentWorkspaceSettingsItems, ...globalManagementItems];
  const settingsRoutes = new Set(["/settings", "/settings/unit", "/templates", "/settings/alerts", ...settingsItems.map((item) => item.path)]);
  const isSettingsRoute = settingsRoutes.has(route) || /^\/units\/[^/]+\/settings$/.test(route);
  const workspaceUnitTitle = activeUnit?.name ?? "전역 유닛 스페이스";
  const workspaceScopeLabel = selectedListId ? "리스트 단위" : selectedUnitId ? "유닛 단위" : "전사 단위";

  return (
    <div className={`app-shell ${gnbExpanded ? "gnb-expanded" : ""}`}>
      <aside className={`gnb-sidebar ${gnbExpanded ? "expanded" : "collapsed"}`}>
        <section className="gnb-workspace-switch">
          <small>워크스페이스</small>
          <select
            value={activeWorkspaceValue}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "global") {
                onSelectUnit("");
                return;
              }
              if (value.startsWith("unit:")) {
                onSelectUnit(value.replace("unit:", ""));
                return;
              }
              if (value.startsWith("list:")) onSelectList(value.replace("list:", ""));
            }}
          >
            <option value="global">전역 유닛 스페이스</option>
            {units.map((unit) => (
              <optgroup key={unit.id} label={unit.name}>
                <option value={`unit:${unit.id}`}>{unit.name} 전체</option>
                {lists.filter((list) => list.unitId === unit.id).map((list) => (
                  <option key={list.id} value={`list:${list.id}`}>
                    └ {unit.name} / {folders.find((folder) => folder.id === list.folderId)?.name ?? "폴더 없음"} / {list.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </section>
        <nav className="nav-list">
          {links.map((link) => (
            <button
              key={link.path}
              className={`nav-item ${route === link.path || (link.path === "/tasks" && ["/tasks", "/graph"].includes(route)) || (link.path === "/settings" && isSettingsRoute) ? "active" : ""}`}
              onClick={() => onNavigate(link.path === "/settings" ? "/settings/profile" : link.path)}
              title={link.label}
            >
              <span className="nav-mark">{link.mark}</span>
              <span className="nav-label">{link.label}</span>
              {link.path === "/inbox" && Number(link.unread ?? 0) > 0 && (
                <span className="nav-unread-count">{Number(link.unread) > 99 ? "99+" : link.unread}</span>
              )}
            </button>
          ))}
        </nav>
        {isSettingsRoute && (
          <section className="gnb-settings-submenu">
            <div className="gnb-settings-group">
              <small className="gnb-settings-group-title">현재 워크스페이스 설정</small>
              {currentWorkspaceSettingsItems.map((item) => (
                <button
                  key={item.path}
                  className={`gnb-settings-item ${item.match(route) ? "active" : ""}`}
                  onClick={() => onNavigate(item.path)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="gnb-settings-group">
              <small className="gnb-settings-group-title">전역 관리</small>
              {globalManagementItems.map((item) => (
                <button
                  key={item.path}
                  className={`gnb-settings-item ${item.match(route) ? "active" : ""}`}
                  onClick={() => onNavigate(item.path)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>
        )}
        <section className="gnb-footer">
          <button className="gnb-search" onClick={() => setSearchOpen(true)} title="전역 검색">
            <span className="gnb-search-icon">⌘K</span>
            <span className="gnb-search-label">전역 검색</span>
          </button>
          <div className="gnb-profile" title={`${profileDisplayName(me)} (${roleLabel[me.role]})`}>
            <div className="avatar">{profileDisplayName(me).slice(0, 1)}</div>
            <div className="gnb-profile-copy">
              <strong>{profileDisplayName(me)}</strong>
              <small>{roleLabel[me.role]}</small>
            </div>
          </div>
        </section>
        <button className="gnb-toggle" onClick={() => setGnbExpanded((prev) => !prev)} aria-label={gnbExpanded ? "메뉴 축소" : "메뉴 확장"}>
          {gnbExpanded ? "«" : "»"}
        </button>
      </aside>
      <div className="workspace">
        <main>
          <nav className="content-breadcrumb" aria-label="페이지 경로">
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.path}-${index}`}>
                <button onClick={() => onNavigate(crumb.path)} className={`breadcrumb-link ${index === breadcrumbs.length - 1 ? "current" : ""}`}>
                  {crumb.label}
                </button>
                {index < breadcrumbs.length - 1 && <i>›</i>}
              </span>
            ))}
          </nav>
          {children}
        </main>
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

function ProfileSettingsView({ me, onNavigate }: { me: Member; onNavigate: (path: string) => void }) {
  return (
    <section className="page-stack">
      <PageHeader eyebrow="프로필" title="내 계정 설정" />
      <section className="panel">
        <PanelHeader title="기본 정보" />
        <div className="kv-grid">
          <div><small>이름</small><strong>{profileDisplayName(me)}</strong></div>
          <div><small>이메일</small><strong>{me.email}</strong></div>
          <div><small>전역 역할</small><strong>{roleLabel[me.role]}</strong></div>
        </div>
      </section>
      <section className="panel">
        <PanelHeader title="빠른 이동" />
        <div className="row-actions left">
          <button className="button secondary" onClick={() => onNavigate("/tasks")}>태스크로 이동</button>
          <button className="button secondary" onClick={() => onNavigate("/settings/members")}>멤버 관리</button>
        </div>
      </section>
    </section>
  );
}

function AdminPermissionsView({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <section className="page-stack">
      <PageHeader eyebrow="관리" title="전역 권한 관리" />
      <section className="panel">
        <PanelHeader title="권한 모델" />
        <div className="kv-grid">
          <div><small>역할 계층</small><strong>VIEWER → EDITOR → APPROVER → ADMIN</strong></div>
          <div><small>전역 관리 화면</small><strong>멤버 메뉴에서 역할 변경/삭제 수행</strong></div>
          <div><small>정책 원칙</small><strong>전역 권한은 계정 레벨, 유닛 권한은 컨텍스트 레벨로 분리</strong></div>
        </div>
        <div className="row-actions left">
          <button className="button primary" onClick={() => onNavigate("/settings/members")}>멤버 권한 관리 열기</button>
        </div>
      </section>
    </section>
  );
}

function GlobalUnitManagementView({
  units,
  onSelectUnit,
  onNavigate,
  onReload
}: {
  units: Unit[];
  onSelectUnit: (unitId: string) => void;
  onNavigate: (path: string) => void;
  onReload: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [editingUnitId, setEditingUnitId] = useState<string>("");
  const [editName, setEditName] = useState("");
  const [editPurpose, setEditPurpose] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const rows = units.filter((unit) => !query.trim() || `${unit.name} ${unit.purpose}`.toLowerCase().includes(query.toLowerCase()));

  const createUnit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await request("/api/units", { method: "POST", body: JSON.stringify({ name: name.trim(), purpose: purpose.trim() || undefined }) });
      setName("");
      setPurpose("");
      setFeedback("유닛이 생성되었습니다.");
      await onReload();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "유닛 생성에 실패했습니다.");
    }
  };

  const saveUnit = async () => {
    if (!editingUnitId || !editName.trim()) return;
    try {
      await request(`/api/units/${editingUnitId}`, { method: "PATCH", body: JSON.stringify({ name: editName.trim(), purpose: editPurpose.trim() || undefined }) });
      setEditingUnitId("");
      setFeedback("유닛이 수정되었습니다.");
      await onReload();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "유닛 수정에 실패했습니다.");
    }
  };

  const removeUnit = async (unit: Unit) => {
    if (!window.confirm(`'${unit.name}' 유닛을 삭제할까요?`)) return;
    try {
      await request(`/api/units/${unit.id}`, { method: "DELETE" });
      setFeedback("유닛이 삭제되었습니다.");
      await onReload();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "유닛 삭제에 실패했습니다.");
    }
  };

  return (
    <section className="page-stack">
      <PageHeader eyebrow="설정" title="전역 유닛 관리" />
      <form className="create-card" onSubmit={createUnit}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="새 유닛 이름" />
        <input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="유닛 목적(선택)" />
        <button className="button primary" disabled={!name.trim()}>유닛 생성</button>
      </form>
      <div className="filter-shell">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="유닛 이름/목적 검색" />
      </div>
      {feedback && <div className="inline-error">{feedback}</div>}
      <div className="task-table">
        {rows.map((unit) => {
          const editing = editingUnitId === unit.id;
          return (
            <div className="task-row static" key={unit.id}>
              <strong>{unit.name}</strong>
              <span>{unit.purpose}</span>
              <div className="row-actions">
                <button className="button secondary" onClick={() => { onSelectUnit(unit.id); onNavigate(`/units/${unit.id}/settings`); }}>상세 관리</button>
                {editing ? (
                  <>
                    <input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="이름" />
                    <input value={editPurpose} onChange={(event) => setEditPurpose(event.target.value)} placeholder="목적" />
                    <button className="button primary" onClick={() => void saveUnit()} disabled={!editName.trim()}>저장</button>
                    <button className="button secondary" onClick={() => setEditingUnitId("")}>취소</button>
                  </>
                ) : (
                  <>
                    <button className="button secondary" onClick={() => { setEditingUnitId(unit.id); setEditName(unit.name); setEditPurpose(unit.purpose); }}>수정</button>
                    <button className="button danger" onClick={() => void removeUnit(unit)}>삭제</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function UnitSettingsView({
  me,
  unit,
  members,
  unitMembers,
  approvalPolicies,
  onNavigate,
  onReload
}: {
  me: Member;
  unit: Unit | null;
  members: Member[];
  unitMembers: UnitMember[];
  approvalPolicies: ApprovalPolicy[];
  onNavigate: (path: string) => void;
  onReload: () => Promise<void>;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("VIEWER");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [unitPolicyBusy, setUnitPolicyBusy] = useState(false);
  const [unitPolicyMessage, setUnitPolicyMessage] = useState<string | null>(null);
  const [defaultApprovalPolicyId, setDefaultApprovalPolicyId] = useState(unit?.defaultApprovalPolicyId ?? "");
  const relatedMembers = unit
    ? unitMembers
      .filter((row) => row.unitId === unit.id)
      .map((row) => ({ ...row, member: members.find((member) => member.id === row.memberId) }))
      .filter((row) => Boolean(row.member))
    : [];
  const canInvite = Boolean(unit);
  useEffect(() => {
    setDefaultApprovalPolicyId(unit?.defaultApprovalPolicyId ?? "");
  }, [unit?.id, unit?.defaultApprovalPolicyId]);
  const invite = async (event: FormEvent) => {
    event.preventDefault();
    if (!canInvite || !inviteEmail.trim() || !unit) return;
    try {
      setInviteBusy(true);
      setInviteMessage(null);
      await request("/api/admin/invitations", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, unitId: unit.id })
      });
      setInviteEmail("");
      await onReload();
      setInviteMessage("유닛 멤버 초대가 생성되었습니다.");
    } catch (err) {
      setInviteMessage(err instanceof Error ? err.message : "초대 생성에 실패했습니다.");
    } finally {
      setInviteBusy(false);
    }
  };
  const saveUnitDefaultPolicy = async (event: FormEvent) => {
    event.preventDefault();
    if (!unit) return;
    try {
      setUnitPolicyBusy(true);
      setUnitPolicyMessage(null);
      await request(`/api/units/${unit.id}`, {
        method: "PATCH",
        body: JSON.stringify({ defaultApprovalPolicyId: defaultApprovalPolicyId || null })
      });
      await onReload();
      setUnitPolicyMessage("유닛 기본 승인정책이 저장되었습니다.");
    } catch (err) {
      setUnitPolicyMessage(err instanceof Error ? err.message : "유닛 기본 승인정책 저장에 실패했습니다.");
    } finally {
      setUnitPolicyBusy(false);
    }
  };
  return (
    <section className="page-stack">
      <PageHeader eyebrow="유닛" title="유닛 설정" />
      <section className="panel">
        <PanelHeader title="현재 유닛" />
        <div className="kv-grid">
          <div><small>유닛명</small><strong>{unit?.name ?? "선택된 유닛 없음"}</strong></div>
          <div><small>유닛 목적</small><strong>{unit?.purpose ?? "-"}</strong></div>
          <div><small>내 역할</small><strong>{me.role === "ADMIN" ? "유닛 관리자" : "유닛 멤버"}</strong></div>
        </div>
      </section>
      <section className="panel">
        <PanelHeader title="유닛 멤버(참고)" />
        <div className="kv-grid">
          <div><small>인원 수</small><strong>{relatedMembers.length}</strong></div>
          <div><small>구성</small><strong>{relatedMembers.map((row) => `${row.member!.name}(${row.role})`).join(", ") || "연결된 멤버 없음"}</strong></div>
        </div>
        <form className="unit-invite-form" onSubmit={invite}>
          <label>
            이메일
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder={canInvite ? "초대할 이메일" : "유닛을 먼저 선택하세요"}
              disabled={!canInvite || !unit}
            />
          </label>
          <label>
            역할
            <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)} disabled={!canInvite || !unit}>
              <option value="VIEWER">뷰어</option>
              <option value="EDITOR">편집자</option>
              <option value="APPROVER">승인자</option>
            </select>
          </label>
          <button className="button primary" disabled={!canInvite || !unit || inviteBusy || !inviteEmail.trim()}>
            {inviteBusy ? "초대 생성 중..." : "유닛 멤버 초대"}
          </button>
        </form>
        {inviteMessage && <div className="inline-error">{inviteMessage}</div>}
        <div className="row-actions left">
          <button className="button secondary" onClick={() => onNavigate("/settings/members")}>권한 관리로 이동</button>
        </div>
      </section>
      <section className="panel">
        <PanelHeader title="유닛 기본 승인정책" />
        <form className="approval-policy-form" onSubmit={saveUnitDefaultPolicy}>
          <div className="policy-basic-grid">
            <label>
              기본 정책
              <select value={defaultApprovalPolicyId} onChange={(event) => setDefaultApprovalPolicyId(event.target.value)} disabled={!unit}>
                <option value="">없음 (태스크별 선택)</option>
                {approvalPolicies.filter((policy) => policy.enabled).map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name} ({policy.mode})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row-actions left">
            <button type="button" className="button secondary" onClick={() => onNavigate("/settings/approval-policies")}>
              전역 승인정책 관리로 이동
            </button>
          </div>
          <div className="policy-submit-row">
            <button className="button primary" disabled={!unit || unitPolicyBusy}>
              {unitPolicyBusy ? "저장 중..." : "유닛 기본정책 저장"}
            </button>
          </div>
        </form>
        {unitPolicyMessage && <div className="inline-error">{unitPolicyMessage}</div>}
      </section>
    </section>
  );
}

function GlobalApprovalPolicySettingsView({
  approvalPolicies,
  members,
  onReload
}: {
  approvalPolicies: ApprovalPolicy[];
  members: Member[];
  onReload: () => Promise<void>;
}) {
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);
  const [editingPolicyId, setEditingPolicyId] = useState<string>("");
  const [policyName, setPolicyName] = useState("");
  const [policyDescription, setPolicyDescription] = useState("");
  const [policyEnabled, setPolicyEnabled] = useState(true);
  const [policyMode, setPolicyMode] = useState<ApprovalPolicy["mode"]>("PARALLEL");
  const [policyLines, setPolicyLines] = useState<Array<{ id: string; type: "CONSENSUS" | "APPROVAL"; participantIds: string[]; minApprovals: number }>>([
    { id: `line-${crypto.randomUUID()}`, type: "CONSENSUS", participantIds: [], minApprovals: 1 }
  ]);
  const [finalApproverId, setFinalApproverId] = useState("");
  const resetPolicyForm = () => {
    setEditingPolicyId("");
    setPolicyName("");
    setPolicyDescription("");
    setPolicyEnabled(true);
    setPolicyMode("PARALLEL");
    setPolicyLines([{ id: `line-${crypto.randomUUID()}`, type: "CONSENSUS", participantIds: [], minApprovals: 1 }]);
    setFinalApproverId("");
  };
  const loadPolicy = (policyId: string) => {
    setEditingPolicyId(policyId);
    const policy = approvalPolicies.find((row) => row.id === policyId);
    if (!policy) return;
    setPolicyName(policy.name);
    setPolicyDescription(policy.description ?? "");
    setPolicyEnabled(policy.enabled);
    setPolicyMode(policy.mode);
    setPolicyLines((policy.approvalLines ?? []).length
      ? (policy.approvalLines ?? []).map((line) => ({ id: line.id, type: line.type, participantIds: line.participantIds, minApprovals: line.minApprovals }))
      : [{ id: `line-${crypto.randomUUID()}`, type: "CONSENSUS", participantIds: [], minApprovals: 1 }]);
    setFinalApproverId(policy.finalApproverId ?? "");
  };
  const onLineParticipants = (lineId: string, target: HTMLSelectElement) => {
    const values = Array.from(target.selectedOptions).map((option) => option.value);
    setPolicyLines((prev) => prev.map((line) => (line.id === lineId ? { ...line, participantIds: values } : line)));
  };
  const savePolicy = async (event: FormEvent) => {
    event.preventDefault();
    if (!policyName.trim()) return;
    if (policyLines.some((line) => line.participantIds.length === 0)) {
      setPolicyMessage("모든 결재라인에 참여자를 최소 1명 이상 선택해주세요.");
      return;
    }
    try {
      setPolicyBusy(true);
      setPolicyMessage(null);
      const payload = {
        name: policyName.trim(),
        description: policyDescription.trim() || undefined,
        enabled: policyEnabled,
        mode: policyMode,
        approverType: "MEMBER",
        approverIds: [...new Set(policyLines.flatMap((line) => line.participantIds))],
        minApprovals: Math.max(...policyLines.map((line) => line.minApprovals)),
        approvalLines: policyLines.map((line) => ({
          id: line.id,
          type: line.type,
          participantIds: line.participantIds,
          minApprovals: line.minApprovals
        })),
        finalApproverId: finalApproverId || null
      };
      if (editingPolicyId) {
        await request(`/api/admin/approval-policies/${editingPolicyId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setPolicyMessage("전역 승인정책이 수정되었습니다.");
      } else {
        await request("/api/admin/approval-policies", { method: "POST", body: JSON.stringify(payload) });
        setPolicyMessage("전역 승인정책이 생성되었습니다.");
      }
      await onReload();
      resetPolicyForm();
    } catch (err) {
      setPolicyMessage(err instanceof Error ? err.message : "승인정책 저장에 실패했습니다.");
    } finally {
      setPolicyBusy(false);
    }
  };
  return (
    <section className="page-stack">
      <PageHeader eyebrow="설정" title="전역 승인정책" />
      <section className="panel">
        <PanelHeader title="승인정책 라이브러리 (크로스 유닛 공통)" />
        <div className="policy-toolbar">
          <label className="policy-toolbar-field">
            <small>정책 선택</small>
            <select value={editingPolicyId} onChange={(event) => (event.target.value ? loadPolicy(event.target.value) : resetPolicyForm())}>
              <option value="">새 정책 작성</option>
              {approvalPolicies.map((policy) => (
                <option key={policy.id} value={policy.id}>{policy.name}</option>
              ))}
            </select>
          </label>
          <button type="button" className="button secondary" onClick={resetPolicyForm}>초기화</button>
          <button type="button" className="button secondary" onClick={() => setPolicyLines((prev) => [...prev, { id: `line-${crypto.randomUUID()}`, type: "CONSENSUS", participantIds: [], minApprovals: 1 }])}>
            결재라인 추가
          </button>
        </div>
        <form className="approval-policy-form" onSubmit={savePolicy}>
          <div className="policy-basic-grid">
            <label>
              정책 이름
              <input value={policyName} onChange={(event) => setPolicyName(event.target.value)} placeholder="예: 크로스 유닛 병렬합의" />
            </label>
            <label>
              설명
              <input value={policyDescription} onChange={(event) => setPolicyDescription(event.target.value)} placeholder="정책 설명" />
            </label>
          </div>
          <div className="policy-meta-row">
            <label>
              정책 모드
              <select value={policyMode} onChange={(event) => setPolicyMode(event.target.value as ApprovalPolicy["mode"])}>
                <option value="PARALLEL">병렬</option>
                <option value="CONSENSUS">합의</option>
                <option value="SINGLE">단일</option>
              </select>
            </label>
            <label>
              최종결정권자
              <select value={finalApproverId} onChange={(event) => setFinalApproverId(event.target.value)}>
                <option value="">미지정</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>{member.name} ({roleLabel[member.role]})</option>
                ))}
              </select>
            </label>
            <label className="toggle-field">
              <input type="checkbox" checked={policyEnabled} onChange={(event) => setPolicyEnabled(event.target.checked)} />
              <span>활성 정책</span>
            </label>
          </div>
          <div className="policy-lines">
            {policyLines.map((line, index) => (
              <div key={line.id} className="policy-line-card">
                <div className="policy-line-head">
                  <strong>결재라인 {index + 1}</strong>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setPolicyLines((prev) => prev.filter((row) => row.id !== line.id))}
                    disabled={policyLines.length <= 1}
                  >
                    라인 삭제
                  </button>
                </div>
                <div className="policy-line-grid">
                  <label>
                    타입
                    <select
                      value={line.type}
                      onChange={(event) => setPolicyLines((prev) => prev.map((row) => (row.id === line.id ? { ...row, type: event.target.value as ApprovalLine["type"] } : row)))}
                    >
                      <option value="CONSENSUS">합의</option>
                      <option value="APPROVAL">승인</option>
                    </select>
                  </label>
                  <label>
                    최소 승인 수
                    <input
                      type="number"
                      min={1}
                      value={line.minApprovals}
                      onChange={(event) => setPolicyLines((prev) => prev.map((row) => (row.id === line.id ? { ...row, minApprovals: Number(event.target.value) || 1 } : row)))}
                    />
                  </label>
                </div>
                <label>
                  참여자(다중 선택)
                  <select multiple value={line.participantIds} onChange={(event) => onLineParticipants(line.id, event.target)}>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} ({roleLabel[member.role]})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
          <div className="policy-submit-row">
            <button className="button secondary" type="button" onClick={resetPolicyForm}>취소</button>
            <button className="button primary" disabled={policyBusy || !policyName.trim()}>
              {policyBusy ? "저장 중..." : editingPolicyId ? "승인정책 수정" : "승인정책 생성"}
            </button>
          </div>
        </form>
        {policyMessage && <div className="inline-error">{policyMessage}</div>}
      </section>
    </section>
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

function buildTaskBreadcrumb(task: TaskView, referenceableTasks: TaskView[]) {
  const map = new Map(referenceableTasks.map((row) => [row.id, row]));
  const trail: TaskView[] = [];
  let cursor: TaskView | undefined = task;
  while (cursor) {
    trail.unshift(cursor);
    cursor = cursor.parentId ? map.get(cursor.parentId) : undefined;
  }
  return trail;
}

function DecisionGraphView({ data }: { data: AppData }) {
  const tasks = data.tasks as TaskView[];
  const [focusId, setFocusId] = useState("ALL");
  const [density, setDensity] = useState<"COMPACT" | "BALANCED" | "DETAIL">("BALANCED");
  const [layers, setLayers] = useState<Set<GraphLayer>>(() => new Set(["context", "decision", "refs"]));
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null);

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
  const densityPreset = density === "COMPACT"
    ? { stepX: 190, stepY: 64, nodeW: 164, nodeH: 46 }
    : density === "DETAIL"
      ? { stepX: 280, stepY: 96, nodeW: 220, nodeH: 68 }
      : { stepX: 240, stepY: 84, nodeW: 196, nodeH: 60 };
  const positions = new Map(
    graphTasks.map((task, index) => [
      task.id,
      { x: 72 + depthOf(task) * densityPreset.stepX, y: 56 + index * densityPreset.stepY, width: densityPreset.nodeW, height: densityPreset.nodeH }
    ])
  );
  const width = Math.max(1080, Math.max(...graphTasks.map((task) => (positions.get(task.id)?.x ?? 0) + 320), 960));
  const height = Math.max(520, graphTasks.length * densityPreset.stepY + 112);
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
  const edgeRenderLimit = density === "COMPACT" ? 160 : density === "DETAIL" ? 540 : 320;
  const cappedHierarchy = graphTasks.filter((task) => task.parentId && visibleTaskIds.has(task.parentId)).slice(0, edgeRenderLimit);
  const cappedRefEdges = refEdges.slice(0, edgeRenderLimit);
  const cappedDecisionRefEdges = decisionRefEdges.slice(0, edgeRenderLimit);
  const hasCappedEdges = graphTasks.length > edgeRenderLimit || refEdges.length > edgeRenderLimit || decisionRefEdges.length > edgeRenderLimit;
  const selectedTask = focusId === "ALL" ? null : taskMap.get(focusId);
  const resetViewport = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };
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
        action={<button className="button secondary" onClick={() => go("/tasks")}>목록 보기</button>}
      />
      <TaskViewTabs value="graph" tasks={tasks} />
      <div className="toolbar graph-toolbar">
        <Select label="Focus" tone="filter" value={focusId} onChange={setFocusId} options={[["ALL", "전체 그래프"], ...orderedTasks.map((task) => [task.id, task.title] as [string, string])]} />
        <Select label="해상도" tone="filter" value={density} onChange={(value) => setDensity(value as typeof density)} options={[["COMPACT", "컴팩트"], ["BALANCED", "밸런스"], ["DETAIL", "디테일"]]} />
        <button className={`button ${layers.has("context") ? "primary" : "secondary"}`} onClick={() => toggleLayer("context")}>맥락</button>
        <button className={`button ${layers.has("decision") ? "primary" : "secondary"}`} onClick={() => toggleLayer("decision")}>결정</button>
        <button className={`button ${layers.has("refs") ? "primary" : "secondary"}`} onClick={() => toggleLayer("refs")}>#참조</button>
        <button className="button secondary" onClick={() => setFocusId("ALL")}>포커스 해제</button>
        <div className="graph-view-controls">
          <button className="button secondary" onClick={() => setZoom((prev) => Math.max(0.65, Number((prev - 0.1).toFixed(2))))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="button secondary" onClick={() => setZoom((prev) => Math.min(1.8, Number((prev + 0.1).toFixed(2))))}>＋</button>
          <button className="button secondary" onClick={resetViewport}>리셋</button>
        </div>
      </div>
      {hasCappedEdges && <div className="inline-error">대규모 그래프 보호를 위해 엣지 일부를 생략해 렌더링 중입니다. 해상도를 낮추거나 Focus를 좁히세요.</div>}
      <div className="graph-metrics">
        <article className="metric-card"><small>노드</small><strong>{graphTasks.length}</strong></article>
        <article className="metric-card"><small>노트</small><strong>{data.notes.filter((note) => visibleTaskIds.has(note.taskId)).length}</strong></article>
        <article className="metric-card"><small>스레드 참조</small><strong>{refEdges.length}</strong></article>
        <article className="metric-card"><small>결정 참조</small><strong>{decisionRefEdges.length}</strong></article>
      </div>
      <div className="decision-graph-layout">
        <section className="graph-board" aria-label="결정 그래프 시각화">
          <div
            className={`graph-canvas ${panning ? "panning" : ""}`}
            onWheel={(event) => {
              event.preventDefault();
              setZoom((prev) => {
                const next = event.deltaY > 0 ? prev - 0.08 : prev + 0.08;
                return Math.max(0.65, Math.min(1.8, Number(next.toFixed(2))));
              });
            }}
            onMouseDown={(event) => {
              if (event.button !== 0) return;
              setPanning(true);
              setPanStart({ x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y });
            }}
            onMouseMove={(event) => {
              if (!panning || !panStart) return;
              setOffset({
                x: panStart.ox + (event.clientX - panStart.x),
                y: panStart.oy + (event.clientY - panStart.y)
              });
            }}
            onMouseUp={() => {
              setPanning(false);
              setPanStart(null);
            }}
            onMouseLeave={() => {
              setPanning(false);
              setPanStart(null);
            }}
          >
          <svg viewBox={`0 0 ${width} ${height}`} role="img">
            <defs>
              <marker id="arrow-solid" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
              <marker id="arrow-ref" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
            {cappedHierarchy.map((task) => {
              if (!task.parentId || !visibleTaskIds.has(task.parentId)) return null;
              const from = positions.get(task.parentId);
              const to = positions.get(task.id);
              if (!from || !to) return null;
              return <path key={`${task.parentId}-${task.id}`} className="graph-edge hierarchy" d={`M ${from.x + from.width} ${from.y + from.height / 2} C ${from.x + from.width + 44} ${from.y + from.height / 2}, ${to.x - 44} ${to.y + to.height / 2}, ${to.x} ${to.y + to.height / 2}`} markerEnd="url(#arrow-solid)" />;
            })}
            {layers.has("refs") && cappedRefEdges.map((edge, index) => {
              const from = positions.get(edge.sourceTaskId);
              const to = positions.get(edge.targetTaskId);
              if (!from || !to) return null;
              const sameTask = edge.sourceTaskId === edge.targetTaskId;
              const yOffset = sameTask ? 32 + index * 2 : 0;
              return <path key={`${edge.sourceTaskId}-${edge.noteId}-${index}`} className="graph-edge ref" d={`M ${from.x + from.width / 2} ${from.y + from.height + 4} C ${from.x + 40} ${from.y + 88 + yOffset}, ${to.x + to.width - 40} ${to.y - 36 - yOffset}, ${to.x + to.width / 2} ${to.y - 4}`} markerEnd="url(#arrow-ref)" />;
            })}
            {layers.has("decision") && cappedDecisionRefEdges.map((edge, index) => {
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
                <g
                  key={task.id}
                  className={`graph-node graph-node-${(task.templateType ?? "task").toLowerCase()} ${task.structureState === "FREEFORM" ? "graph-node-freeform" : ""} ${task.id === focusId ? "focused" : ""}`}
                  onClick={() => setFocusId(task.id)}
                  onDoubleClick={() => go(`/tasks/${task.id}`)}
                  tabIndex={0}
                  role="button"
                >
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
            </g>
          </svg>
          </div>
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

function TaskWorkspace({ taskId, me, templates, onReload }: { taskId: string; me: Member; templates: Template[]; onReload: () => Promise<void> }) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [decision, setDecision] = useState<{ toState: TaskState; decisionType: DecisionType; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState({ title: "" });
  const [autoSaving, setAutoSaving] = useState(false);
  const loadedTaskId = useRef<string | null>(null);

  const load = async () => {
    try {
      setDetail(await request<TaskDetail>(`/api/tasks/${taskId}`));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("TASK_NOT_FOUND")) {
        go("/tasks");
        return;
      }
      throw err;
    }
  };

  useEffect(() => {
    void load().catch((err) => {
      setActionError(
        err instanceof Error
          ? err.message
          : formatFailure("태스크 조회 실패", "대상 정보를 불러오지 못했습니다", "잠시 후 다시 시도하세요")
      );
    });
  }, [taskId]);

  useEffect(() => {
    if (!detail) return;
    setTaskDraft({ title: detail.task.title });
    loadedTaskId.current = detail.task.id;
  }, [detail?.task.id, detail?.task.title]);

  const task = detail?.task;

  const saveTask = async (nextDraft = taskDraft, quiet = false) => {
    if (!nextDraft.title.trim() || !detail || !task) return;
    if (nextDraft.title === detail.task.title) return;
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
    if (taskDraft.title === detail.task.title) return;
    void saveTask(taskDraft, true);
  }, [taskDraft.title, detail?.task.id], 1100);

  if (!detail || !task) return <Centered><div className="loader" /></Centered>;

	  const { parent, notes, attachments = [], referenceableNotes = notes, referenceableTasks = [task], comments, timeline, members, children, permissions } = detail;
  const canEditTask = permissions?.canEditTask ?? ["ADMIN", "EDITOR", "APPROVER"].includes(me.role);
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
      <div className="decision-layout">
        <div className="main-column">
          <div className="task-heading">
            <div className="task-heading-top">
              <nav className="task-breadcrumb" aria-label="태스크 경로">
                {buildTaskBreadcrumb(task, referenceableTasks).map((node, index, rows) => (
                  <span key={node.id}>
                    <button className={`breadcrumb-link ${node.id === task.id ? "current" : ""}`} onClick={() => go(`/tasks/${node.id}`)}>
                      {node.title}
                    </button>
                    {index < rows.length - 1 && <i>›</i>}
                  </span>
                ))}
              </nav>
              <div className="task-heading-top-actions">
                <button className="back-link" onClick={() => go("/tasks")}>목록으로</button>
                <button
                  className="text-button danger-text tiny-delete"
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
            <div className="task-title-row">
              <input
                className="task-title-input"
                value={taskDraft.title}
                maxLength={120}
                onChange={(event) => setTaskDraft((prev) => ({ ...prev, title: event.target.value }))}
                onBlur={() => void saveTask(taskDraft, true)}
                aria-label="태스크 제목"
              />
              <div className="task-heading-actions">
                {autoSaving && <span className="save-indicator">자동저장 중</span>}
                {actionError && <button className="button secondary task-head-button" onClick={() => setTaskDraft({ title: task.title })}>되돌리기</button>}
              </div>
            </div>
            <SystemFieldsPanel
              task={task}
              members={members}
              templates={templates}
              referenceableTasks={referenceableTasks}
              canEditTask={canEditTask}
              canApprove={canApprove}
              childrenCount={children.length}
              notes={notes}
              comments={comments}
              onOpenDecision={setDecision}
              onReload={load}
            />
          </div>
          {changed && parent && (
            <div className="change-banner">
              <strong>{parent.title}</strong>
              <span>상위 결정 대상이 마지막 방문 이후 업데이트되었습니다.</span>
              <button className="button secondary" onClick={() => go(`/tasks/${parent.id}`)}>확인</button>
            </div>
          )}
          <FormOutput task={task} canEditForm={canEditForm} onReload={load} />
          <AttachmentsSection taskId={task.id} attachments={attachments} canEdit={canEditTask} onReload={load} />
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
  templates,
  referenceableTasks,
  canEditTask,
  canApprove,
  childrenCount,
  notes,
  comments,
  onOpenDecision,
  onReload
}: {
  task: TaskView;
  members: Member[];
  templates: Template[];
  referenceableTasks: TaskView[];
  canEditTask: boolean;
  canApprove: boolean;
  childrenCount: number;
  notes: Note[];
  comments: ThreadComment[];
  onOpenDecision: (action: { toState: TaskState; decisionType: DecisionType; title: string }) => void;
  onReload: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [templateSaveName, setTemplateSaveName] = useState("");
  const [templateSaveBusy, setTemplateSaveBusy] = useState(false);
  const [systemCollapsed, setSystemCollapsed] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [templateSaveModalOpen, setTemplateSaveModalOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [decisionState, setDecisionState] = useState<TaskState>(task.currentState);
  const [nextActionOpen, setNextActionOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [fixedFieldsOpen, setFixedFieldsOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement | null>(null);
  const nextActionRef = useRef<HTMLDivElement | null>(null);
  const typeRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  const patchTask = async (
    label: string,
    patch: Partial<Pick<TaskView, "priority" | "dueDate" | "assigneeIds" | "watcherIds" | "parentId" | "templateId" | "templateType" | "tags">>
  ) => {
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
  const updateMemberAccess = async (memberId: string, access: TaskAccessLevel) => {
    const nextAssignees = task.assigneeIds.filter((id) => id !== memberId);
    const nextWatchers = task.watcherIds.filter((id) => id !== memberId);
    if (access === "ASSIGNEE") nextAssignees.push(memberId);
    if (access === "WATCHER") nextWatchers.push(memberId);
    await patchTask("access", { assigneeIds: nextAssignees, watcherIds: nextWatchers });
  };
  const saveAsTemplate = async () => {
    const nextName = templateSaveName.trim() || `${task.title} 템플릿`;
    const fields: Array<{ key: string; label: string; type: FormFieldType; required: boolean }> = Object.entries(task.formValues ?? {})
      .filter(([key]) => key !== TASK_DESCRIPTION_FIELD_KEY && key !== TASK_FILES_FIELD_KEY)
      .map(([key]) => ({
        key,
        label: key.replace(/[_-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
        type: "TEXT",
        required: false
      }));
    fields.unshift({ key: TASK_FILES_FIELD_KEY, label: "파일 업로드", type: "FILE", required: false });
    try {
      setTemplateSaveBusy(true);
      setError(null);
      const created = await request<Template>("/api/templates", {
        method: "POST",
        body: JSON.stringify({
          name: nextName,
          type: task.templateType ?? "TASK",
          enabled: true,
          formDefinition: fields,
          inspectionCriteria: []
        })
      });
      await patchTask("template", { templateId: created.id });
      setTemplateSaveName("");
      setTemplateSaveModalOpen(false);
      setMoreMenuOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "템플릿 저장에 실패했습니다.");
    } finally {
      setTemplateSaveBusy(false);
    }
  };
  const addTag = async () => {
    const value = tagInput.trim();
    if (!value) return;
    if (task.tags.includes(value)) {
      setTagInput("");
      return;
    }
    await patchTask("tags", { tags: [...task.tags, value] });
    setTagInput("");
  };
  const removeTag = async (value: string) => {
    await patchTask("tags", { tags: task.tags.filter((tag) => tag !== value) });
  };
  const groupedMembers = useMemo(() => {
    const filtered = members.filter((member) => {
      const q = memberQuery.trim().toLowerCase();
      if (!q) return true;
      return `${member.name} ${member.email} ${member.unit}`.toLowerCase().includes(q);
    });
    const groups = new Map<string, Member[]>();
    filtered.forEach((member) => {
      const rows = groups.get(member.unit) ?? [];
      rows.push(member);
      groups.set(member.unit, rows);
    });
    return [...groups.entries()];
  }, [memberQuery, members]);
  const assigneePreview = useMemo(() => {
    const names = task.assigneeIds
      .map((id) => members.find((member) => member.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    if (!names.length) return "담당 미지정";
    if (names.length === 1) return names[0];
    return `${names[0]} +${names.length - 1}`;
  }, [members, task.assigneeIds]);
  const nextActions = decisionActions(decisionState, canApprove);
  const transitionGateTargets = useMemo(() => {
    const transitions = task.template?.workflowSchema?.transitions ?? [];
    const fromStatusId = LEGACY_STATE_TO_STATUS_ID[decisionState];
    const targets = new Map<string, { hasPolicy: boolean }>();
    transitions.forEach((row) => {
      const gate = row.onExit?.approvalGate;
      if (row.fromStatusId !== fromStatusId || !gate?.enabled) return;
      targets.set(row.toStatusId, { hasPolicy: Boolean(gate.policyId) });
    });
    return targets;
  }, [decisionState, task.template?.workflowSchema?.transitions]);

  useEffect(() => {
    setDecisionState(task.currentState);
  }, [task.currentState, task.id]);

  useEffect(() => {
    if (!shareOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!shareRef.current?.contains(event.target as Node)) setShareOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [shareOpen]);
  useEffect(() => {
    if (!nextActionOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!nextActionRef.current?.contains(event.target as Node)) setNextActionOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [nextActionOpen]);
  useEffect(() => {
    if (!typeOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!typeRef.current?.contains(event.target as Node)) setTypeOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [typeOpen]);
  useEffect(() => {
    if (!moreMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) setMoreMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [moreMenuOpen]);

  return (
    <section className="task-system-grid">
      <div className="task-system-head">
        <div className="task-system-head-inline">
          <PanelTitle title="시스템" />
          <button
            type="button"
            className="system-collapse-toggle"
            aria-label={systemCollapsed ? "시스템 필드 펼치기" : "시스템 필드 접기"}
            onClick={() => setSystemCollapsed((prev) => !prev)}
          >
            <i className={systemCollapsed ? "collapsed" : ""}>▾</i>
          </button>
        </div>
        {saving && <span className="save-indicator">저장 중</span>}
      </div>
      {error && <p className="form-error">{error}</p>}
      {systemCollapsed ? null : (
        <>
      <Meta label="상위 항목">
        <Select
          tone="inline"
          value={task.parentId ?? ""}
          onChange={(value) => void patchTask("parent", { parentId: value || null })}
          options={[["", "루트"], ...referenceableTasks.filter((row) => row.id !== task.id).map((row) => [row.id, row.title] as [string, string])]}
          disabled={!canEditTask}
        />
      </Meta>
      <Meta label="템플릿">
        <div className="template-inline-tools">
          <Select
            tone="inline"
            value={task.templateId ?? ""}
            onChange={(value) => void patchTask("template", { templateId: value || null })}
            options={[["", "자유폼 유지"], ...templates.filter((template) => template.enabled || template.id === task.templateId).map((template) => [template.id, template.name] as [string, string])]}
            disabled={!canEditTask}
          />
        </div>
      </Meta>
      <Meta label="태그">
        <div className="task-tag-editor">
          <div className="task-tag-list">
            {task.tags.map((tag) => (
              <button key={tag} type="button" className="task-tag-chip" onClick={() => void removeTag(tag)} disabled={!canEditTask}>
                {tag} ×
              </button>
            ))}
          </div>
          <div className="template-save-row">
            <input
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addTag();
                }
              }}
              placeholder="태그 입력 후 Enter"
              disabled={!canEditTask}
            />
            <button type="button" className="button secondary" onClick={() => void addTag()} disabled={!canEditTask || !tagInput.trim()}>
              태그 추가
            </button>
          </div>
        </div>
      </Meta>
      <Meta label="타입">
        <div className="next-action-wrap" ref={typeRef}>
          <button
            className="state-action-trigger"
            disabled={!canEditTask}
            title={canEditTask ? "타입 선택" : "타입 수정 권한이 없습니다."}
            onClick={() => setTypeOpen((prev) => !prev)}
          >
            <Badge tone={templateTone(task.templateType)}>{templateLabel(task.templateType)}</Badge>
            <i>{typeOpen ? "▴" : "▾"}</i>
          </button>
          {typeOpen && (
            <div className="next-action-menu">
              {templateTypes
                .filter((value): value is TemplateType => value !== "ALL")
                .map((value) => (
                  <button
                    key={value}
                    className={`next-action-item ${task.templateType === value ? "active" : ""}`}
                    onClick={() => {
                      void patchTask("templateType", { templateType: value });
                      setTypeOpen(false);
                    }}
                  >
                    <strong><Badge tone={TEMPLATE_META[value].tone}>{TEMPLATE_META[value].label}</Badge></strong>
                  </button>
                ))}
            </div>
          )}
        </div>
      </Meta>
      <Meta label="담당자/공유">
        <div className="member-share-block" ref={shareRef}>
          <button
            type="button"
            className="member-share-trigger"
            onClick={() => setShareOpen((prev) => !prev)}
            aria-haspopup="dialog"
            aria-expanded={shareOpen}
          >
            <span className="member-share-trigger-value">{assigneePreview}</span>
            <i>{shareOpen ? "▴" : "▾"}</i>
          </button>
          {shareOpen && (
            <div className="member-share-popover">
              <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="이름, 이메일, 조직 검색" />
              <div className="member-share-list">
                {groupedMembers.map(([unit, rows]) => (
                  <div key={unit} className="member-share-group">
                    <strong>{unit}</strong>
                    {rows.map((member) => (
                      <div key={member.id} className="member-share-row">
                        <div>
                          <b>{member.name}</b>
                          <small>{member.email}</small>
                        </div>
                        <Select
                          tone="inline"
                          value={taskAccessOf(task, member.id)}
                          onChange={(value) => void updateMemberAccess(member.id, value as TaskAccessLevel)}
                          options={[
                            ["VIEW", "보기"],
                            ["WATCHER", "참관"],
                            ["ASSIGNEE", "담당"]
                          ]}
                        />
                      </div>
                    ))}
                  </div>
                ))}
                {!groupedMembers.length && <p className="muted">검색 결과가 없습니다.</p>}
              </div>
            </div>
          )}
        </div>
      </Meta>
      <Meta label="기한">
        <input
          type="date"
          value={task.dueDate?.slice(0, 10) ?? ""}
          onChange={(event) => void patchTask("dueDate", { dueDate: event.target.value || null })}
        />
      </Meta>
      <Meta label="우선순위">
        <Select
          tone="inline"
          value={task.priority}
          onChange={(priority) => void patchTask("priority", { priority: priority as TaskView["priority"] })}
          options={["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => [value, priorityLabel[value as TaskView["priority"]]])}
        />
      </Meta>
      <Meta label="상태">
        <div className="next-action-wrap" ref={nextActionRef}>
          <button
            className="state-action-trigger"
            title="상태 및 다음 액션"
            onClick={() => setNextActionOpen((prev) => !prev)}
          >
            <Badge tone={STATE_META[decisionState].tone}>{STATE_META[decisionState].label}</Badge>
            <i>{nextActionOpen ? "▴" : "▾"}</i>
          </button>
          {nextActionOpen && (
            <div className="next-action-menu">
              <div className="next-action-head">상태</div>
              {(["DRAFT", "IN_PROGRESS", "DONE", "CANCELED"] as TaskState[]).map((state) => (
                <button
                  key={state}
                  className={`next-action-item ${decisionState === state ? "active" : ""}`}
                  onClick={() => setDecisionState(state)}
                >
                  <strong>{STATE_META[state].label}</strong>
                  {transitionGateTargets.has(LEGACY_STATE_TO_STATUS_ID[state]) && (
                    <small>{transitionGateTargets.get(LEGACY_STATE_TO_STATUS_ID[state])?.hasPolicy ? "승인게이트 · 정책연결" : "승인게이트 · 정책미지정"}</small>
                  )}
                </button>
              ))}
              <div className="next-action-head">넥스트 액션</div>
              {nextActions.length === 0 && <p className="muted">선택한 상태에서 가능한 액션이 없습니다.</p>}
              {nextActions.map((action) => (
                <button
                  key={`${action.toState}-${action.title}`}
                  className={`next-action-item tone-${action.tone}`}
                  onClick={() => {
                    onOpenDecision(action);
                    setNextActionOpen(false);
                  }}
                >
                  <strong>{action.title}</strong>
                  <small>
                    {STATE_META[action.toState].label}로 전환
                    {transitionGateTargets.has(LEGACY_STATE_TO_STATUS_ID[action.toState])
                      ? ` · ${transitionGateTargets.get(LEGACY_STATE_TO_STATUS_ID[action.toState])?.hasPolicy ? "승인게이트(정책연결)" : "승인게이트(정책미지정)"}`
                      : ""}
                  </small>
                </button>
              ))}
            </div>
          )}
        </div>
      </Meta>
      <div className="task-system-more" ref={moreMenuRef}>
        <button type="button" className="button secondary more-icon-btn" onClick={() => setMoreMenuOpen((prev) => !prev)} aria-label="더보기">
          ⋯
        </button>
        {moreMenuOpen && (
          <div className="next-action-menu">
            <button className="next-action-item" onClick={() => { setTemplateSaveModalOpen(true); setMoreMenuOpen(false); }}>
              <strong>현재 폼을 템플릿으로 저장</strong>
            </button>
            <button className="next-action-item" onClick={() => { setFixedFieldsOpen((prev) => !prev); setMoreMenuOpen(false); }}>
              <strong>{fixedFieldsOpen ? "고정 필드 접기" : "고정 필드 더보기"}</strong>
            </button>
          </div>
        )}
      </div>
      {fixedFieldsOpen && (
        <>
          <Meta label="구조">
            <div className="badge-field-readonly">
              <Badge tone={STRUCTURE_META[task.structureState].tone}>{STRUCTURE_META[task.structureState].label}</Badge>
            </div>
          </Meta>
          <Meta label="소유자">{task.owner.name}</Meta>
          <Meta label="하위 항목">{childrenCount}</Meta>
          <Meta label="노트">{notes.length}</Meta>
          <Meta label="스레드">{comments.length}</Meta>
          <Meta label="파일">{notes.flatMap((note) => note.attachments).length}</Meta>
        </>
      )}
      {templateSaveModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <div>
                <div className="eyebrow">Template</div>
                <h2>새 템플릿 생성</h2>
              </div>
            </div>
            <div className="template-save-row">
              <input
                autoFocus
                value={templateSaveName}
                onChange={(event) => setTemplateSaveName(event.target.value)}
                placeholder="재사용할 템플릿 이름 (비우면 태스크 제목 사용)"
                disabled={templateSaveBusy}
              />
            </div>
            <div className="row-actions">
              <button className="button secondary" onClick={() => setTemplateSaveModalOpen(false)} disabled={templateSaveBusy}>취소</button>
              <button className="button primary" onClick={() => void saveAsTemplate()} disabled={templateSaveBusy}>
                {templateSaveBusy ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </section>
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
  const [title, setTitle] = useState("");
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
    const mergedContent = title.trim() ? `${title.trim()}\n${content.trim()}` : content.trim();
    try {
      setBusy(true);
      setError(null);
      await request(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: mergedContent, referencedNoteIds: [...refs], mentions })
      });
      setTitle("");
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
      {error && <p className="form-error">{error}</p>}
      <div className="comment-list">
        {comments.map((comment, index) => {
          const currentDate = new Date(comment.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
          const prev = comments[index - 1];
          const prevDate = prev ? new Date(prev.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" }) : null;
          const showDateDivider = index === 0 || currentDate !== prevDate;
          const canManage = comment.authorId === me.id || me.role === "ADMIN";
          return (
            <div key={comment.id}>
              {showDateDivider && <div className="thread-day-divider"><span>{currentDate}</span></div>}
              <div className="comment">
                <div className="comment-meta">
                  <strong>
                    <span className="comment-author-badge">{memberName(members, comment.authorId).slice(0, 1)}</span>
                    {memberName(members, comment.authorId)}
                  </strong>
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
            </div>
          );
        })}
      </div>
      <div className="composer">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="제목 (선택, 최대 200자)"
          maxLength={200}
        />
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
  const entries = [
    [TASK_DESCRIPTION_FIELD_KEY, task.description ?? ""] as [string, string],
    [TASK_FILES_FIELD_KEY, task.formValues[TASK_FILES_FIELD_KEY] ?? ""] as [string, string],
    ...(fields.length ? fields.map((field) => [field.key, task.formValues[field.key] ?? ""] as [string, string]) : Object.entries(task.formValues).filter(([key]) => key !== TASK_FILES_FIELD_KEY))
  ];
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => entries.length ? entries : [["", ""]]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextEntries = [
      [TASK_DESCRIPTION_FIELD_KEY, task.description ?? ""] as [string, string],
      [TASK_FILES_FIELD_KEY, task.formValues[TASK_FILES_FIELD_KEY] ?? ""] as [string, string],
      ...(fields.length ? fields.map((field) => [field.key, task.formValues[field.key] ?? ""] as [string, string]) : Object.entries(task.formValues).filter(([key]) => key !== TASK_FILES_FIELD_KEY))
    ];
    setRows(nextEntries.length ? nextEntries : [["", ""]]);
  }, [task.description, task.formValues, task.templateId]);

  const save = async () => {
    if (!canEditForm) {
      setError("양식 수정 권한이 없습니다. 소유자, 담당자 또는 관리자에게 권한을 요청하세요.");
      return;
    }
    const descriptionValue = rows.find(([key]) => key === TASK_DESCRIPTION_FIELD_KEY)?.[1] ?? "";
    const next = Object.fromEntries(
      rows
        .filter(([key]) => key !== TASK_DESCRIPTION_FIELD_KEY && key.trim())
        .map(([key, value]) => [key.trim(), value.trim()])
    );
    try {
      setError(null);
      await request(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ formValues: next, description: descriptionValue.trim() }) });
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
                placeholder={key === TASK_DESCRIPTION_FIELD_KEY ? "태스크 설명" : key === TASK_FILES_FIELD_KEY ? "파일 업로드" : field?.label ?? "필드"}
                maxLength={80}
                readOnly={Boolean(field) || key === TASK_DESCRIPTION_FIELD_KEY || key === TASK_FILES_FIELD_KEY}
                onChange={(event) => setRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? [event.target.value, row[1]] : row))}
              />
              {field?.type === "FILE" || key === TASK_FILES_FIELD_KEY ? (
                <input
                  type="file"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []).map((file) => file.name);
                    if (!files.length) return;
                    setRows((prev) => prev.map((row, rowIndex) => {
                      if (rowIndex !== index) return row;
                      const existing = row[1]
                        .split(",")
                        .map((part) => part.trim())
                        .filter(Boolean);
                      const next = [...new Set([...existing, ...files])];
                      return [row[0], next.join(", ")];
                    }));
                  }}
                />
              ) : field?.type === "LONG_TEXT" || key === TASK_DESCRIPTION_FIELD_KEY ? (
                <textarea
                  value={value}
                  placeholder={key === TASK_DESCRIPTION_FIELD_KEY ? "핵심 맥락과 배경을 구조적으로 작성하세요" : field?.helpText ?? "값"}
                  maxLength={key === TASK_DESCRIPTION_FIELD_KEY ? 1200 : 1000}
                  rows={key === TASK_DESCRIPTION_FIELD_KEY ? 8 : 3}
                  className={key === TASK_DESCRIPTION_FIELD_KEY ? "rich-text-field" : undefined}
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
              {!field && key !== TASK_DESCRIPTION_FIELD_KEY && key !== TASK_FILES_FIELD_KEY && <button className="button secondary" onClick={() => setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}>삭제</button>}
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
              <small>{key === TASK_DESCRIPTION_FIELD_KEY ? "태스크 설명" : key === TASK_FILES_FIELD_KEY ? "파일 업로드" : fields.find((field) => field.key === key)?.label ?? key}</small>
              <strong className={key === TASK_DESCRIPTION_FIELD_KEY ? "rich-text-preview" : undefined}>
                {key === TASK_FILES_FIELD_KEY ? (value ? value.split(",").map((row) => row.trim()).filter(Boolean).join(" · ") : "파일 없음") : value}
              </strong>
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

function AttachmentsSection({
  taskId,
  attachments,
  canEdit,
  onReload
}: {
  taskId: string;
  attachments: TaskAttachment[];
  canEdit: boolean;
  onReload: () => Promise<void>;
}) {
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      setBusy(true);
      setError(null);
      for (const file of Array.from(files)) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("파일 읽기에 실패했습니다."));
          reader.readAsDataURL(file);
        });
        await request(`/api/tasks/${taskId}/attachments/file`, {
          method: "POST",
          body: JSON.stringify({
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            contentDataUrl: dataUrl
          })
        });
      }
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일 업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const addLink = async () => {
    if (!linkUrl.trim() || !linkName.trim()) return;
    try {
      setBusy(true);
      setError(null);
      await request(`/api/tasks/${taskId}/attachments/link`, {
        method: "POST",
        body: JSON.stringify({ name: linkName.trim(), url: linkUrl.trim() })
      });
      setLinkName("");
      setLinkUrl("");
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "링크 첨부에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const removeAttachment = async (attachmentId: string) => {
    try {
      setBusy(true);
      setError(null);
      await request(`/api/tasks/${taskId}/attachments/${attachmentId}`, { method: "DELETE" });
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "첨부 삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <PanelHeader title={`Attachments ${attachments.length}`} />
      {canEdit && (
        <div className="attachments-tools">
          <label className="button secondary">
            파일 업로드
            <input
              type="file"
              multiple
              onChange={(event) => void uploadFiles(event.target.files)}
              disabled={busy}
              hidden
            />
          </label>
          <input value={linkName} onChange={(event) => setLinkName(event.target.value)} placeholder="링크 이름 (예: Git PR, SharePoint 문서)" />
          <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://..." />
          <button className="button secondary" onClick={() => void addLink()} disabled={busy || !linkName.trim() || !linkUrl.trim()}>
            링크 추가
          </button>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="attachments-grid">
        {attachments.map((attachment) => (
          <article key={attachment.id} className="attachment-card">
            <strong>{attachment.name}</strong>
            <small>{attachment.kind === "FILE" ? (attachment.mimeType ?? "file") : "link"} {attachment.size ? `· ${Math.max(1, Math.round(attachment.size / 1024))}KB` : ""}</small>
            <div className="row-actions left">
              {attachment.kind === "FILE" && attachment.contentDataUrl ? (
                <>
                  <a className="button secondary" href={attachment.contentDataUrl} target="_blank" rel="noreferrer">미리보기</a>
                  <a className="button secondary" href={attachment.contentDataUrl} download={attachment.name}>다운로드</a>
                </>
              ) : attachment.url ? (
                <a className="button secondary" href={attachment.url} target="_blank" rel="noreferrer">링크 열기</a>
              ) : null}
              {canEdit && <button className="button danger" onClick={() => void removeAttachment(attachment.id)} disabled={busy}>삭제</button>}
            </div>
          </article>
        ))}
        {!attachments.length && <p className="muted">첨부 파일/링크가 없습니다.</p>}
      </div>
    </section>
  );
}

function TimelinePanel({ timeline, notes, members }: { timeline: TimelineEvent[]; notes: Note[]; members: Member[] }) {
  const [openSessions, setOpenSessions] = useState<Set<string>>(() => {
    const value = window.localStorage.getItem("task-timeline-open-sessions");
    return value ? new Set(value.split(",").filter(Boolean)) : new Set();
  });
  const [logFilter, setLogFilter] = useState<"all" | "system" | "change" | "decision">("all");
  const classifyTimelineEvent = (type: string) => {
    if (["APPROVAL_REQUESTED", "APPROVAL_APPROVED", "APPROVAL_REJECTED", "COMPLETED", "CANCELED"].includes(type)) return "decision";
    if (["STATE_TRANSITION", "HIERARCHY_CHANGE", "NOTE_UPDATED", "COMMENT"].includes(type)) return "change";
    return "system";
  };
  const filteredTimeline = useMemo(
    () => (logFilter === "all" ? timeline : timeline.filter((event) => classifyTimelineEvent(event.type) === logFilter)),
    [logFilter, timeline]
  );
  const filterCount = useMemo(() => {
    const counts = { all: timeline.length, system: 0, change: 0, decision: 0 };
    timeline.forEach((event) => {
      const kind = classifyTimelineEvent(event.type);
      counts[kind] += 1;
    });
    return counts;
  }, [timeline]);
  const sessions = useMemo(() => {
    const rows: Array<{ id: string; representative: TimelineEvent; hidden: TimelineEvent[] }> = [];
    filteredTimeline.forEach((event) => {
      const minuteKey = new Date(event.createdAt).toISOString().slice(0, 16);
      const previous = rows[rows.length - 1];
      if (previous && new Date(previous.representative.createdAt).toISOString().slice(0, 16) === minuteKey && previous.representative.actorId === event.actorId) {
        previous.hidden.push(event);
      } else {
        rows.push({ id: `${event.actorId}-${minuteKey}`, representative: event, hidden: [] });
      }
    });
    return rows;
  }, [filteredTimeline]);
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
      <div className="timeline-filter-chips">
        <button className={`signal-chip ${logFilter === "all" ? "active" : ""}`} onClick={() => setLogFilter("all")}>전체 {filterCount.all}</button>
        <button className={`signal-chip ${logFilter === "system" ? "active" : ""}`} onClick={() => setLogFilter("system")}>시스템 {filterCount.system}</button>
        <button className={`signal-chip ${logFilter === "change" ? "active" : ""}`} onClick={() => setLogFilter("change")}>변경 {filterCount.change}</button>
        <button className={`signal-chip ${logFilter === "decision" ? "active" : ""}`} onClick={() => setLogFilter("decision")}>결정 {filterCount.decision}</button>
      </div>
      <div className="timeline">
        {!sessions.length && <p className="muted">선택한 타입의 로그가 없습니다.</p>}
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
  const meId = data.me.id;
  const items = data.inbox.filter((item) => item.componentType === tab && item.userId === meId);
  const sentItems = data.inbox
    .filter((item) => item.sourceUserId === meId && item.userId !== meId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const taskMap = new Map(data.tasks.map((task) => [task.id, task]));
  const slaHours = data.notificationSettings[0]?.slaHours ?? 24;

  const markRead = async (id: string) => {
    await request(`/api/inbox/${id}/read`, { method: "PATCH" });
    await onReload();
  };
  const remind = async (id: string) => {
    await request(`/api/inbox/${id}/remind`, { method: "POST" });
    await onReload();
  };
  const markAllRead = async (componentType?: InboxComponent) => {
    await request("/api/inbox/read-all", { method: "PATCH", body: JSON.stringify(componentType ? { componentType } : {}) });
    await onReload();
  };
  const sentSummary = useMemo(() => {
    const total = sentItems.length;
    const read = sentItems.filter((item) => Boolean(item.readAt)).length;
    const overdue = sentItems.filter((item) => {
      if (item.readAt) return false;
      const ageHours = (Date.now() - new Date(item.createdAt).getTime()) / 36e5;
      return ageHours >= slaHours;
    }).length;
    return { total, read, overdue };
  }, [sentItems, slaHours]);

  return (
    <section className="page-stack">
      <PageHeader eyebrow="알림함" title="알림 분류" />
      <Tabs value={tab} onChange={(v) => setTab(v as InboxComponent)} tabs={INBOX_COMPONENTS.map((item) => ({ value: item.value, label: item.label, count: data.inbox.filter((row) => row.userId === meId && row.componentType === item.value && !row.readAt).length }))} />
      <div className="row-actions left">
        <button className="button secondary" onClick={() => void markAllRead(tab)}>현재 탭 모두 읽음</button>
        <button className="button secondary" onClick={() => void markAllRead()}>전체 모두 읽음</button>
      </div>
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
      <section className="panel">
        <PanelHeader title="내가 보낸 요청/알림 추적" />
        <p className="muted">수신자 열람 {sentSummary.read} / 수신자 미열람 {Math.max(0, sentSummary.total - sentSummary.read)} / SLA 초과 {sentSummary.overdue} / 전체 {sentSummary.total}</p>
        <div className="list-panel">
          {sentItems.slice(0, 30).map((item) => (
            <div className={`inbox-row ${item.readAt ? "" : "unread"}`} key={`sent-${item.id}`}>
              <div>
                <Badge tone={item.readAt ? "green" : "amber"}>{item.readAt ? "수신자 열람" : "수신자 미열람"}</Badge>
                <h3>{item.title}</h3>
                <p>{item.message}</p>
                <small>
                  {taskMap.get(item.taskId)?.title} · 수신자 {data.members.find((m) => m.id === item.userId)?.name ?? item.userId}
                  {item.readAt ? ` · 열람 ${elapsed(item.readAt)}` : ""}
                  {!item.readAt && ((Date.now() - new Date(item.createdAt).getTime()) / 36e5 >= slaHours) ? " · SLA 지연" : ""}
                  {(item.remindCount ?? 0) > 0 ? ` · 리마인드 ${item.remindCount}회` : ""}
                </small>
              </div>
              <div className="row-actions">
                <button className="button secondary" onClick={() => go(`/tasks/${item.taskId}`)}>열기</button>
                <button className="button secondary" onClick={() => void remind(item.id)}>리마인드</button>
              </div>
            </div>
          ))}
          {sentItems.length === 0 && <p className="muted">보낸 요청/알림이 없습니다.</p>}
        </div>
      </section>
    </section>
  );
}

function NotificationSettingsView() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">("default");
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    void request<NotificationSettings>("/api/settings/notifications").then(setSettings);
    if (typeof window !== "undefined" && "Notification" in window) setPushPermission(Notification.permission);
    else setPushPermission("unsupported");
  }, []);

  const patch = (partial: Partial<NotificationSettings>) => {
    if (!settings) return;
    setSettings({ ...settings, ...partial });
    setSaved(null);
  };

  const toggleMuteComponent = (component: InboxComponent) => {
    if (!settings) return;
    const has = settings.mutedComponents.includes(component);
    patch({
      mutedComponents: has
        ? settings.mutedComponents.filter((row) => row !== component)
        : [...settings.mutedComponents, component]
    });
  };

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const next = await request<NotificationSettings>("/api/settings/notifications", {
        method: "PATCH",
        body: JSON.stringify({
          emailEnabled: settings.emailEnabled,
          pushEnabled: settings.pushEnabled,
          webPushEnabled: settings.webPushEnabled,
          digestEnabled: settings.digestEnabled,
          mutedComponents: settings.mutedComponents,
          mentionOnlyForWatchers: settings.mentionOnlyForWatchers,
          slaHours: settings.slaHours
        })
      });
      if (next.webPushEnabled) await syncBrowserPushSubscription();
      else await request("/api/push/subscriptions", { method: "DELETE", body: JSON.stringify({}) });
      setSettings(next);
      setSaved("저장되었습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (!settings) return <section className="panel"><p className="muted">불러오는 중...</p></section>;

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(base64);
    return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
  };

  const syncBrowserPushSubscription = async () => {
    setPushError(null);
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushError("이 브라우저는 웹 푸시를 지원하지 않습니다.");
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    setPushPermission(permission);
    if (permission !== "granted") {
      setPushError("브라우저 알림 권한이 필요합니다.");
      return;
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    const vapidPublicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      if (!vapidPublicKey) {
        setPushError("VITE_WEB_PUSH_PUBLIC_KEY 설정이 필요합니다.");
        return;
      }
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });
    }
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      setPushError("푸시 구독 정보가 올바르지 않습니다.");
      return;
    }
    await request("/api/push/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent
      })
    });
  };

  return (
    <section className="page-stack">
      <PageHeader eyebrow="설정" title="알림 설정" />
      <section className="panel">
        <PanelHeader title="수신 채널" action={<button className="button primary" onClick={() => void save()} disabled={busy}>저장</button>} />
        <div className="stack">
          <label className="toggle-field"><input type="checkbox" checked={settings.pushEnabled} onChange={(event) => patch({ pushEnabled: event.target.checked })} />앱 내 알림 받기</label>
          <div className="meta-row">
            <strong>웹 푸시(브라우저)</strong>
            <div className="row-actions left">
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={settings.webPushEnabled}
                  onChange={(event) => patch({ webPushEnabled: event.target.checked })}
                />
                브라우저 푸시 받기
              </label>
              <button
                type="button"
                className="button secondary"
                onClick={() => void syncBrowserPushSubscription()}
                disabled={pushPermission === "unsupported"}
              >
                {pushPermission === "granted" ? "브라우저 푸시 연결 갱신" : pushPermission === "denied" ? "브라우저 권한 차단됨" : pushPermission === "unsupported" ? "브라우저 미지원" : "브라우저 푸시 연결"}
              </button>
            </div>
          </div>
          {pushError && <p className="form-error">{pushError}</p>}
          <label className="toggle-field"><input type="checkbox" checked={settings.emailEnabled} onChange={(event) => patch({ emailEnabled: event.target.checked })} />이메일 알림 받기</label>
          <label className="toggle-field"><input type="checkbox" checked={settings.digestEnabled} onChange={(event) => patch({ digestEnabled: event.target.checked })} />일일 요약 받기</label>
          <label className="toggle-field"><input type="checkbox" checked={settings.mentionOnlyForWatchers} onChange={(event) => patch({ mentionOnlyForWatchers: event.target.checked })} />내가 관여한 태스크 멘션만 우선 수신</label>
          <label className="meta-row">
            <strong>SLA 응답 시간(시간)</strong>
            <input
              type="number"
              min={1}
              max={168}
              value={settings.slaHours}
              onChange={(event) => patch({ slaHours: Math.min(168, Math.max(1, Number(event.target.value) || 24)) })}
            />
          </label>
        </div>
      </section>
      <section className="panel">
        <PanelHeader title="뮤트할 알림 분류" />
        <div className="stack">
          {INBOX_COMPONENTS.map((component) => (
            <label key={component.value} className="toggle-field">
              <input
                type="checkbox"
                checked={!settings.mutedComponents.includes(component.value)}
                onChange={() => toggleMuteComponent(component.value)}
              />
              {component.label}
            </label>
          ))}
        </div>
        {saved && <p className="muted">{saved}</p>}
      </section>
    </section>
  );
}

function TasksView({ tasks, members, buckets, me, selectedUnitId, selectedListId, onReload }: { tasks: TaskView[]; members: Member[]; buckets: Bucket[]; me: Member; selectedUnitId: string; selectedListId: string; onReload: () => Promise<void> }) {
  const BACKLOG_WIP_LIMIT = 8;
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialViewMode = searchParams.get("view");
  const initialSortBy = searchParams.get("sort");
  const initialGroupBy = searchParams.get("group");
  const initialFilterState = searchParams.get("state");
  const initialFilterType = searchParams.get("type");
  const initialQuery = searchParams.get("q");
  const initialQuickFilter = searchParams.get("qf");
  const initialAdvancedFilter = searchParams.get("af");
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
    initialViewMode === "board" || initialViewMode === "backlog" || initialViewMode === "graph" ? initialViewMode : "list"
  );
  const [groupBy, setGroupBy] = useState<"none" | "state" | "assignee" | "bucket">(() =>
    initialGroupBy === "state" || initialGroupBy === "assignee" || initialGroupBy === "bucket" ? initialGroupBy : "none"
  );
  const [quickFilter, setQuickFilter] = useState<"all" | "mine" | "pending" | "due-today">(() =>
    initialQuickFilter === "mine" || initialQuickFilter === "pending" || initialQuickFilter === "due-today" ? initialQuickFilter : "all"
  );
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(() =>
    initialAdvancedFilter === "1" || Boolean(initialQuery || initialFilterState || initialFilterType || initialSortBy || initialGroupBy || initialQuickFilter)
  );
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<{ toState: TaskState; label: string } | null>(null);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);
  const [moveToast, setMoveToast] = useState<string | null>(null);
  const [bulkReport, setBulkReport] = useState<{
    actionLabel: string;
    total: number;
    succeeded: Array<{ id: string; title: string }>;
    failed: Array<{ id: string; title: string; reason: string }>;
  } | null>(null);
  const [newBucketName, setNewBucketName] = useState("");
  const [bucketBusy, setBucketBusy] = useState(false);
  const [draggingBucketTaskId, setDraggingBucketTaskId] = useState<string | null>(null);
  const [bucketEditingId, setBucketEditingId] = useState("");
  const [bucketEditName, setBucketEditName] = useState("");
  const [activeDropBucketId, setActiveDropBucketId] = useState<string | null>(null);
  const meId = me.id;

  useEffect(() => {
    if (!moveToast) return;
    const timer = window.setTimeout(() => setMoveToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [moveToast]);

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
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [advancedFilterOpen, filterState, filterType, groupBy, query, sortBy, viewMode]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const payload: Record<string, unknown> = { title, parentId, templateType };
    if (selectedUnitId) payload.unitId = selectedUnitId;
    if (selectedListId) payload.listId = selectedListId;
    const task = await request<TaskView>("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
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
      if (quickFilter === "pending") {
        const gateTargetIds = new Set(
          (task.template?.workflowSchema?.transitions ?? [])
            .filter((row) => row.onExit?.approvalGate?.enabled)
            .map((row) => row.toStatusId)
        );
        return Boolean(task.workflowStatusId && gateTargetIds.has(task.workflowStatusId));
      }
      return isDueToday(task.dueDate);
    })
    .sort((a, b) => {
      if (sortBy === "manual") return 0;
      if (sortBy === "due") return String(a.dueDate ?? "9999").localeCompare(String(b.dueDate ?? "9999"));
      if (sortBy === "priority") return ["URGENT", "HIGH", "MEDIUM", "LOW"].indexOf(a.priority) - ["URGENT", "HIGH", "MEDIUM", "LOW"].indexOf(b.priority);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  const dragDisabled = sortBy !== "manual" || groupBy !== "none";
  const backlogTasks = filteredTasks.filter((task) => isBacklogTask(task));

  const patchTask = async (taskId: string, patch: Partial<Pick<TaskView, "currentState" | "priority" | "parentId" | "workflowPhase" | "phaseOverride" | "workflowStatusId" | "bucketId" | "templateId">>) => {
    await request(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(patch) });
    await onReload();
  };
  const createBucket = async () => {
    if (!newBucketName.trim()) return;
    try {
      setBucketBusy(true);
      await request("/api/buckets", {
        method: "POST",
        body: JSON.stringify({
          name: newBucketName.trim(),
          unitId: selectedUnitId || null,
          listId: selectedListId || null
        })
      });
      setNewBucketName("");
      await onReload();
    } finally {
      setBucketBusy(false);
    }
  };
  const reorderBucket = async (bucketId: string, direction: -1 | 1) => {
    const ordered = [...buckets].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((row) => row.id === bucketId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
    const current = ordered[index];
    const target = ordered[nextIndex];
    await request(`/api/buckets/${current.id}`, { method: "PATCH", body: JSON.stringify({ order: target.order }) });
    await request(`/api/buckets/${target.id}`, { method: "PATCH", body: JSON.stringify({ order: current.order }) });
    await onReload();
  };
  const deleteBucket = async (bucketId: string) => {
    if (!window.confirm("버킷을 삭제할까요? 연결된 태스크는 버킷 없음으로 이동합니다.")) return;
    await request(`/api/buckets/${bucketId}`, { method: "DELETE" });
    await onReload();
  };
  const renameBucket = async (bucketId: string) => {
    if (!bucketEditName.trim()) return;
    await request(`/api/buckets/${bucketId}`, { method: "PATCH", body: JSON.stringify({ name: bucketEditName.trim() }) });
    setBucketEditingId("");
    setBucketEditName("");
    await onReload();
  };
  const moveTaskParent = async (taskId: string, nextParentId: string | null) => {
    const source = tasks.find((row) => row.id === taskId);
    const target = nextParentId ? tasks.find((row) => row.id === nextParentId) : null;
    await request(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ parentId: nextParentId }) });
    if (source) {
      setMoveToast(`${source.title}를 ${target ? target.title : "루트"} 하위로 이동`);
    }
    await onReload();
  };
  const toggleSelectTask = (taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };
  const selectAllIn = (rows: TaskView[]) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      rows.forEach((task) => next.add(task.id));
      return next;
    });
  };
  const clearSelected = () => setSelectedTaskIds(new Set());
  const bulkMove = async (toState: TaskState, label: string) => {
    const ids = [...selectedTaskIds];
    if (!ids.length) return;
    const selectedTasks = tasks.filter((task) => ids.includes(task.id));
    const selectedMap = new Map(selectedTasks.map((task) => [task.id, task]));
    const activeTasks = tasks.filter((task) => !isBacklogTask(task));
    const toSprintCount = toState === "IN_PROGRESS" ? selectedTasks.filter((task) => isBacklogTask(task)).length : 0;
    if (toState === "IN_PROGRESS" && activeTasks.length + toSprintCount > BACKLOG_WIP_LIMIT) {
      setBulkFeedback(formatFailure("스프린트 투입 실패", `WIP 제한 ${BACKLOG_WIP_LIMIT}개를 초과합니다`, "선택 항목 수를 줄이거나 기존 스프린트 태스크를 백로그로 이동한 뒤 다시 시도하세요"));
      return;
    }
    setBulkFeedback(null);
    const results = await Promise.allSettled(ids.map(async (id) => {
      await request(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ currentState: toState, workflowPhase: toState === "DRAFT" ? "BACKLOG" : "ACTIVE" }) });
      return id;
    }));
    const succeeded: Array<{ id: string; title: string }> = [];
    const failed: Array<{ id: string; title: string; reason: string }> = [];
    results.forEach((result, index) => {
      const id = ids[index];
      const title = selectedMap.get(id)?.title ?? id;
      if (result.status === "fulfilled") succeeded.push({ id, title });
      else failed.push({ id, title, reason: result.reason instanceof Error ? result.reason.message : "알 수 없는 오류" });
    });
    if (failed.length > 0) {
      setBulkFeedback(formatFailure(`${label} 부분 실패`, `${succeeded.length}개 성공, ${failed.length}개 실패`, "실패 항목 상세를 확인한 뒤 권한/상태를 점검하고 재시도하세요"));
    } else setBulkFeedback(null);
    setBulkReport({ actionLabel: label, total: ids.length, succeeded, failed });
    setSelectedTaskIds(new Set());
    setBulkConfirm(null);
    await onReload();
  };
  const quickMoveTask = async (taskId: string, toState: TaskState, label: string) => {
    const task = tasks.find((row) => row.id === taskId);
    if (!task) return;
    const activeTasks = tasks.filter((row) => !isBacklogTask(row));
    if (toState === "IN_PROGRESS" && isBacklogTask(task) && activeTasks.length >= BACKLOG_WIP_LIMIT) {
      setBulkFeedback(formatFailure(`${label} 실패`, `WIP 제한 ${BACKLOG_WIP_LIMIT}개를 초과합니다`, "기존 스프린트 태스크를 백로그로 이동하거나 제한을 조정한 뒤 다시 시도하세요"));
      return;
    }
    setBulkFeedback(null);
    await patchTask(taskId, { currentState: toState, workflowPhase: toState === "DRAFT" ? "BACKLOG" : "ACTIVE" });
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
      <section className="tabs-stack tabs-inline-row">
        <TaskViewTabs value={viewMode} tasks={tasks} onChange={setViewMode} />
        <div className="advanced-filter-inline">
          <small className="tabs-section-label">필터</small>
          <button
            className="filter-toggle-icon"
            onClick={() => setAdvancedFilterOpen((prev) => !prev)}
            aria-label={advancedFilterOpen ? "고급 필터 접기" : "고급 필터 펼치기"}
            title={filterSummary || "고급 필터"}
          >
            {advancedFilterOpen ? "−" : "+"}
          </button>
        </div>
      </section>
      {advancedFilterOpen && (
        <div className="advanced-filter-shell">
          <div className="advanced-quick-tabs">
            <Tabs
              variant="segmented"
              value={quickFilter}
              onChange={(value) => setQuickFilter(value as typeof quickFilter)}
              tabs={[
                { value: "all", label: "전체", count: tasks.length },
                { value: "mine", label: "내 할 일", count: tasks.filter((task) => task.assigneeIds.includes(meId) || task.ownerId === meId).length },
                { value: "pending", label: "승인 대기", count: tasks.filter((task) => {
                  const gateTargetIds = new Set(
                    (task.template?.workflowSchema?.transitions ?? [])
                      .filter((row) => row.onExit?.approvalGate?.enabled)
                      .map((row) => row.toStatusId)
                  );
                  return Boolean(task.workflowStatusId && gateTargetIds.has(task.workflowStatusId));
                }).length },
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
            <Select label="그룹" tone="filter" value={groupBy} onChange={(value) => setGroupBy(value as typeof groupBy)} options={[["none", "그룹 없음"], ["state", "상태별"], ["assignee", "담당자별"], ["bucket", "버킷별"]]} />
          </FilterShell>
        </div>
      )}
      {viewMode !== "list" && (
        <form className="create-card" onSubmit={create}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="새 태스크 제목" />
          <Select label="유형" value={templateType} onChange={(v) => setTemplateType(v as TemplateType)} options={templateTypes.filter((v) => v !== "ALL").map((v) => [v, TEMPLATE_META[v].label])} />
          <Select label="상위" value={parentId ?? ""} onChange={(v) => setParentId(v || null)} options={[["", "상위 항목 없음"], ...tasks.map((task) => [task.id, task.title] as [string, string])]} />
          <button className="button primary">생성</button>
        </form>
      )}
      {dragDisabled && (viewMode === "list" || viewMode === "backlog") && (
        <div className="sort-banner">
          <strong>정렬/그룹 중</strong>
          <span>수동 순서 이동은 정렬/그룹이 모두 꺼져 있을 때 활성화됩니다.</span>
          <button className="button secondary" onClick={() => { setSortBy("manual"); setGroupBy("none"); }}>정렬/그룹 해제</button>
        </div>
      )}
      {viewMode === "board" ? (
        <TaskBoardView tasks={filteredTasks} members={members} onPatch={patchTask} />
      ) : viewMode === "backlog" ? (
        <div className="grouped-list">
          {bulkFeedback && <div className="inline-error">{bulkFeedback}</div>}
            <section className="task-list-panel">
            <div className="task-list-head">
              <strong>백로그</strong>
              <span>{backlogTasks.length}</span>
            </div>
            <TaskTreeListView
              tasks={backlogTasks}
              allTasks={filteredTasks}
              members={members}
              buckets={buckets}
              dragDisabled={dragDisabled}
              showSprintAction
              onQuickCreate={async (quickTitle) => {
                const payload: Record<string, unknown> = { title: quickTitle, templateType: "TASK", currentState: "DRAFT", workflowPhase: "BACKLOG" };
                if (selectedUnitId) payload.unitId = selectedUnitId;
                if (selectedListId) payload.listId = selectedListId;
                const task = await request<TaskView>("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
                await onReload();
                go(`/tasks/${task.id}`);
              }}
              onPatch={patchTask}
              onMoveParent={moveTaskParent}
              showQuickAdd={false}
            />
          </section>
          {selectedTaskIds.size > 0 && (
            <div className="bulk-action-bar">
              <strong>{selectedTaskIds.size}개 선택됨</strong>
              <div className="row-actions">
                <button className="button secondary" onClick={() => setBulkConfirm({ toState: "DRAFT", label: "백로그로 이동" })}>백로그로 이동</button>
                <button className="button primary" onClick={() => setBulkConfirm({ toState: "IN_PROGRESS", label: "스프린트 투입" })}>스프린트 투입</button>
                <button className="button secondary" onClick={clearSelected}>선택 해제</button>
              </div>
            </div>
          )}
        </div>
      ) : groupBy === "state" ? (
        <div className="grouped-list">
          {states.filter((state): state is TaskState => state !== "ALL").map((state) => (
            <TaskListPanel key={state} title={STATE_META[state].label} tasks={filteredTasks.filter((task) => task.currentState === state)} members={members} buckets={buckets} dragDisabled={dragDisabled} onPatch={patchTask} />
          ))}
        </div>
      ) : groupBy === "assignee" ? (
        <div className="grouped-list">
          {members.map((member) => (
            <TaskListPanel key={member.id} title={member.name} tasks={filteredTasks.filter((task) => task.assigneeIds.includes(member.id))} members={members} buckets={buckets} dragDisabled={dragDisabled} onPatch={patchTask} />
          ))}
        </div>
      ) : groupBy === "bucket" ? (
        <div className="grouped-list">
          <section className="task-list-panel">
            <div className="task-list-head">
              <strong>버킷 관리</strong>
            </div>
            <div className="template-save-row">
              <input value={newBucketName} onChange={(event) => setNewBucketName(event.target.value)} placeholder="새 버킷 이름" />
              <button className="button secondary" onClick={() => void createBucket()} disabled={bucketBusy || !newBucketName.trim()}>
                {bucketBusy ? "생성 중..." : "+ 버킷 추가"}
              </button>
            </div>
          </section>
          {[...buckets].sort((a, b) => a.order - b.order).map((bucket) => (
            <div
              key={bucket.id}
              className={`bucket-drop-zone ${activeDropBucketId === bucket.id ? "active" : ""}`}
              onDragOver={(event) => {
                if (!draggingBucketTaskId) return;
                event.preventDefault();
                setActiveDropBucketId(bucket.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggingBucketTaskId) void patchTask(draggingBucketTaskId, { bucketId: bucket.id });
                setDraggingBucketTaskId(null);
                setActiveDropBucketId(null);
              }}
              onDragLeave={() => setActiveDropBucketId((prev) => (prev === bucket.id ? null : prev))}
            >
              <TaskListPanel
                title={bucketEditingId === bucket.id ? "버킷 이름 수정" : bucket.name}
                tasks={filteredTasks.filter((task) => task.bucketId === bucket.id)}
                members={members}
                buckets={buckets}
                dragDisabled={dragDisabled}
                onPatch={patchTask}
                showBucketSelect
                bucketControls={(
                  <div className="row-actions">
                    {bucketEditingId === bucket.id ? (
                      <>
                        <input value={bucketEditName} onChange={(event) => setBucketEditName(event.target.value)} placeholder="버킷 이름" />
                        <button className="button secondary" onClick={() => void renameBucket(bucket.id)}>저장</button>
                        <button className="button secondary" onClick={() => { setBucketEditingId(""); setBucketEditName(""); }}>취소</button>
                      </>
                    ) : (
                      <button className="button secondary" onClick={() => { setBucketEditingId(bucket.id); setBucketEditName(bucket.name); }}>이름수정</button>
                    )}
                    <button className="button secondary" onClick={() => void reorderBucket(bucket.id, -1)}>↑</button>
                    <button className="button secondary" onClick={() => void reorderBucket(bucket.id, 1)}>↓</button>
                    <button className="button danger" onClick={() => void deleteBucket(bucket.id)}>삭제</button>
                  </div>
                )}
                onRowDragStart={setDraggingBucketTaskId}
                onRowDragEnd={() => setDraggingBucketTaskId(null)}
              />
            </div>
          ))}
          <div
            className={`bucket-drop-zone ${activeDropBucketId === "__none__" ? "active" : ""}`}
            onDragOver={(event) => {
              if (!draggingBucketTaskId) return;
              event.preventDefault();
              setActiveDropBucketId("__none__");
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggingBucketTaskId) void patchTask(draggingBucketTaskId, { bucketId: null });
              setDraggingBucketTaskId(null);
              setActiveDropBucketId(null);
            }}
            onDragLeave={() => setActiveDropBucketId((prev) => (prev === "__none__" ? null : prev))}
          >
            <TaskListPanel
              title="버킷 없음"
              tasks={filteredTasks.filter((task) => !task.bucketId)}
              members={members}
              buckets={buckets}
              dragDisabled={dragDisabled}
              onPatch={patchTask}
              showBucketSelect
              onRowDragStart={setDraggingBucketTaskId}
              onRowDragEnd={() => { setDraggingBucketTaskId(null); setActiveDropBucketId(null); }}
            />
          </div>
        </div>
      ) : (
        <TaskTreeListView
          tasks={filteredTasks}
          allTasks={tasks}
          members={members}
          buckets={buckets}
          dragDisabled={dragDisabled}
          onQuickCreate={async (quickTitle) => {
            const payload: Record<string, unknown> = { title: quickTitle, templateType: "TASK" };
            if (selectedUnitId) payload.unitId = selectedUnitId;
            if (selectedListId) payload.listId = selectedListId;
            const task = await request<TaskView>("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
            await onReload();
            go(`/tasks/${task.id}`);
          }}
          onPatch={patchTask}
          onMoveParent={moveTaskParent}
        />
      )}
      {bulkConfirm && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <div>
                <div className="eyebrow">Bulk Action</div>
                <h2>{bulkConfirm.label}</h2>
              </div>
            </div>
            <p>
              선택된 {selectedTaskIds.size}개 태스크를 {bulkConfirm.label}합니다. 진행할까요?
            </p>
            <div className="row-actions">
              <button className="button secondary" onClick={() => setBulkConfirm(null)}>취소</button>
              <button className="button primary" onClick={() => void bulkMove(bulkConfirm.toState, bulkConfirm.label)}>확인</button>
            </div>
          </div>
        </div>
      )}
      {bulkReport && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <div>
                <div className="eyebrow">Bulk Report</div>
                <h2>{bulkReport.actionLabel} 결과</h2>
              </div>
            </div>
            <p>
              총 {bulkReport.total}개 중 {bulkReport.succeeded.length}개 성공, {bulkReport.failed.length}개 실패
            </p>
            {bulkReport.failed.length > 0 && (
              <div className="bulk-report-list">
                {bulkReport.failed.map((row) => (
                  <div key={row.id}>
                    <strong>{row.title}</strong>
                    <small>{row.reason}</small>
                  </div>
                ))}
              </div>
            )}
            <div className="row-actions">
              <button className="button primary" onClick={() => setBulkReport(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
      {moveToast && <div className="move-toast">{moveToast}</div>}
    </section>
  );
}

function TaskTreeListView({
  tasks,
  allTasks,
  members,
  buckets,
  dragDisabled,
  onQuickCreate,
  onPatch,
  onMoveParent,
  showSprintAction = false,
  showQuickAdd = true
}: {
  tasks: TaskView[];
  allTasks: TaskView[];
  members: Member[];
  buckets: Bucket[];
  dragDisabled: boolean;
  onQuickCreate: (title: string) => Promise<void>;
  onPatch: (taskId: string, patch: Partial<Pick<TaskView, "currentState" | "priority" | "parentId" | "workflowPhase" | "phaseOverride" | "workflowStatusId" | "bucketId" | "templateId">>) => Promise<void>;
  onMoveParent: (taskId: string, nextParentId: string | null) => Promise<void>;
  showSprintAction?: boolean;
  showQuickAdd?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tasks.map((task) => task.id)));
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropTargetTaskId, setDropTargetTaskId] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const byParent = useMemo(() => {
    const rows = new Map<string | null, TaskView[]>();
    const visible = new Set(tasks.map((task) => task.id));
    tasks.forEach((task) => {
      const key = task.parentId && visible.has(task.parentId) ? task.parentId : null;
      const bucket = rows.get(key) ?? [];
      bucket.push(task);
      bucket.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      rows.set(key, bucket);
    });
    return rows;
  }, [tasks]);
  const allByParent = useMemo(() => {
    const rows = new Map<string | null, TaskView[]>();
    allTasks.forEach((task) => {
      const key = task.parentId ?? null;
      const bucket = rows.get(key) ?? [];
      bucket.push(task);
      rows.set(key, bucket);
    });
    return rows;
  }, [allTasks]);
  const flatRows = useMemo(() => {
    const rows: TaskView[] = [];
    const walk = (parentId: string | null) => {
      (byParent.get(parentId) ?? []).forEach((row) => {
        rows.push(row);
        if (expanded.has(row.id)) walk(row.id);
      });
    };
    walk(null);
    return rows;
  }, [byParent, expanded]);
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!flatRows.length) return;
    const activeId = focusedTaskId ?? flatRows[0].id;
    const index = Math.max(0, flatRows.findIndex((row) => row.id === activeId));
    if (event.key === "ArrowDown" || event.key.toLowerCase() === "j") {
      event.preventDefault();
      setFocusedTaskId(flatRows[Math.min(flatRows.length - 1, index + 1)].id);
    }
    if (event.key === "ArrowUp" || event.key.toLowerCase() === "k") {
      event.preventDefault();
      setFocusedTaskId(flatRows[Math.max(0, index - 1)].id);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      go(`/tasks/${activeId}`);
    }
  };
  const isDescendant = (ancestorId: string, targetId: string) => {
    const stack = [...(allByParent.get(ancestorId) ?? [])];
    while (stack.length) {
      const row = stack.pop()!;
      if (row.id === targetId) return true;
      stack.push(...(allByParent.get(row.id) ?? []));
    }
    return false;
  };
  const moveByDrop = async (targetParentId: string | null) => {
    if (!draggingTaskId) return;
    if (targetParentId === draggingTaskId) return;
    if (targetParentId && isDescendant(draggingTaskId, targetParentId)) return;
    await onMoveParent(draggingTaskId, targetParentId);
    setDraggingTaskId(null);
    setDropTargetTaskId(null);
  };

  return (
    <section className="task-list-panel tree-list-panel">
      <div className="task-table tree-mode" tabIndex={0} onKeyDown={onKeyDown}>
        <div className="task-row rich-row table-head">
          <span />
          <span>태스크</span>
          <span>담당</span>
          <span>타입</span>
          <span>템플릿</span>
          <span>상태</span>
          <span>우선순위</span>
        </div>
        {(byParent.get(null) ?? []).map((task) => (
          <TaskTreeRow key={task.id} task={task} level={0} byParent={byParent} expanded={expanded} onToggle={toggle} members={members} buckets={buckets} dragDisabled={dragDisabled} onPatch={onPatch} focusedTaskId={focusedTaskId} setFocusedTaskId={setFocusedTaskId} draggingTaskId={draggingTaskId} dropTargetTaskId={dropTargetTaskId} setDraggingTaskId={setDraggingTaskId} setDropTargetTaskId={setDropTargetTaskId} onDropParent={moveByDrop} showSprintAction={showSprintAction} />
        ))}
        {!tasks.length && <div className="empty-row">표시할 태스크가 없습니다.</div>}
      </div>
      {showQuickAdd && (
        <div className="inline-add-task">
          {!quickAddOpen ? (
            <button className="inline-add-trigger" onClick={() => setQuickAddOpen(true)}>Add Task + (제목만 빠르게)</button>
          ) : (
            <form
              className="inline-add-input-wrap"
              onSubmit={(event) => {
                event.preventDefault();
                if (!quickTitle.trim()) return;
                void onQuickCreate(quickTitle.trim()).then(() => {
                  setQuickTitle("");
                  setQuickAddOpen(false);
                });
              }}
            >
              <input
                autoFocus
                value={quickTitle}
                onChange={(event) => setQuickTitle(event.target.value)}
                onBlur={() => {
                  if (!quickTitle.trim()) setQuickAddOpen(false);
                }}
                placeholder="태스크 제목 입력 후 Enter"
              />
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function TaskTreeRow({
  task,
  level,
  byParent,
  expanded,
  onToggle,
  members,
  buckets,
  dragDisabled,
  onPatch,
  focusedTaskId,
  setFocusedTaskId,
  draggingTaskId,
  dropTargetTaskId,
  setDraggingTaskId,
  setDropTargetTaskId,
  onDropParent,
  showSprintAction = false
}: {
  task: TaskView;
  level: number;
  byParent: Map<string | null, TaskView[]>;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  members: Member[];
  buckets: Bucket[];
  dragDisabled: boolean;
  onPatch: (taskId: string, patch: Partial<Pick<TaskView, "currentState" | "priority" | "parentId" | "workflowPhase" | "phaseOverride" | "workflowStatusId" | "bucketId" | "templateId">>) => Promise<void>;
  focusedTaskId: string | null;
  setFocusedTaskId: (id: string) => void;
  draggingTaskId: string | null;
  dropTargetTaskId: string | null;
  setDraggingTaskId: (id: string | null) => void;
  setDropTargetTaskId: (id: string | null) => void;
  onDropParent: (parentId: string | null) => Promise<void>;
  showSprintAction?: boolean;
}) {
  const children = byParent.get(task.id) ?? [];
  const open = expanded.has(task.id);
  const bucketName = buckets.find((bucket) => bucket.id === task.bucketId)?.name ?? "버킷 없음";
  return (
    <>
      <div
        className={`task-row rich-row priority-${task.priority.toLowerCase()} ${dropTargetTaskId === task.id ? "drop-target" : ""}`}
        onDragOver={(event) => {
          if (!draggingTaskId) return;
          event.preventDefault();
          setDropTargetTaskId(task.id);
        }}
        onDrop={(event) => {
          event.preventDefault();
          void onDropParent(task.id);
        }}
      >
        <div className="row-left-actions">
          <button className={`drag-handle ${dragDisabled ? "disabled" : ""}`} title={dragDisabled ? "정렬 또는 그룹 중에는 순서 이동이 비활성화됩니다." : "수동 순서 이동"}>⠿</button>
        </div>
        <div className="task-open-cell tree-open-cell" style={{ paddingLeft: `${level * 18}px` }}>
          <button className="tree-inline-toggle" onClick={() => children.length && onToggle(task.id)}>{children.length ? (open ? "▾" : "▸") : "·"}</button>
          <button
            className={`task-tree-title ${focusedTaskId === task.id ? "focused" : ""}`}
            onClick={() => go(`/tasks/${task.id}`)}
            onFocus={() => setFocusedTaskId(task.id)}
            draggable
            onDragStart={() => setDraggingTaskId(task.id)}
            onDragEnd={() => {
              setDraggingTaskId(null);
              setDropTargetTaskId(null);
            }}
          >
            <strong>{task.title}</strong>
            {task.tags.length > 0 && (
              <span className="task-row-tags">
                {task.tags.map((tag) => <i key={tag}>#{tag}</i>)}
              </span>
            )}
          </button>
          <div className="tree-inline-actions">
            {showSprintAction && <button className="workflow-chip-btn sprint" onClick={() => void onPatch(task.id, { currentState: "IN_PROGRESS", workflowPhase: "ACTIVE" })}>투입</button>}
            <button className="workflow-chip-btn backlog" onClick={() => void onPatch(task.id, { currentState: "DRAFT", workflowPhase: "BACKLOG" })}>백로그</button>
            <span className="signal-chip">{bucketName}</span>
          </div>
        </div>
        <span className="owner-cell">
          <strong>{task.assigneeIds.map((id) => memberName(members, id)).join(", ") || "미지정"}</strong>
        </span>
        <span>{templateLabel(task.templateType)}</span>
        <Select
          tone="inline"
          value={task.templateId ?? ""}
          onChange={(value) => void onPatch(task.id, { templateId: value || null })}
          options={[
            ["", "형상화 · 자유폼"],
            ...(task.templateId ? [[task.templateId, `정형화 · ${task.template?.name ?? templateLabel(task.templateType)}`] as [string, string]] : [])
          ]}
        />
        <Select tone="inline" value={task.currentState} onChange={(value) => void onPatch(task.id, { currentState: value as TaskState })} options={states.filter((state): state is TaskState => state !== "ALL").map((state) => [state, STATE_META[state].label])} />
        <Select tone="inline" value={task.priority} onChange={(value) => void onPatch(task.id, { priority: value as TaskView["priority"] })} options={["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => [value, priorityLabel[value as TaskView["priority"]]])} />
      </div>
      {open && children.map((child) => (
        <TaskTreeRow key={child.id} task={child} level={level + 1} byParent={byParent} expanded={expanded} onToggle={onToggle} members={members} buckets={buckets} dragDisabled={dragDisabled} onPatch={onPatch} focusedTaskId={focusedTaskId} setFocusedTaskId={setFocusedTaskId} draggingTaskId={draggingTaskId} dropTargetTaskId={dropTargetTaskId} setDraggingTaskId={setDraggingTaskId} setDropTargetTaskId={setDropTargetTaskId} onDropParent={onDropParent} showSprintAction={showSprintAction} />
      ))}
    </>
  );
}

function TaskListPanel({
  title,
  tasks,
  members,
  buckets,
  dragDisabled,
  quickMove,
  onQuickMove,
  selectable,
  selectedTaskIds,
  onToggleSelect,
  onSelectAll,
  onPatch,
  showBucketSelect = false,
  bucketControls,
  onRowDragStart,
  onRowDragEnd
}: {
  title: string;
  tasks: TaskView[];
  members: Member[];
  buckets: Bucket[];
  dragDisabled: boolean;
  quickMove?: { label: string; toState: TaskState };
  onQuickMove?: (task: TaskView) => void;
  selectable?: boolean;
  selectedTaskIds?: Set<string>;
  onToggleSelect?: (taskId: string) => void;
  onSelectAll?: () => void;
  onPatch: (taskId: string, patch: Partial<Pick<TaskView, "currentState" | "priority" | "parentId" | "workflowPhase" | "phaseOverride" | "workflowStatusId" | "bucketId">>) => Promise<void>;
  showBucketSelect?: boolean;
  bucketControls?: ReactNode;
  onRowDragStart?: (taskId: string) => void;
  onRowDragEnd?: () => void;
}) {
  const selectedCount = tasks.filter((task) => selectedTaskIds?.has(task.id)).length;
  return (
    <section className="task-list-panel">
      <div className="task-list-head">
        <strong>{title}</strong>
        <span>{selectedCount > 0 ? `${selectedCount}/${tasks.length}` : tasks.length}</span>
        {selectable && onSelectAll && (
          <button className="text-button" onClick={onSelectAll}>전체 선택</button>
        )}
        {bucketControls}
      </div>
      <div className="task-table">
        <div className="task-row rich-row table-head">
          <span />
          <span>Decision object</span>
          <span>Owner / signal</span>
          <span>Action</span>
          <span>Status</span>
          <span>Priority</span>
        </div>
        {tasks.map((task) => (
          <div key={task.id} className={`task-row rich-row priority-${task.priority.toLowerCase()}`}>
            <div className="row-left-actions">
              {selectable && onToggleSelect && (
                <label className="row-select-check">
                  <input type="checkbox" checked={Boolean(selectedTaskIds?.has(task.id))} onChange={() => onToggleSelect(task.id)} />
                </label>
              )}
              <button className={`drag-handle ${dragDisabled ? "disabled" : ""}`} title={dragDisabled ? "정렬 또는 그룹 중에는 순서 이동이 비활성화됩니다." : "수동 순서 이동"}>⠿</button>
            </div>
            <button
              className="task-open-cell"
              onClick={() => go(`/tasks/${task.id}`)}
              draggable={Boolean(onRowDragStart)}
              onDragStart={() => onRowDragStart?.(task.id)}
              onDragEnd={() => onRowDragEnd?.()}
            >
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
            <div className="row-action-cell">
              {quickMove && task.currentState !== quickMove.toState ? (
                <button className="button secondary task-row-action" onClick={() => {
                  if (onQuickMove) onQuickMove(task);
                  else void onPatch(task.id, { currentState: quickMove.toState });
                }}>
                  {quickMove.label}
                </button>
              ) : (
                <span className="muted">-</span>
              )}
              {showBucketSelect ? (
                <Select
                  tone="inline"
                  value={task.bucketId ?? ""}
                  onChange={(value) => void onPatch(task.id, { bucketId: value || null })}
                  options={[["", "버킷 없음"], ...buckets.map((bucket) => [bucket.id, bucket.name] as [string, string])]}
                />
              ) : (
                <span className="signal-chip">{buckets.find((bucket) => bucket.id === task.bucketId)?.name ?? "버킷 없음"}</span>
              )}
            </div>
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
  onPatch: (taskId: string, patch: Partial<Pick<TaskView, "currentState" | "priority" | "parentId" | "workflowPhase" | "phaseOverride" | "workflowStatusId" | "bucketId">>) => Promise<void>;
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
              <button className="board-add" onClick={() => go("/tasks")}>+ Add task</button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TemplatesView({
  templates,
  workflowStatuses,
  onReload
}: {
  templates: Template[];
  workflowStatuses: AppData["workflowStatuses"];
  onReload: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<TemplateType>("TASK");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusJson, setStatusJson] = useState(() => JSON.stringify(workflowStatuses, null, 2));

  useEffect(() => {
    setStatusJson(JSON.stringify(workflowStatuses, null, 2));
  }, [workflowStatuses]);

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
      <PageHeader eyebrow="템플릿" title="템플릿 센터" />
      <section className="panel">
        <PanelHeader title="운영 가이드" />
        <p className="muted">
          자유폼 태스크로 시작한 뒤 템플릿을 적용하거나, 현재 폼을 템플릿으로 저장해 재사용할 수 있습니다.
          템플릿은 기본 양식 필드셋과 워크플로우를 함께 정의합니다.
        </p>
      </section>
      <section className="panel">
        <PanelHeader title="전역 상태 라이브러리" />
        <p className="muted">템플릿 공통 상태 사전입니다. 각 템플릿 전이는 여기 정의된 status id를 참조합니다.</p>
        <textarea className="code-textarea" value={statusJson} onChange={(event) => setStatusJson(event.target.value)} rows={8} />
        <div className="row-actions">
          <button
            className="button secondary"
            onClick={async () => {
              try {
                setError(null);
                const parsed = JSON.parse(statusJson);
                await request("/api/workflow/statuses", { method: "PATCH", body: JSON.stringify({ statuses: parsed }) });
                await onReload();
              } catch (err) {
                setError(err instanceof Error ? err.message : "전역 상태 저장에 실패했습니다.");
              }
            }}
          >
            전역 상태 저장
          </button>
        </div>
      </section>
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
          <TemplateCard key={template.id} template={template} workflowStatuses={workflowStatuses} onReload={onReload} />
        ))}
      </div>
    </section>
  );
}

function TemplateCard({
  template,
  workflowStatuses,
  onReload
}: {
  template: Template;
  workflowStatuses: AppData["workflowStatuses"];
  onReload: () => Promise<void>;
}) {
  const normalizeWorkflowSchemaDraft = (raw: unknown) => {
    const input = raw as {
      statuses?: Array<{ id: string; name: string; category: string; isDefault?: boolean }>;
      transitions?: Array<{
        fromStatusId: string;
        toStatusId: string;
        label: string;
        decisionType: DecisionType;
        isDecision: boolean;
        onEnter?: Record<string, unknown>;
        onExit?: { approvalGate?: { enabled: boolean; policyId?: string | null } };
      }>;
    };
    const statuses = (input.statuses ?? workflowStatuses).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      category: row.category as "OPEN" | "IN_PROGRESS" | "PENDING_APPROVAL" | "DONE" | "CANCELED",
      isDefault: Boolean(row.isDefault)
    }));
    const transitions = (input.transitions ?? []).map((row) => ({
      fromStatusId: String(row.fromStatusId),
      toStatusId: String(row.toStatusId),
      label: String(row.label),
      decisionType: row.decisionType,
      isDecision: Boolean(row.isDecision),
      onEnter: row.onEnter ?? {},
      onExit: {
        ...(row.onExit ?? {}),
        approvalGate: {
          enabled: Boolean(row.onExit?.approvalGate?.enabled),
          policyId: row.onExit?.approvalGate?.policyId ?? null
        }
      }
    }));
    return { statuses, transitions };
  };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: template.name, type: template.type, enabled: template.enabled });
  const [workflowJson, setWorkflowJson] = useState(() =>
    JSON.stringify(template.workflowSchema ?? {
      statuses: workflowStatuses,
      transitions: template.workflow.map((rule) => ({
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
      }))
    }, null, 2)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({ name: template.name, type: template.type, enabled: template.enabled });
    setWorkflowJson(JSON.stringify(template.workflowSchema ?? {
      statuses: workflowStatuses,
      transitions: template.workflow.map((rule) => ({
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
      }))
    }, null, 2));
  }, [template.enabled, template.name, template.type, template.workflow, template.workflowSchema, workflowStatuses]);

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

  const saveWorkflow = async () => {
    try {
      setBusy(true);
      setError(null);
      const parsed = JSON.parse(workflowJson);
      const normalized = normalizeWorkflowSchemaDraft(parsed);
      await request(`/api/templates/${template.id}/workflow`, { method: "PATCH", body: JSON.stringify(normalized) });
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "워크플로우 저장에 실패했습니다.");
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
          <label>
            워크플로우(JSON, 고급 설정)
            <textarea className="code-textarea" rows={10} value={workflowJson} onChange={(event) => setWorkflowJson(event.target.value)} />
          </label>
          <p className="muted">전이는 `onExit.approvalGate.enabled/policyId` 기준으로 승인 게이트를 설정합니다.</p>
          <div className="row-actions">
            <button className="button secondary" disabled={busy} onClick={() => setEditing(false)}>취소</button>
            <button className="button secondary" disabled={busy} onClick={() => void saveWorkflow()}>워크플로우 저장</button>
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
            {(template.workflowSchema?.transitions ?? []).map((rule) => (
              <div key={`${rule.fromStatusId}-${rule.toStatusId}-${rule.decisionType}`}>
                <span>{rule.fromStatusId}</span>
                <strong>{rule.label}</strong>
                <span>{rule.toStatusId}</span>
                {rule.isDecision && <Badge tone="amber">{decisionLabel[rule.decisionType]}</Badge>}
                {rule.onExit?.approvalGate?.enabled && (
                  <Badge tone={rule.onExit.approvalGate.policyId ? "blue" : "red"}>
                    {rule.onExit.approvalGate.policyId ? "승인게이트(정책연결)" : "승인게이트(정책미지정)"}
                  </Badge>
                )}
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

import { ReactNode, useMemo, useState } from "react";
import { STATE_META, type AppData, type Folder, type Member, type TaskList, type Unit, type UnitMember } from "@hwe/shared";
import { go } from "../lib/router";
import type { TaskView } from "../lib/viewTypes";
import { profileDisplayName, roleLabel, templateLabel } from "../lib/domain";

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
  if (route === "/settings/access" || route === "/settings/members" || route === "/settings/permissions") return [{ label: "설정", path: "/settings/profile" }, { label: "사용자 및 권한", path: "/settings/access" }];
  if (route === "/settings/analytics") return [{ label: "설정", path: "/settings/profile" }, { label: "분석", path: "/settings/analytics" }];
  if (route === "/settings/alerts") return [{ label: "설정", path: "/settings/profile" }, { label: "알림 설정", path: "/settings/alerts" }];
  return [{ label: "태스크", path: "/tasks" }];
}

export function Shell({
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
    if (me.role === "ADMIN" || me.role === "SUPER_ADMIN") return "관리자(전역)";
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
    { path: selectedUnitId ? `/units/${selectedUnitId}/settings` : "/settings/unit", label: "유닛 설정", match: (path: string) => path === "/settings/unit" || /^\/units\/[^/]+\/settings$/.test(path) }
  ];
  const globalManagementItems = [
    { path: "/settings/profile", label: "프로필 설정", match: (path: string) => path === "/settings" || path === "/settings/profile" },
    { path: "/settings/alerts", label: "알림 설정", match: (path: string) => path === "/settings/alerts" },
    ...(me.role === "ADMIN" ? [{ path: "/settings/access", label: "사용자 및 권한", match: (path: string) => ["/settings/access", "/settings/members", "/settings/permissions"].includes(path) }] : []),
    ...(me.role === "ADMIN"
      ? [
          { path: "/settings/units", label: "전역 유닛 관리", match: (path: string) => path === "/settings/units" },
            { path: "/settings/approval-policies", label: "전역 승인정책", match: (path: string) => path === "/settings/approval-policies" },
            { path: "/settings/templates", label: "템플릿 센터", match: (path: string) => path === "/settings/templates" || path === "/templates" },
          { path: "/settings/analytics", label: "분석", match: (path: string) => path === "/settings/analytics" }
        ]
      : [])
  ];
  const settingsItems = [...currentWorkspaceSettingsItems, ...globalManagementItems];
  const settingsRoutes = new Set(["/settings", "/settings/unit", "/templates", "/settings/alerts", ...settingsItems.map((item) => item.path)]);
  const isSettingsRoute = settingsRoutes.has(route) || /^\/units\/[^/]+\/settings$/.test(route);
  const workspaceUnitTitle = activeUnit?.name ?? "전역 유닛 스페이스";
  const workspaceScopeLabel = selectedListId ? "리스트 단위" : selectedUnitId ? "유닛 단위" : "전사 단위";
  const activeList = lists.find((list) => list.id === selectedListId);
  const activeFolder = activeList ? folders.find((folder) => folder.id === activeList.folderId) : null;
  const unitTaskCount = selectedUnitId ? tasks.filter((task) => task.unitId === selectedUnitId).length : tasks.length;
  const templatedCount = tasks.filter((task) => task.structureState === "TEMPLATED").length;
  const mentionReadyCount = tasks.filter((task) => task.activity.commentsCount > 0 || task.activity.notesCount > 0).length;

  return (
    <div className={`app-shell ${gnbExpanded ? "gnb-expanded" : ""}`}>
      <aside className={`gnb-sidebar ${gnbExpanded ? "expanded" : "collapsed"}`}>
        <section className="rail-brand">
          <button className="rail-logo" onClick={() => onNavigate("/tasks")} title="SelvasIn4 HWE">H</button>
          <small>HWE</small>
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
          {gnbExpanded ? "‹" : "›"}
        </button>
      </aside>
      <aside className="context-sidebar">
        <section className="context-card context-current">
          <small>{workspaceScopeLabel}</small>
          <strong>{activeList?.name ?? workspaceUnitTitle}</strong>
          <span>{activeFolder ? `${workspaceUnitTitle} / ${activeFolder.name}` : unitRoleLabel}</span>
        </section>
        <section className="context-section">
          <div className="context-section-head">
            <span>Workspace</span>
            <b>{unitTaskCount}</b>
          </div>
          <button className={`context-item ${activeWorkspaceValue === "global" ? "active" : ""}`} onClick={() => onSelectUnit("")}>
            <span>전역 유닛 스페이스</span>
            <em>{tasks.length}</em>
          </button>
          <div className="context-tree">
            {units.map((unit) => {
              const unitLists = lists.filter((list) => list.unitId === unit.id);
              const unitFolders = folders.filter((folder) => folder.unitId === unit.id);
              const unitCount = tasks.filter((task) => task.unitId === unit.id).length;
              return (
                <div className="context-unit" key={unit.id}>
                  <button className={`context-item ${selectedUnitId === unit.id && !selectedListId ? "active" : ""}`} onClick={() => onSelectUnit(unit.id)}>
                    <span>{unit.name}</span>
                    <em>{unitCount}</em>
                  </button>
                  {unitFolders.map((folder) => {
                    const folderLists = unitLists.filter((list) => list.folderId === folder.id);
                    return (
                      <div className="context-folder" key={folder.id}>
                        <small>{folder.name}</small>
                        {folderLists.map((list) => (
                          <button key={list.id} className={`context-list-item ${selectedListId === list.id ? "active" : ""}`} onClick={() => onSelectList(list.id)}>
                            <span>{list.name}</span>
                            <em>{tasks.filter((task) => task.listId === list.id).length}</em>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
        {isSettingsRoute ? (
          <section className="context-section">
            <div className="context-section-head">
              <span>Settings</span>
              <b>{settingsItems.length}</b>
            </div>
            {settingsItems.map((item) => (
              <button key={item.path} className={`context-item ${item.match(route) ? "active" : ""}`} onClick={() => onNavigate(item.path)}>
                <span>{item.label}</span>
              </button>
            ))}
          </section>
        ) : (
          <section className="context-section loop-section">
            <div className="context-section-head">
              <span>Objective Loop</span>
              <b>{Math.round((templatedCount / Math.max(1, tasks.length)) * 100)}%</b>
            </div>
            {[
              ["01", "형상화", `${tasks.length} nodes`],
              ["02", "정형화", `${templatedCount} templates`],
              ["03", "멘션", `${mentionReadyCount} signals`],
              ["04", "결정", `${inbox.length} triggers`]
            ].map(([index, label, value]) => (
              <div className="loop-step" key={label}>
                <i>{index}</i>
                <strong>{label}</strong>
                <span>{value}</span>
              </div>
            ))}
          </section>
        )}
      </aside>
      <div className="workspace">
        <main>
          <div className="content-context-bar">
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
            <div className="context-bar-signals">
              <span>{workspaceUnitTitle}</span>
              <span>{activeFolder?.name ?? "전체 폴더"}</span>
              <span>{activeList?.name ?? "전체 리스트"}</span>
            </div>
          </div>
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

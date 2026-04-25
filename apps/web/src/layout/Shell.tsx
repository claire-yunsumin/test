import { ReactNode, useEffect, useMemo, useState } from "react";
import { STATE_META, type AppData, type Folder, type Member, type TaskList, type Unit, type UnitMember } from "@hwe/shared";
import { go } from "../lib/router";
import type { TaskView } from "../lib/viewTypes";
import { profileDisplayName, roleLabel, templateLabel } from "../lib/domain";
import { WorkspaceListScopeIcon } from "../components/WorkspaceSurfaceIcons";
import { request } from "../lib/api";

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

function teamInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join("")
    .toUpperCase();
}

const SIDEBAR_FAVORITES_KEY = "hwe-sidebar-favorites-v1";
const GNB_EXPANDED_KEY = "hwe-gnb-expanded-v1";

function readSidebarFavorites() {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_FAVORITES_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(rows) ? rows.filter((row): row is string => typeof row === "string") : []);
  } catch {
    return new Set<string>();
  }
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
  onReload,
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
  onReload: () => Promise<void>;
  children: ReactNode;
}) {
  const unread = inbox.filter((item) => item.userId === me.id && !item.readAt).length;
  const breadcrumbs = headerBreadcrumb(route, taskId, tasks);
  const [searchOpen, setSearchOpen] = useState(false);
  const [creatingFolderUnitId, setCreatingFolderUnitId] = useState<string | null>(null);
  const [creatingListUnitId, setCreatingListUnitId] = useState<string | null>(null);
  const [openUnitMenuId, setOpenUnitMenuId] = useState<string | null>(null);
  const [explorerNotice, setExplorerNotice] = useState<string>("");
  const [recentFolderId, setRecentFolderId] = useState<string | null>(null);
  const [recentListId, setRecentListId] = useState<string | null>(null);
  const [menuDraft, setMenuDraft] = useState<{
    unitId: string;
    mode: "folder" | "list";
    name: string;
    folderId: string;
  } | null>(null);
  const [gnbExpanded, setGnbExpanded] = useState(() => {
    try {
      return window.localStorage.getItem(GNB_EXPANDED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [globalQuery, setGlobalQuery] = useState("");
  const [openTeamIds, setOpenTeamIds] = useState<Set<string>>(() => new Set(units.map((unit) => unit.id)));
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(readSidebarFavorites);
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
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const listById = useMemo(() => new Map(lists.map((list) => [list.id, list])), [lists]);
  const folderById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const unreadByUnit = useMemo(() => {
    const map = new Map<string, number>();
    inbox.forEach((item) => {
      if (item.userId !== me.id || item.readAt) return;
      const task = taskById.get(item.taskId);
      if (!task?.unitId) return;
      map.set(task.unitId, (map.get(task.unitId) ?? 0) + 1);
    });
    return map;
  }, [inbox, me.id, taskById]);
  const unreadByList = useMemo(() => {
    const map = new Map<string, number>();
    inbox.forEach((item) => {
      if (item.userId !== me.id || item.readAt) return;
      const task = taskById.get(item.taskId);
      if (!task?.listId) return;
      map.set(task.listId, (map.get(task.listId) ?? 0) + 1);
    });
    return map;
  }, [inbox, me.id, taskById]);
  useEffect(() => {
    if (!selectedUnitId) return;
    setOpenTeamIds((prev) => new Set(prev).add(selectedUnitId));
  }, [selectedUnitId]);
  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_FAVORITES_KEY, JSON.stringify([...favoriteKeys]));
  }, [favoriteKeys]);
  useEffect(() => {
    try {
      window.localStorage.setItem(GNB_EXPANDED_KEY, gnbExpanded ? "1" : "0");
    } catch {
      // ignore
    }
  }, [gnbExpanded]);
  useEffect(() => {
    if (!openUnitMenuId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setOpenUnitMenuId(null);
        return;
      }
      if (!target.closest(".unit-row-actions")) setOpenUnitMenuId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openUnitMenuId]);
  useEffect(() => {
    if (!explorerNotice) return;
    const timer = window.setTimeout(() => setExplorerNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [explorerNotice]);
  useEffect(() => {
    if (!recentFolderId && !recentListId) return;
    const timer = window.setTimeout(() => {
      setRecentFolderId(null);
      setRecentListId(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [recentFolderId, recentListId]);
  const toggleTeam = (unitId: string) => {
    setOpenTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };
  const toggleFavorite = (key: string) => {
    setFavoriteKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const favoriteItems = useMemo(() => [...favoriteKeys].map((key) => {
    const [kind, id] = key.split(":");
    if (kind === "unit") {
      const unit = unitById.get(id);
      if (!unit) return null;
      return {
        key,
        kind: "team" as const,
        title: unit.name,
        subtitle: unit.purpose,
        unread: unreadByUnit.get(unit.id) ?? 0,
        active: selectedUnitId === unit.id && !selectedListId,
        open: () => {
          onSelectUnit(unit.id);
          setOpenTeamIds((prev) => new Set(prev).add(unit.id));
        }
      };
    }
    if (kind === "list") {
      const list = listById.get(id);
      if (!list) return null;
      const unit = unitById.get(list.unitId);
      const folder = list.folderId ? folderById.get(list.folderId) : null;
      return {
        key,
        kind: "list" as const,
        title: list.name,
        subtitle: `${unit?.name ?? "Unit"}${folder ? ` / ${folder.name}` : ""}`,
        unread: unreadByList.get(list.id) ?? 0,
        active: selectedListId === list.id,
        open: () => {
          onSelectList(list.id);
          setOpenTeamIds((prev) => new Set(prev).add(list.unitId));
        }
      };
    }
    return null;
  }).filter((item): item is NonNullable<typeof item> => Boolean(item)), [favoriteKeys, folderById, listById, onSelectList, onSelectUnit, selectedListId, selectedUnitId, tasks, unitById, unreadByList, unreadByUnit]);
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
  const templatedCount = tasks.filter((task) => task.structureState === "TEMPLATED").length;
  const mentionReadyCount = tasks.filter((task) => task.activity.commentsCount > 0 || task.activity.notesCount > 0).length;
  const createFolder = async (unit: Unit, name: string) => {
    if (creatingFolderUnitId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      setCreatingFolderUnitId(unit.id);
      const created = await request<Folder>("/api/folders", {
        method: "POST",
        body: JSON.stringify({ unitId: unit.id, name: trimmed })
      });
      setOpenTeamIds((prev) => new Set(prev).add(unit.id));
      await onReload();
      setRecentFolderId(created.id);
      setRecentListId(null);
      setExplorerNotice(`폴더 "${created.name}"를 만들었습니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "폴더를 생성하지 못했습니다.";
      window.alert(message);
    } finally {
      setCreatingFolderUnitId(null);
    }
  };
  const createList = async (unit: Unit, name: string, folderId: string | null) => {
    if (creatingListUnitId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      setCreatingListUnitId(unit.id);
      const created = await request<TaskList>("/api/lists", {
        method: "POST",
        body: JSON.stringify({ unitId: unit.id, folderId, name: trimmed, defaultPhase: "BACKLOG" })
      });
      setOpenTeamIds((prev) => new Set(prev).add(unit.id));
      await onReload();
      onSelectUnit(unit.id);
      onSelectList(created.id);
      setRecentListId(created.id);
      setRecentFolderId(created.folderId ?? null);
      setExplorerNotice(`리스트 "${created.name}"를 만들었습니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "리스트를 생성하지 못했습니다.";
      window.alert(message);
    } finally {
      setCreatingListUnitId(null);
    }
  };
  const closeUnitMenu = () => {
    setOpenUnitMenuId(null);
    setMenuDraft(null);
  };

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
                gnbExpanded ? (
                  <span className="nav-unread-count" aria-hidden>
                    {Number(link.unread) > 99 ? "99+" : link.unread}
                  </span>
                ) : (
                  <span className="nav-unread-dot" aria-label={`읽지 않은 알림 ${link.unread}개`} />
                )
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
        <button
          className="gnb-toggle"
          type="button"
          onClick={() => setGnbExpanded((prev) => !prev)}
          title={gnbExpanded ? "메뉴 축소" : "메뉴 확장(라벨 보기)"}
          aria-label={gnbExpanded ? "메뉴 축소" : "메뉴 확장"}
        >
          {gnbExpanded ? "‹" : "›"}
        </button>
      </aside>
      <aside className="context-sidebar explorer-sidebar">
        <section className="context-section favorites-section">
          {explorerNotice && <div className="explorer-notice">{explorerNotice}</div>}
          <div className="context-section-head">
            <span>Favorites</span>
            <b>{favoriteItems.length}</b>
          </div>
          {favoriteItems.length ? (
            favoriteItems.map((item) => (
              <button key={item.key} className={`favorite-row ${item.active ? "active" : ""}`} onClick={item.open}>
                <span className={item.kind === "team" ? "team-avatar favorite-avatar" : "favorite-list-icon-wrap"}>
                  {item.kind === "team" ? teamInitials(item.title) : <WorkspaceListScopeIcon className="favorite-channel-icon" />}
                </span>
                <span className="favorite-copy">
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </span>
                {item.unread > 0 && <i>{item.unread}</i>}
                <span
                  className="favorite-toggle active"
                  title="즐겨찾기 해제"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFavorite(item.key);
                  }}
                >
                  ★
                </span>
              </button>
            ))
          ) : (
            <p className="favorite-empty">Unit 또는 List 행의 별을 눌러 고정하세요.</p>
          )}
        </section>
        <section className="context-section teams-section">
          <div className="context-section-head">
            <span>워크스페이스</span>
          </div>
          <button className={`team-row global-team ${activeWorkspaceValue === "global" ? "active" : ""}`} onClick={() => onSelectUnit("")}>
            <span className="team-avatar">G</span>
            <span className="team-copy">
              <strong>전역 유닛 스페이스</strong>
              <small>전체 Unit·List를 가로지르는 전사 보기</small>
            </span>
          </button>
          <div className="teams-tree">
            {units.map((unit) => {
              const unitLists = lists.filter((list) => list.unitId === unit.id);
              const unitFolders = folders.filter((folder) => folder.unitId === unit.id);
              const isOpen = openTeamIds.has(unit.id);
              const unitUnread = unreadByUnit.get(unit.id) ?? 0;
              return (
                <div className={`team-block ${isOpen ? "open" : ""}`} key={unit.id}>
                  <div
                    className={`team-row ${selectedUnitId === unit.id && !selectedListId ? "active" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      onSelectUnit(unit.id);
                      setOpenTeamIds((prev) => new Set(prev).add(unit.id));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectUnit(unit.id);
                        setOpenTeamIds((prev) => new Set(prev).add(unit.id));
                      }
                    }}
                  >
                    <span className="team-avatar">{teamInitials(unit.name)}</span>
                    <span className="team-copy">
                      <strong>{unit.name}</strong>
                      <small>{unit.purpose}</small>
                    </span>
                    <span className="team-meta">
                      {unitUnread > 0 && <i>{unitUnread}</i>}
                    </span>
                    <span className="unit-row-actions">
                      <button
                        type="button"
                        className="team-menu-trigger"
                        aria-haspopup="menu"
                        aria-expanded={openUnitMenuId === unit.id}
                        title="유닛 작업"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenUnitMenuId((prev) => {
                            const next = prev === unit.id ? null : unit.id;
                            if (next !== unit.id) setMenuDraft(null);
                            return next;
                          });
                        }}
                      >
                        ...
                      </button>
                      {openUnitMenuId === unit.id && (
                        <div className="team-actions-menu" role="menu" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              const key = `unit:${unit.id}`;
                              const alreadyFavorite = favoriteKeys.has(key);
                              toggleFavorite(key);
                              setExplorerNotice(alreadyFavorite ? "즐겨찾기를 해제했습니다." : "즐겨찾기에 추가했습니다.");
                              closeUnitMenu();
                            }}
                          >
                            {favoriteKeys.has(`unit:${unit.id}`) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={creatingFolderUnitId === unit.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuDraft({
                                unitId: unit.id,
                                mode: "folder",
                                name: "",
                                folderId: ""
                              });
                            }}
                          >
                            폴더 만들기
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={creatingListUnitId === unit.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuDraft({
                                unitId: unit.id,
                                mode: "list",
                                name: "",
                                folderId: ""
                              });
                            }}
                          >
                            리스트 만들기
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              toggleTeam(unit.id);
                              closeUnitMenu();
                            }}
                          >
                            {isOpen ? "유닛 접기" : "유닛 펼치기"}
                          </button>
                          {menuDraft?.unitId === unit.id && menuDraft.mode === "folder" && (
                            <div className="team-actions-form">
                              <input
                                value={menuDraft.name}
                                onChange={(event) => setMenuDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                                placeholder="폴더 이름"
                              />
                              <div className="team-actions-form-buttons">
                                <button
                                  type="button"
                                  disabled={!menuDraft.name.trim() || creatingFolderUnitId === unit.id}
                                  onClick={async () => {
                                    await createFolder(unit, menuDraft.name);
                                    closeUnitMenu();
                                  }}
                                >
                                  생성
                                </button>
                              </div>
                            </div>
                          )}
                          {menuDraft?.unitId === unit.id && menuDraft.mode === "list" && (
                            <div className="team-actions-form">
                              <input
                                value={menuDraft.name}
                                onChange={(event) => setMenuDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                                placeholder="리스트 이름"
                              />
                              <select
                                value={menuDraft.folderId}
                                onChange={(event) => setMenuDraft((prev) => (prev ? { ...prev, folderId: event.target.value } : prev))}
                              >
                                <option value="">폴더 없음</option>
                                {folders.filter((folder) => folder.unitId === unit.id).map((folder) => (
                                  <option key={folder.id} value={folder.id}>
                                    {folder.name}
                                  </option>
                                ))}
                              </select>
                              <div className="team-actions-form-buttons">
                                <button
                                  type="button"
                                  disabled={!menuDraft.name.trim() || creatingListUnitId === unit.id}
                                  onClick={async () => {
                                    await createList(unit, menuDraft.name, menuDraft.folderId || null);
                                    closeUnitMenu();
                                  }}
                                >
                                  생성
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </span>
                  </div>
                  {isOpen && (
                    <div className="channel-list">
                      {unitFolders.map((folder) => {
                        const folderLists = unitLists.filter((list) => list.folderId === folder.id);
                        return (
                          <div className={`channel-group folder-group ${recentFolderId === folder.id ? "recent" : ""}`} key={folder.id}>
                            {folderLists.map((list) => {
                              const listUnread = unreadByList.get(list.id) ?? 0;
                              return (
                                <button key={list.id} className={`channel-row ${selectedListId === list.id ? "active" : ""} ${recentListId === list.id ? "recent" : ""}`} onClick={() => onSelectList(list.id)}>
                                  <WorkspaceListScopeIcon title={list.name} />
                                  <span className="channel-copy">
                                    <strong>{list.name}</strong>
                                    <small>{list.defaultPhase ?? "ACTIVE"} · {listUnread > 0 ? `${listUnread} unread` : "caught up"}</small>
                                  </span>
                                  <span
                                    className={`favorite-toggle ${favoriteKeys.has(`list:${list.id}`) ? "active" : ""}`}
                                    title={favoriteKeys.has(`list:${list.id}`) ? "즐겨찾기 해제" : "즐겨찾기"}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleFavorite(`list:${list.id}`);
                                    }}
                                  >
                                    {favoriteKeys.has(`list:${list.id}`) ? "★" : "☆"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                      {unitLists.filter((list) => !list.folderId).map((list) => {
                        const listUnread = unreadByList.get(list.id) ?? 0;
                        return (
                          <button key={list.id} className={`channel-row ${selectedListId === list.id ? "active" : ""} ${recentListId === list.id ? "recent" : ""}`} onClick={() => onSelectList(list.id)}>
                            <WorkspaceListScopeIcon title={list.name} />
                            <span className="channel-copy">
                              <strong>{list.name}</strong>
                              <small>{list.defaultPhase ?? "ACTIVE"} · {listUnread > 0 ? `${listUnread} unread` : "caught up"}</small>
                            </span>
                            <span
                              className={`favorite-toggle ${favoriteKeys.has(`list:${list.id}`) ? "active" : ""}`}
                              title={favoriteKeys.has(`list:${list.id}`) ? "즐겨찾기 해제" : "즐겨찾기"}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleFavorite(`list:${list.id}`);
                              }}
                            >
                              {favoriteKeys.has(`list:${list.id}`) ? "★" : "☆"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
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

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  LEGACY_STATE_TO_STATUS_ID,
  INBOX_COMPONENTS,
  STATE_META,
  STRUCTURE_META,
  TEMPLATE_META,
  type Analytics,
  type AppData,
  type ApprovalLine,
  type ApprovalPolicy,
  type DecisionType,
  type FormFieldType,
  type InboxComponent,
  type Member,
  type Mention,
  type Note,
  type NotificationSettings,
  type Role,
  type Task,
  type TaskAttachment,
  type TaskState,
  type Template,
  type TemplateType,
  type ThreadComment,
  type TimelineEvent,
  type Unit,
  type UnitMember,
  type UnitMemberRole,
  type Folder,
  type TaskList
} from "@hwe/shared";
import { Badge, Centered, FilterShell, PageHeader, PanelHeader, PanelTitle, Select, Tabs } from "../components/ui";
import { request } from "../lib/api";
import { go } from "../lib/router";
import type { TaskDetail, TaskView } from "../lib/viewTypes";
import { TaskViewTabs } from "../features/tasks/TaskViewTabs";
import {
  TASK_DESCRIPTION_FIELD_KEY,
  TASK_FILES_FIELD_KEY,
  buildTaskBreadcrumb,
  decisionActions,
  decisionHint,
  decisionLabel,
  densitySignal,
  elapsed,
  eventLabel,
  formatDate,
  formatFailure,
  hasChangedSinceSeen,
  isBacklogTask,
  isDueToday,
  memberName,
  pct,
  priorityLabel,
  profileDisplayName,
  roleLabel,
  shortText,
  states,
  taskAccessOf,
  templateLabel,
  templateOrder,
  templateTone,
  templateTypes,
  useDebouncedEffect,
  type TaskViewMode
} from "../lib/domain";

export function TasksView({
  tasks,
  members,
  folders,
  lists,
  me,
  selectedUnitId,
  selectedListId,
  onReload
}: {
  tasks: TaskView[];
  members: Member[];
  folders: Folder[];
  lists: TaskList[];
  me: Member;
  selectedUnitId: string;
  selectedListId: string;
  onReload: () => Promise<void>;
}) {
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
  const [groupBy, setGroupBy] = useState<"none" | "state" | "assignee" | "folder" | "list">(() =>
    initialGroupBy === "state" || initialGroupBy === "assignee" || initialGroupBy === "folder" || initialGroupBy === "list" ? initialGroupBy : "none"
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

  const patchTask = async (taskId: string, patch: Partial<Pick<TaskView, "currentState" | "priority" | "parentId" | "workflowPhase" | "phaseOverride" | "workflowStatusId" | "templateId">>) => {
    await request(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(patch) });
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
  const quickFilterTabs = [
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
  ];
  const activeFilterChips = [
    quickFilter !== "all" ? quickFilterLabel[quickFilter] : "전체",
    filterState !== "ALL" ? STATE_META[filterState].label : null,
    filterType !== "ALL" ? TEMPLATE_META[filterType].label : null,
    query.trim() ? `검색 ${query.trim()}` : null,
    sortBy !== "manual" ? `정렬 ${sortBy}` : null,
    groupBy !== "none" ? `그룹 ${groupBy}` : null
  ].filter((chip): chip is string => Boolean(chip));

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Tasks / Execution"
        title="실행 관점 목록"
        description="결정 대상의 형상화, 정형화, 멘션, 결정 흐름을 같은 데이터 표면에서 조작합니다."
        meta={
          <div className="header-metric-strip">
            <span><b>{filteredTasks.length}</b><small>visible</small></span>
            <span><b>{tasks.length}</b><small>nodes</small></span>
            <span><b>{backlogTasks.length}</b><small>backlog</small></span>
          </div>
        }
      />
      <section className="task-control-deck">
        <TaskViewTabs value={viewMode} tasks={tasks} onChange={setViewMode} />
        <div className="task-query-bar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="결정 대상, 설명 검색" />
          <Tabs
            variant="chips"
            value={quickFilter}
            onChange={(value) => setQuickFilter(value as typeof quickFilter)}
            tabs={quickFilterTabs}
          />
          <button
            className="button secondary filter-drawer-button"
            onClick={() => setAdvancedFilterOpen((prev) => !prev)}
            aria-label={advancedFilterOpen ? "고급 필터 접기" : "고급 필터 펼치기"}
            title={filterSummary || "고급 필터"}
          >
            {advancedFilterOpen ? "필터 접기" : "필터 열기"}
          </button>
        </div>
        <div className="active-filter-strip">
          {activeFilterChips.map((chip) => <span className="signal-chip active" key={chip}>{chip}</span>)}
          {dragDisabled && <span className="signal-chip warning">수동 이동 잠김</span>}
        </div>
      </section>
      {advancedFilterOpen && (
        <div className="advanced-filter-shell">
          <FilterShell
            meta={<span>{filteredTasks.length}개 표시 · 정렬 {sortBy} · 그룹 {groupBy}</span>}
            action={<button className="button secondary" onClick={() => { setQuery(""); setFilterState("ALL"); setFilterType("ALL"); setSortBy("manual"); setGroupBy("none"); setQuickFilter("all"); }}>필터 초기화</button>}
          >
            <Select label="상태" tone="filter" value={filterState} onChange={(v) => setFilterState(v as typeof filterState)} options={states.map((v) => [v, v === "ALL" ? "전체 상태" : STATE_META[v].label])} />
            <Select label="유형" tone="filter" value={filterType} onChange={(v) => setFilterType(v as typeof filterType)} options={templateTypes.map((v) => [v, v === "ALL" ? "전체 유형" : TEMPLATE_META[v].label])} />
            <Select label="정렬" tone="filter" value={sortBy} onChange={setSortBy} options={[["manual", "수동 순서"], ["updated", "최근 수정순"], ["due", "기한순"], ["priority", "우선순위순"]]} />
            <Select
              label="그룹"
              tone="filter"
              value={groupBy}
              onChange={(value) => setGroupBy(value as typeof groupBy)}
              options={[["none", "그룹 없음"], ["state", "상태별"], ["assignee", "담당자별"], ["folder", "폴더별"], ["list", "리스트별"]]}
            />
          </FilterShell>
        </div>
      )}
      {viewMode === "board" && (
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
          <TaskTreeListView
            tasks={backlogTasks}
            allTasks={filteredTasks}
            members={members}
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
          />
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
            <TaskListPanel key={state} title={STATE_META[state].label} tasks={filteredTasks.filter((task) => task.currentState === state)} members={members} dragDisabled={dragDisabled} onPatch={patchTask} />
          ))}
        </div>
      ) : groupBy === "assignee" ? (
        <div className="grouped-list">
          {members.map((member) => (
            <TaskListPanel key={member.id} title={member.name} tasks={filteredTasks.filter((task) => task.assigneeIds.includes(member.id))} members={members} dragDisabled={dragDisabled} onPatch={patchTask} />
          ))}
        </div>
      ) : groupBy === "folder" ? (
        <div className="grouped-list">
          {(() => {
            const visibleFolders = selectedUnitId ? folders.filter((folder) => folder.unitId === selectedUnitId) : folders;
            return (
              <>
                {visibleFolders.map((folder) => (
                  <TaskListPanel
                    key={folder.id}
                    title={folder.name}
                    tasks={filteredTasks.filter((task) => task.folderId === folder.id)}
                    members={members}
                    dragDisabled={dragDisabled}
                    onPatch={patchTask}
                  />
                ))}
                <TaskListPanel
                  title="폴더 없음"
                  tasks={filteredTasks.filter((task) => !task.folderId)}
                  members={members}
                  dragDisabled={dragDisabled}
                  onPatch={patchTask}
                />
              </>
            );
          })()}
        </div>
      ) : groupBy === "list" ? (
        <div className="grouped-list">
          {(() => {
            const visibleLists = selectedUnitId ? lists.filter((list) => list.unitId === selectedUnitId) : lists;
            return (
              <>
                {visibleLists.map((list) => (
                  <TaskListPanel
                    key={list.id}
                    title={list.name}
                    tasks={filteredTasks.filter((task) => task.listId === list.id)}
                    members={members}
                    dragDisabled={dragDisabled}
                    onPatch={patchTask}
                  />
                ))}
                <TaskListPanel
                  title="리스트 없음"
                  tasks={filteredTasks.filter((task) => !task.listId)}
                  members={members}
                  dragDisabled={dragDisabled}
                  onPatch={patchTask}
                />
              </>
            );
          })()}
        </div>
      ) : (
        <TaskTreeListView
          tasks={filteredTasks}
          allTasks={tasks}
          members={members}
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
  dragDisabled: boolean;
  onQuickCreate: (title: string) => Promise<void>;
  onPatch: (taskId: string, patch: Partial<Pick<TaskView, "currentState" | "priority" | "parentId" | "workflowPhase" | "phaseOverride" | "workflowStatusId" | "templateId">>) => Promise<void>;
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
          <span>Object</span>
          <span>Owner</span>
          <span>Type</span>
          <span>Template</span>
          <span>Status</span>
          <span>Priority</span>
        </div>
        {(byParent.get(null) ?? []).map((task) => (
          <TaskTreeRow key={task.id} task={task} level={0} byParent={byParent} expanded={expanded} onToggle={toggle} members={members} dragDisabled={dragDisabled} onPatch={onPatch} focusedTaskId={focusedTaskId} setFocusedTaskId={setFocusedTaskId} draggingTaskId={draggingTaskId} dropTargetTaskId={dropTargetTaskId} setDraggingTaskId={setDraggingTaskId} setDropTargetTaskId={setDropTargetTaskId} onDropParent={moveByDrop} showSprintAction={showSprintAction} />
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
  dragDisabled: boolean;
  onPatch: (taskId: string, patch: Partial<Pick<TaskView, "currentState" | "priority" | "parentId" | "workflowPhase" | "phaseOverride" | "workflowStatusId" | "templateId">>) => Promise<void>;
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
  return (
    <>
      <div
        className={`task-row rich-row ${dropTargetTaskId === task.id ? "drop-target" : ""}`}
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
        <TaskTreeRow key={child.id} task={child} level={level + 1} byParent={byParent} expanded={expanded} onToggle={onToggle} members={members} dragDisabled={dragDisabled} onPatch={onPatch} focusedTaskId={focusedTaskId} setFocusedTaskId={setFocusedTaskId} draggingTaskId={draggingTaskId} dropTargetTaskId={dropTargetTaskId} setDraggingTaskId={setDraggingTaskId} setDropTargetTaskId={setDropTargetTaskId} onDropParent={onDropParent} showSprintAction={showSprintAction} />
      ))}
    </>
  );
}

function TaskListPanel({
  title,
  tasks,
  members,
  dragDisabled,
  quickMove,
  onQuickMove,
  selectable,
  selectedTaskIds,
  onToggleSelect,
  onSelectAll,
  onPatch,
  onRowDragStart,
  onRowDragEnd
}: {
  title: string;
  tasks: TaskView[];
  members: Member[];
  dragDisabled: boolean;
  quickMove?: { label: string; toState: TaskState };
  onQuickMove?: (task: TaskView) => void;
  selectable?: boolean;
  selectedTaskIds?: Set<string>;
  onToggleSelect?: (taskId: string) => void;
  onSelectAll?: () => void;
  onPatch: (taskId: string, patch: Partial<Pick<TaskView, "currentState" | "priority" | "parentId" | "workflowPhase" | "phaseOverride" | "workflowStatusId">>) => Promise<void>;
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
      </div>
      <div className="task-table">
        <div className="task-row rich-row table-head">
          <span />
          <span>Decision object</span>
          <span>Owner / signal</span>
          <span>Type</span>
          <span>Action</span>
          <span>Status</span>
          <span>Priority</span>
        </div>
        {tasks.map((task) => (
          <div key={task.id} className="task-row rich-row">
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
            <span>{templateLabel(task.templateType)}</span>
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
  onPatch: (taskId: string, patch: Partial<Pick<TaskView, "currentState" | "priority" | "parentId" | "workflowPhase" | "phaseOverride" | "workflowStatusId">>) => Promise<void>;
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
                <article className="board-card" key={task.id}>
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

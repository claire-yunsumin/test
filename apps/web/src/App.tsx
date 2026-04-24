import { useEffect, useState } from "react";
import type { AppData } from "@hwe/shared";
import { Centered } from "./components/ui";
import { Shell } from "./layout/Shell";
import { request } from "./lib/api";
import { currentRoute, go, type Route } from "./lib/router";
import type { TaskView } from "./lib/viewTypes";
import { AnalyticsView } from "./pages/AnalyticsPage";
import { DecisionGraphView } from "./pages/DecisionGraphPage";
import { InboxView } from "./pages/InboxPage";
import { TaskWorkspace } from "./pages/TaskDetailPage";
import { TasksView } from "./pages/TasksPage";
import {
  AccessControlView,
  GlobalApprovalPolicySettingsView,
  GlobalUnitManagementView,
  NotificationSettingsView,
  ProfileSettingsView,
  TemplatesView,
  UnitSettingsView
} from "./pages/settings/SettingsPages";

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
      tasks={data.tasks as TaskView[]}
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
      ) : route.path === "/settings/access" || route.path === "/settings/members" || route.path === "/settings/permissions" ? (
        <AccessControlView members={data.members} units={data.units} unitMembers={data.unitMembers} onReload={reload} />
      ) : route.path === "/settings" || route.path === "/settings/profile" ? (
        <ProfileSettingsView me={data.me} onNavigate={go} />
      ) : route.path === "/settings/units" ? (
        <GlobalUnitManagementView units={data.units} onSelectUnit={setUnit} onNavigate={go} onReload={reload} />
      ) : route.path === "/settings/approval-policies" ? (
        <GlobalApprovalPolicySettingsView approvalPolicies={data.approvalPolicies} members={data.members} units={data.units} onReload={reload} />
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

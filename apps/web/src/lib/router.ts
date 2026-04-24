export type Route = {
  path: string;
  taskId?: string;
  unitId?: string;
};

export function currentRoute(): Route {
  const path = window.location.pathname === "/" ? "/hierarchy" : window.location.pathname;
  const taskMatch = path.match(/^\/tasks\/([^/]+)/);
  const unitMatch = path.match(/^\/units\/([^/]+)\/settings$/);
  return { path, taskId: taskMatch?.[1], unitId: unitMatch?.[1] };
}

export function go(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

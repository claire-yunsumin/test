export type Route = {
  path: string;
  taskId?: string;
};

export function currentRoute(): Route {
  const path = window.location.pathname === "/" ? "/hierarchy" : window.location.pathname;
  const taskMatch = path.match(/^\/tasks\/([^/]+)/);
  return { path, taskId: taskMatch?.[1] };
}

export function go(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

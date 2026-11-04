type RouteHandler = (params: Record<string, string>) => void;

interface Route {
  pattern: RegExp;
  keys: string[];
  handler: RouteHandler;
}

const routes: Route[] = [];
let lastNonDetail = "#";

export function route(pattern: string, handler: RouteHandler): void {
  const keys: string[] = [];
  const regex = new RegExp(
    "^" + pattern.replace(/:([a-z]+)/g, (_: string, k: string) => { keys.push(k); return "([^/]+)"; }) + "$"
  );
  routes.push({ pattern: regex, keys, handler });
}

export function navigate(hash: string): void {
  if (!hash.startsWith("#card-")) lastNonDetail = hash;
  location.hash = hash;
}

export function goBack(): void {
  navigate(lastNonDetail);
}

export function currentHash(): string {
  return location.hash || "#";
}

function dispatch(): void {
  const hash = location.hash || "#";
  if (!hash.startsWith("#card-")) lastNonDetail = hash;
  for (const r of routes) {
    const m = hash.match(r.pattern);
    if (m) {
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => params[k] = m[i + 1]);
      r.handler(params);
      return;
    }
  }
}

export function startRouter(): void {
  window.addEventListener("hashchange", dispatch);
  dispatch();
}

const routes = [];
let lastNonDetail = "#";
export function route(pattern, handler) {
    const keys = [];
    const regex = new RegExp("^" + pattern.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
    routes.push({ pattern: regex, keys, handler });
}
export function navigate(hash) {
    if (!hash.startsWith("#card-"))
        lastNonDetail = hash;
    location.hash = hash;
}
export function goBack() {
    navigate(lastNonDetail);
}
export function currentHash() {
    return location.hash || "#";
}
function dispatch() {
    const hash = location.hash || "#";
    if (!hash.startsWith("#card-"))
        lastNonDetail = hash;
    for (const r of routes) {
        const m = hash.match(r.pattern);
        if (m) {
            const params = {};
            r.keys.forEach((k, i) => params[k] = m[i + 1]);
            r.handler(params);
            return;
        }
    }
}
export function startRouter() {
    window.addEventListener("hashchange", dispatch);
    dispatch();
}

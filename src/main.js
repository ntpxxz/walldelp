import "./styles/main.css";
import { createStoreAsync } from "./store/index";
import { initStore, subscribe } from "./state";
import { route, startRouter, currentHash } from "./router";
import { mountWallet, unmountWallet } from "./views/wallet";
import { mountDetail, unmountDetail } from "./views/detail";
import { mountCalendar, unmountCalendar } from "./views/calendar";
import { mountForecast, unmountForecast } from "./views/forecast";
import { openAddPlan } from "./dialogs/addPlan";
import { esc } from "./utils";
// App shell
const headerEl = document.getElementById("app-header");
const mainEl = document.getElementById("app-main");
let currentView = "";
function renderHeader(hash) {
    const isDetail = hash.startsWith("#card-");
    if (isDetail) {
        headerEl.innerHTML = "";
        return;
    }
    const tabs = [
        { hash: "#", label: "บัตรของฉัน" },
        { hash: "#calendar", label: "ปฏิทิน" },
        { hash: "#forecast", label: "ภาระผ่อนล่วงหน้า" },
    ];
    headerEl.innerHTML = `
    <div class="app-header">
      <div class="page">
        <h1>กระเป๋าผ่อน</h1>
        <div class="header-actions">
          <button class="btn sm primary" id="add-btn">+ เพิ่มรายการผ่อน</button>
          <button class="btn sm ghost" id="theme-btn" aria-label="สลับธีม">◑</button>
        </div>
      </div>
      <div class="page">
        <nav class="tabs" aria-label="เมนูหลัก">
          ${tabs.map(t => `
            <a href="${esc(t.hash)}" ${(hash === t.hash || (hash === "" && t.hash === "#")) ? 'aria-current="page"' : ""}>
              ${esc(t.label)}
            </a>`).join("")}
        </nav>
      </div>
    </div>`;
    document.getElementById("add-btn")?.addEventListener("click", () => openAddPlan(null));
    document.getElementById("theme-btn")?.addEventListener("click", toggleTheme);
}
function mountView(hash) {
    if (currentView === hash)
        return;
    unmountCurrent();
    currentView = hash;
    if (!hash || hash === "#") {
        mountWallet(mainEl);
    }
    else if (hash === "#calendar") {
        mountCalendar(mainEl);
    }
    else if (hash === "#forecast") {
        mountForecast(mainEl);
    }
    else if (hash.startsWith("#card-")) {
        const id = hash.replace("#card-", "");
        mountDetail(mainEl, id);
    }
}
function unmountCurrent() {
    unmountWallet();
    unmountDetail();
    unmountCalendar();
    unmountForecast();
}
function navigate(hash) {
    renderHeader(hash);
    mountView(hash);
}
// Routes
route("#", () => navigate("#"));
route("#calendar", () => navigate("#calendar"));
route("#forecast", () => navigate("#forecast"));
route("#card-:id", ({ id }) => navigate(`#card-${id}`));
// Theme persistence
function toggleTheme() {
    const root = document.documentElement;
    const current = root.dataset.theme;
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("theme", next);
}
function restoreTheme() {
    const saved = localStorage.getItem("theme");
    if (saved)
        document.documentElement.dataset.theme = saved;
}
async function init() {
    restoreTheme();
    // Show loading state
    mainEl.innerHTML = `<div class="loading">กำลังโหลด…</div>`;
    renderHeader(currentHash());
    const store = await createStoreAsync();
    if (import.meta.env.VITE_BACKEND === "firebase") {
        try {
            await store.signIn();
        }
        catch (e) {
            console.error("sign in failed", e);
        }
    }
    await initStore(store);
    // Start routing (will trigger initial render)
    startRouter();
    // Re-render header when state changes (e.g., theme, sample data cleared)
    subscribe(() => {
        const h = currentHash();
        if (!h.startsWith("#card-"))
            renderHeader(h);
    });
}
init();

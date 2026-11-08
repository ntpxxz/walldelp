import { getState, subscribe, clearSample } from "../state";
import { derive, itemStatus } from "../calc";
import { fmtMoney, todayStr, esc } from "../utils";
import type { Item } from "../types";
import { openAddPlan } from "../dialogs/addPlan";
import { navigate } from "../router";
import { showToast } from "../components/toast";

type Filter = "active" | "done" | "all";

let currentFilter: Filter = "active";
let unsub: (() => void) | null = null;

export function mountWallet(container: HTMLElement): void {
  unsub?.();
  render(container);
  unsub = subscribe(() => render(container));
}

export function unmountWallet(): void {
  unsub?.();
  unsub = null;
}

function render(container: HTMLElement): void {
  container.innerHTML = buildHTML();
  attachEvents(container);
}

function buildHTML(): string {
  const { items, sample } = getState();
  const today = todayStr();

  // Summary tile values
  let totalOwe = 0, totalRemain = 0, nearCount = 0, overdueCount = 0;
  for (const it of items) {
    const d = derive(it);
    if (d.done) continue;
    totalOwe += d.owe;
    totalRemain += d.remain;
    const diff = d.next ? Math.round((new Date(d.next.due).getTime() - new Date(today).getTime()) / 86400000) : null;
    if (diff !== null && diff < 0) overdueCount++;
    else if (diff !== null && diff <= 7) nearCount++;
  }

  const active = items.filter(i => !derive(i).done);
  const done = items.filter(i => derive(i).done);

  let visible: Item[];
  if (currentFilter === "active") visible = active;
  else if (currentFilter === "done") visible = done;
  else visible = items;

  // Sort: active by next due date, then done
  if (currentFilter !== "done") {
    visible = [...visible].sort((a, b) => {
      const da = derive(a), db = derive(b);
      if (da.done && !db.done) return 1;
      if (!da.done && db.done) return -1;
      if (!da.done && !db.done && da.next && db.next) return da.next.due.localeCompare(db.next.due);
      return 0;
    });
  }

  return `
    ${sample ? `
      <div class="sample-banner">
        <strong>ข้อมูลตัวอย่าง</strong> <span>– แอปกำลังแสดงข้อมูลทดสอบ</span>
        <span class="spacer"></span>
        <button class="btn sm danger" id="clear-sample">ล้างตัวอย่าง</button>
      </div>` : ""}
    <div class="tiles">
      <div class="tile tile-1">
        <span class="caption">ต้องจ่ายงวดถัดไปรวม</span>
        <div><div class="val">${fmtMoney(totalOwe)}</div></div>
      </div>
      <div class="tile tile-2">
        <span class="caption">ยอดคงเหลือทั้งหมด</span>
        <div><div class="val">${fmtMoney(totalRemain)}</div></div>
      </div>
      <div class="tile tile-3">
        <span class="caption">ใกล้ครบกำหนด (7 วัน)</span>
        <div><div class="val">${nearCount}</div><div class="meta">รายการ</div></div>
      </div>
      <div class="tile tile-4">
        <span class="caption">เลยกำหนด</span>
        <div><div class="val ${overdueCount > 0 ? "bad" : ""}">${overdueCount}</div><div class="meta">รายการ</div></div>
      </div>
    </div>

    <div class="flex-between mt-4">
      <div class="filters">
        <button aria-pressed="${currentFilter === "active"}" data-filter="active">กำลังผ่อน</button>
        <button aria-pressed="${currentFilter === "done"}" data-filter="done">ผ่อนครบแล้ว</button>
        <button aria-pressed="${currentFilter === "all"}" data-filter="all">ทั้งหมด</button>
      </div>
    </div>

    <div class="card-grid mt-12">
      ${visible.map(it => cardHTML(it, today)).join("")}
      ${currentFilter !== "done" ? `
        <button class="cc-add" id="add-card-btn" aria-label="เพิ่มรายการผ่อน">
          <span class="cc-add-icon">＋</span>
          <span class="cc-add-label">เพิ่มรายการผ่อน</span>
        </button>` : ""}
    </div>

    ${visible.length === 0 && currentFilter === "active" ? `
      <div class="empty">
        <div class="empty-icon"></div>
        <p>ยังไม่มีรายการผ่อน<br>กด <strong>+ เพิ่มรายการผ่อน</strong> เพื่อเริ่มต้น</p>
      </div>` : ""}
  `;
}

function cardHTML(it: Item, today: string): string {
  const d = derive(it);
  const st = itemStatus(it, today);
  const pillCls = st.solid ? (st.cls === "bad" ? "bad" : "warn-solid") : st.cls;
  const pct = d.pct.toFixed(1);

  return `
    <button class="cc c-${esc(it.color)} clickable" data-id="${esc(it.id)}" aria-label="${esc(it.name)}">
      <div class="cc-top">
        <span class="pill ${pillCls}"><span>${esc(st.text)}</span></span>
        <span class="cc-provider">${esc(it.provider)}</span>
      </div>
      <div class="cc-bottom">
        <div class="cc-name">${esc(it.name)}</div>
        <div class="cc-num">งวด ${d.paidN + (d.done ? 0 : 1)}/${it.months} · ต้องจ่าย ${fmtMoney(d.owe)}</div>
        <div class="cc-dot">คงเหลือ ${fmtMoney(d.remain)} · ${Math.round(d.pct)}%</div>
      </div>
      <div class="cc-progress"><div class="cc-progress-fill" style="width:${pct}%"></div></div>
    </button>`;
}

function attachEvents(container: HTMLElement): void {
  container.querySelector("#clear-sample")?.addEventListener("click", async () => {
    if (!confirm("ล้างข้อมูลตัวอย่างทั้งหมด?")) return;
    await clearSample();
    showToast("ล้างข้อมูลตัวอย่างแล้ว", "good");
  });

  container.querySelector("#add-card-btn")?.addEventListener("click", () => openAddPlan(null));

  container.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.filter as Filter;
      render(container);
    });
  });

  container.querySelectorAll<HTMLButtonElement>("[data-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id!;
      navigate(`#card-${id}`);
    });
  });
}

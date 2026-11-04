import { getState, subscribe } from "../state";
import { derive } from "../calc";
import { fmtMoney, fmtMonthThai, addMonthsToYM, currentYM, todayStr, daysInMonth, esc } from "../utils";
import type { Item, Row } from "../types";
import { openPaymentDialog } from "../dialogs/payment";

let currentYm = currentYM();
let unsub: (() => void) | null = null;

export function mountCalendar(container: HTMLElement): void {
  currentYm = currentYM();
  unsub?.();
  render(container);
  unsub = subscribe(() => render(container));
}

export function unmountCalendar(): void {
  unsub?.();
  unsub = null;
}

interface CalEntry { item: Item; row: Row; covered: number; full: boolean; overdue: boolean; partial: boolean }

function getEntries(ym: string): CalEntry[] {
  const { items } = getState();
  const entries: CalEntry[] = [];
  for (const item of items) {
    const d = derive(item);
    for (const row of d.rows) {
      if (row.due.startsWith(ym)) {
        entries.push({
          item, row,
          covered: row.covered,
          full: row.full,
          overdue: !row.full && row.due < todayStr(),
          partial: row.covered > 0 && !row.full,
        });
      }
    }
  }
  return entries;
}

function render(container: HTMLElement): void {
  const today = todayStr();
  const entries = getEntries(currentYm);
  const [y, m] = currentYm.split("-").map(Number);
  const dim = daysInMonth(y, m);
  const firstDow = new Date(y, m - 1, 1).getDay(); // 0=Sun
  const isToday = currentYm === currentYM();

  // Summary tile values
  const totalDue = entries.reduce((s, e) => s + e.row.amount, 0);
  const totalCovered = entries.reduce((s, e) => s + e.covered, 0);
  const totalOwed = Math.max(0, totalDue - totalCovered);
  const overdueCount = entries.filter(e => e.overdue && !e.full).length;

  // Build day map
  const dayMap: Record<number, CalEntry[]> = {};
  for (const e of entries) {
    const day = Number(e.row.due.split("-")[2]);
    (dayMap[day] = dayMap[day] || []).push(e);
  }

  // Calendar grid
  const cells: string[] = [];
  const totalCells = Math.ceil((firstDow + dim) / 7) * 7;
  for (let i = 0; i < totalCells; i++) {
    const day = i - firstDow + 1;
    if (day < 1 || day > dim) {
      cells.push(`<div class="cal-day other-month"></div>`);
      continue;
    }
    const isoDay = `${currentYm}-${String(day).padStart(2, "0")}`;
    const isToday2 = isoDay === today;
    const dayEntries = dayMap[day] || [];
    const chips = dayEntries.map(e => {
      const cls = e.full ? "paid" : e.partial ? "partial" : e.overdue ? "overdue" : "";
      return `<span class="ev ${cls}" style="background:var(--k-${esc(e.item.color)});color:${["mist","lime"].includes(e.item.color) ? "var(--carbon)" : "#fff"}">${esc(e.item.name)}</span>`;
    }).join("");
    cells.push(`<div class="cal-day ${isToday2 ? "today" : ""}"><div class="cal-day-num">${day}</div>${chips}</div>`);
  }

  // List
  const listRows = entries.sort((a, b) => a.row.due.localeCompare(b.row.due)).map(e => {
    const d = derive(e.item);
    const isNext = d.next?.due === e.row.due && d.next.num === e.row.num;
    const statusText = e.full ? "ชำระครบ" : e.overdue ? "เลยกำหนด" : e.partial ? `ค้าง ${fmtMoney(e.row.amount - e.covered)}` : "รอชำระ";
    return `
      <div class="cal-list-row">
        <span class="cal-swatch" style="background:var(--k-${esc(e.item.color)})"></span>
        <div class="cal-row-info">
          <div class="cal-row-name">${esc(e.item.name)}</div>
          <div class="cal-row-sub">${esc(e.item.provider)} · งวด ${e.row.num}/${e.item.months} · ${esc(statusText)}</div>
        </div>
        <div class="cal-row-amt">${fmtMoney(e.row.amount)}</div>
        ${isNext && !e.full ? `<button class="btn sm primary" data-pay-item="${esc(e.item.id)}">บันทึกการชำระ</button>` : ""}
      </div>`;
  }).join("");

  container.innerHTML = `
  <div class="page">
    <div class="cal-header">
      <h2>${fmtMonthThai(currentYm)}</h2>
      <div class="cal-nav">
        <button id="cal-prev" aria-label="เดือนก่อนหน้า">‹</button>
        <button id="cal-next" aria-label="เดือนถัดไป">›</button>
      </div>
      ${!isToday ? `<button class="btn sm ghost" id="cal-today">เดือนนี้</button>` : ""}
    </div>

    <div class="tiles" style="margin-bottom:16px">
      <div class="tile tile-1"><span class="caption">ครบกำหนดเดือนนี้</span><div><div class="val">${fmtMoney(totalDue)}</div></div></div>
      <div class="tile tile-2"><span class="caption">จ่ายแล้ว</span><div><div class="val">${fmtMoney(totalCovered)}</div></div></div>
      <div class="tile tile-3"><span class="caption">ยังต้องจ่าย</span><div><div class="val">${fmtMoney(totalOwed)}</div></div></div>
      <div class="tile tile-4"><span class="caption">เลยกำหนดในเดือนนี้</span><div><div class="val ${overdueCount > 0 ? "bad" : ""}">${overdueCount}</div><div class="meta">รายการ</div></div></div>
    </div>

    <div class="cal-weekdays">
      ${["อา","จ","อ","พ","พฤ","ศ","ส"].map(d => `<div class="cal-weekday">${d}</div>`).join("")}
    </div>
    <div class="cal-grid" role="grid" aria-label="${fmtMonthThai(currentYm)}">${cells.join("")}</div>

    <div class="section-gap">
      <div class="section-title">รายการครบกำหนด</div>
      <div class="cal-list">
        ${listRows || `<p class="text-muted" style="font-size:14px;padding:12px 0">ไม่มีรายการในเดือนนี้</p>`}
      </div>
    </div>
    <div style="height:32px"></div>
  </div>`;

  attachEvents(container);
}

function attachEvents(container: HTMLElement): void {
  container.querySelector("#cal-prev")?.addEventListener("click", () => {
    currentYm = addMonthsToYM(currentYm, -1);
    render(container);
  });
  container.querySelector("#cal-next")?.addEventListener("click", () => {
    currentYm = addMonthsToYM(currentYm, 1);
    render(container);
  });
  container.querySelector("#cal-today")?.addEventListener("click", () => {
    currentYm = currentYM();
    render(container);
  });

  container.querySelectorAll<HTMLButtonElement>("[data-pay-item]").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = getState().items.find(i => i.id === btn.dataset.payItem);
      if (item) openPaymentDialog(item, null);
    });
  });
}

import { getState, subscribe } from "../state";
import { derive } from "../calc";
import { fmtMoney, fmtMonthThai, fmtMonthShort, addMonthsToYM, currentYM, compareYM, esc } from "../utils";

const CARD_COLORS: Record<string, string> = {
  carbon: "#101114", mist: "#B9BFC7", electric: "#2547E8",
  violet: "#5F31C4", lime: "#A9D82B", steel: "#55606D",
};

let unsub: (() => void) | null = null;
let resizeObserver: ResizeObserver | null = null;

export function mountForecast(container: HTMLElement): void {
  unsub?.();
  render(container);
  unsub = subscribe(() => render(container));
}

export function unmountForecast(): void {
  unsub?.();
  unsub = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
}

interface Bucket { [itemId: string]: number }
interface MonthData { ym: string; bucket: Bucket; total: number }

function buildBuckets(): MonthData[] {
  const { items } = getState();
  const today = currentYM();
  const map = new Map<string, Bucket>();

  for (const item of items) {
    const d = derive(item);
    if (d.done) continue;
    for (const row of d.rows) {
      if (row.full) continue;
      const ym = row.due < `${today}-01` ? today : row.due.slice(0, 7);
      if (!map.has(ym)) map.set(ym, {});
      const bucket = map.get(ym)!;
      bucket[item.id] = (bucket[item.id] || 0) + (row.amount - row.covered);
    }
  }

  const months: MonthData[] = [...map.entries()]
    .sort(([a], [b]) => compareYM(a, b))
    .map(([ym, bucket]) => ({
      ym, bucket,
      total: Object.values(bucket).reduce((s, v) => s + v, 0),
    }));
  return months;
}

function render(container: HTMLElement): void {
  const { items } = getState();
  const months = buildBuckets();
  const today = currentYM();
  const nextYm = addMonthsToYM(today, 1);

  const thisMo = months.find(m => m.ym === today);
  const nextMo = months.find(m => m.ym === nextYm);
  const peak = months.reduce<MonthData | null>((mx, m) => (!mx || m.total > mx.total) ? m : mx, null);
  const lastMo = months[months.length - 1];

  // Overdue (past months rolled into current)
  let overdueAmt = 0;
  for (const item of items) {
    const d = derive(item);
    if (d.done) continue;
    for (const row of d.rows) {
      if (!row.full && row.due < `${today}-01`) overdueAmt += row.amount - row.covered;
    }
  }

  const monthsLeft = lastMo ? (() => {
    const [y1, m1] = today.split("-").map(Number);
    const [y2, m2] = lastMo.ym.split("-").map(Number);
    return (y2 - y1) * 12 + (m2 - m1);
  })() : 0;

  // Burden reduction list: sort items by their last due month
  const activeItems = items.filter(i => !derive(i).done).sort((a, b) => {
    const da = derive(a), db = derive(b);
    const lastA = da.rows[da.rows.length - 1].due;
    const lastB = db.rows[db.rows.length - 1].due;
    return lastA.localeCompare(lastB);
  });

  const burdenList = activeItems.map(it => {
    const d = derive(it);
    const lastDue = d.rows[d.rows.length - 1].due.slice(0, 7);
    return `
      <div class="burden-row">
        <span class="legend-dot" style="background:var(--k-${esc(it.color)})"></span>
        <span class="burden-row-name">${esc(it.name)}</span>
        <span class="burden-row-end">${fmtMonthThai(lastDue)}</span>
        <span class="burden-row-delta">−${fmtMoney(d.per)}/เดือน</span>
      </div>`;
  }).join("");

  // Table
  const allItemIds = [...new Set(months.flatMap(m => Object.keys(m.bucket)))];
  const tableHeaders = allItemIds.map(id => {
    const it = items.find(i => i.id === id);
    return `<th class="num">${esc(it?.name ?? id)}</th>`;
  }).join("");
  const tableRows = months.map(mo => `
    <tr>
      <td>${fmtMonthShort(mo.ym)}</td>
      ${allItemIds.map(id => `<td class="num">${mo.bucket[id] ? fmtMoney(mo.bucket[id]) : "–"}</td>`).join("")}
      <td class="num"><strong>${fmtMoney(mo.total)}</strong></td>
    </tr>`).join("");

  container.innerHTML = `
  <div class="page">
    <div class="tiles" style="margin-top:14px">
      <div class="tile tile-1">
        <span class="caption">เดือนนี้ต้องจ่าย</span>
        <div>
          <div class="val">${fmtMoney(thisMo?.total ?? 0)}</div>
          ${overdueAmt > 0 ? `<div class="meta">รวมค้าง ${fmtMoney(overdueAmt)}</div>` : ""}
        </div>
      </div>
      <div class="tile tile-2">
        <span class="caption">เดือนหน้า</span>
        <div><div class="val">${fmtMoney(nextMo?.total ?? 0)}</div></div>
      </div>
      <div class="tile tile-3">
        <span class="caption">เดือนที่หนักที่สุด</span>
        <div>
          <div class="val">${fmtMoney(peak?.total ?? 0)}</div>
          ${peak ? `<div class="meta">${fmtMonthShort(peak.ym)}</div>` : ""}
        </div>
      </div>
      <div class="tile tile-4">
        <span class="caption">ผ่อนหมดทุกรายการ</span>
        <div>
          <div class="val">${lastMo ? fmtMonthShort(lastMo.ym) : "–"}</div>
          <div class="meta">${monthsLeft > 0 ? `อีก ${monthsLeft} เดือน` : lastMo ? "เดือนนี้" : ""}</div>
        </div>
      </div>
    </div>

    <div class="section-gap">
      <div class="section-title">ภาระผ่อนรายเดือน</div>
      <div class="chart-wrap">
        <canvas id="forecast-canvas" role="img" aria-label="แผนภูมิภาระผ่อนรายเดือน" height="220"></canvas>
      </div>
      <div class="chart-legend mt-8">
        ${items.filter(i => !derive(i).done).map(it => `
          <div class="legend-item">
            <span class="legend-dot" style="background:var(--k-${esc(it.color)})"></span>
            <span>${esc(it.name)}</span>
          </div>`).join("")}
      </div>
    </div>

    <div class="section-gap">
      <div class="section-title">ภาระจะลดลงเมื่อไร</div>
      <div class="burden-list">${burdenList || `<p class="text-muted" style="font-size:14px">ไม่มีรายการที่กำลังผ่อน</p>`}</div>
    </div>

    ${months.length > 0 ? `
    <div class="section-gap">
      <details class="table-toggle">
        <summary>ดูเป็นตาราง</summary>
        <div class="table-wrap mt-8">
          <table class="data-table">
            <thead><tr><th>เดือน</th>${tableHeaders}<th class="num">รวม</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </details>
    </div>` : ""}
    <div style="height:32px"></div>
  </div>`;

  drawChart(container, months, items.filter(i => !derive(i).done));
  setupChartResize(container, months, items.filter(i => !derive(i).done));
}

function setupChartResize(container: HTMLElement, months: MonthData[], items: ReturnType<typeof getState>["items"]): void {
  resizeObserver?.disconnect();
  const canvas = container.querySelector<HTMLCanvasElement>("#forecast-canvas");
  if (!canvas) return;
  resizeObserver = new ResizeObserver(() => drawChart(container, months, items));
  resizeObserver.observe(canvas);
}

function drawChart(container: HTMLElement, months: MonthData[], items: ReturnType<typeof getState>["items"]): void {
  const canvas = container.querySelector<HTMLCanvasElement>("#forecast-canvas");
  if (!canvas || months.length === 0) return;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.offsetWidth || 600;
  const H = 220;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.height = H + "px";
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const isDark = document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme:dark)").matches);

  const PAD_L = 60, PAD_R = 16, PAD_T = 16, PAD_B = 36;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const maxVal = Math.max(...months.map(m => m.total), 1);
  const n = months.length;
  const slotW = chartW / n;
  const barW = Math.min(40, slotW * 0.64);
  const GAP = 2;

  const lineColor = isDark ? "#2C3037" : "#D5D9DE";
  const inkColor = isDark ? "#9AA3AE" : "#55606D";

  // Gridlines (4)
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = PAD_T + chartH - (g / 4) * chartH;
    ctx.beginPath();
    ctx.setLineDash(g === 0 ? [] : [3, 4]);
    ctx.moveTo(PAD_L, y);
    ctx.lineTo(PAD_L + chartW, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Y axis labels
  ctx.fillStyle = inkColor;
  ctx.font = `500 11px IBM Plex Mono, monospace`;
  ctx.textAlign = "right";
  for (let g = 0; g <= 4; g++) {
    const v = (g / 4) * maxVal;
    const y = PAD_T + chartH - (g / 4) * chartH;
    ctx.fillText(shortMoney(v), PAD_L - 4, y + 4);
  }

  // Sort items: longest-running plan at bottom
  const sortedItems = [...items].sort((a, b) => {
    const da = derive(a), db = derive(b);
    return db.rows[db.rows.length - 1].due.localeCompare(da.rows[da.rows.length - 1].due);
  });

  // Draw bars
  const today = currentYM();
  const tooltipData: { x: number; ym: string; total: number; breakdown: Array<{name: string; color: string; val: number}> }[] = [];

  for (let i = 0; i < n; i++) {
    const mo = months[i];
    const cx = PAD_L + i * slotW + slotW / 2;
    const x = cx - barW / 2;
    let yBottom = PAD_T + chartH;
    const breakdown: Array<{name: string; color: string; val: number}> = [];

    for (const it of sortedItems) {
      const val = mo.bucket[it.id] || 0;
      if (val === 0) continue;
      const segH = (val / maxVal) * chartH;
      const color = getComputedStyle(document.documentElement).getPropertyValue(`--k-${it.color}`).trim() || CARD_COLORS[it.color];
      ctx.fillStyle = color;
      const isTop = it === sortedItems.find(s => mo.bucket[s.id] > 0 &&
        sortedItems.slice(sortedItems.indexOf(s) + 1).every(ss => !mo.bucket[ss.id]));
      if (isTop) {
        ctx.beginPath();
        ctx.moveTo(x, yBottom - segH + 4);
        ctx.arcTo(x, yBottom - segH, x + 4, yBottom - segH, 4);
        ctx.arcTo(x + barW, yBottom - segH, x + barW, yBottom - segH + 4, 4);
        ctx.lineTo(x + barW, yBottom);
        ctx.lineTo(x, yBottom);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(x, yBottom - segH, barW, segH - GAP);
      }
      breakdown.push({ name: it.name, color, val });
      yBottom -= segH;
    }

    tooltipData.push({ x: cx, ym: mo.ym, total: mo.total, breakdown });

    // X axis labels
    const isCurrentMonth = mo.ym === today;
    const isPeak = mo === months.reduce((mx, m) => m.total > mx.total ? m : mx, months[0]);
    const labelDiff = isPeak ? Math.abs(i - 0) : 0;
    if (isCurrentMonth || (isPeak && mo.ym !== today && labelDiff > 1)) {
      ctx.fillStyle = inkColor;
      ctx.font = `600 11px IBM Plex Mono, monospace`;
      ctx.textAlign = "center";
      ctx.fillText(fmtMonthShort(mo.ym), cx, PAD_T + chartH + 20);
    }
  }

  // Simple tooltip on canvas hover
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const hit = tooltipData.find(t => Math.abs(t.x - mx) < slotW / 2);
    canvas.title = hit
      ? `${fmtMonthThai(hit.ym)}\n${hit.breakdown.map(b => `${b.name}: ${fmtMoney(b.val)}`).join("\n")}\nรวม: ${fmtMoney(hit.total)}`
      : "";
  };
}

function shortMoney(v: number): string {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return String(Math.round(v));
}

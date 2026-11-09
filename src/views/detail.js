import { getState, subscribe, deleteItem, deletePayment, slipSrc } from "../state";
import { derive, itemStatus, rowStatus } from "../calc";
import { fmtMoney, fmtDateShort, todayStr, esc } from "../utils";
import { openAddPlan } from "../dialogs/addPlan";
import { openPaymentDialog } from "../dialogs/payment";
import { openSlipViewer } from "../dialogs/slipViewer";
import { goBack } from "../router";
import { showToast } from "../components/toast";
let unsub = null;
let currentId = "";
export function mountDetail(container, id) {
    currentId = id;
    unsub?.();
    render(container);
    unsub = subscribe(() => { if (currentId === id)
        render(container); });
}
export function unmountDetail() {
    unsub?.();
    unsub = null;
    currentId = "";
}
function render(container) {
    const item = getState().items.find(i => i.id === currentId);
    if (!item) {
        container.innerHTML = `<div class="page loading">ไม่พบรายการ</div>`;
        return;
    }
    container.innerHTML = buildHTML(item);
    attachEvents(container, item);
}
function buildHTML(it) {
    const today = todayStr();
    const d = derive(it);
    const st = itemStatus(it, today);
    const pillCls = st.solid ? (st.cls === "bad" ? "bad" : "warn-solid") : st.cls;
    const pct = d.pct.toFixed(1);
    const hintText = d.done ? "" : `ต้องจ่ายอีก ${fmtMoney(d.owe)} เพื่อปิดงวดที่ ${d.next.num} (ครบ ${fmtDateShort(d.next.due)})`;
    const rateText = it.rate === 0 ? "ผ่อน 0%" : `${it.rate}% ต่อเดือน`;
    const interestText = it.rate === 0 ? "0%" : fmtMoney(d.interest);
    const lastDue = d.rows[d.rows.length - 1].due;
    const payHistory = [...it.payments].sort((a, b) => b.date.localeCompare(a.date));
    const totalPaid = it.payments.reduce((s, p) => s + p.amount, 0);
    return `
  <div class="page">
    <div class="detail-header">
      <button class="back-btn" id="back-btn">← กลับ</button>
      <span class="spacer"></span>
      <button class="btn sm" id="edit-btn">แก้ไข</button>
      <button class="btn sm danger" id="delete-btn">ลบ</button>
    </div>

    <div class="detail-card-wrap">
      <div class="cc c-${esc(it.color)}" role="img" aria-label="${esc(it.name)}">
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
      </div>
    </div>

    <div class="detail-stats mt-16">
      <div class="stat-box"><div class="stat-label">ยอดผ่อนรวม</div><div class="stat-val">${fmtMoney(d.grand)}</div></div>
      <div class="stat-box"><div class="stat-label">ดอกเบี้ยรวม</div><div class="stat-val">${interestText}</div></div>
      <div class="stat-box"><div class="stat-label">ชำระแล้ว</div><div class="stat-val text-good">${fmtMoney(d.paidAmt)}</div></div>
      <div class="stat-box"><div class="stat-label">คงเหลือ</div><div class="stat-val ${d.remain > 0 ? "text-warn" : "text-good"}">${fmtMoney(d.remain)}</div></div>
    </div>

    <div class="mt-12">
      <div class="flex-between" style="margin-bottom:4px">
        <span class="text-muted" style="font-size:13.5px">จ่ายแล้ว ${d.paidN} จาก ${it.months} งวด · ${pct}%</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>

    <div class="pay-action mt-12">
      <button class="btn primary" id="pay-btn">+ บันทึกการชำระ</button>
      ${hintText ? `<span class="hint-line">${esc(hintText)}</span>` : ""}
    </div>

    <div class="section-gap">
      <div class="section-title">ข้อมูลรายการ</div>
      <div class="panel">
        <dl class="meta-list">
          <dt>บัตร / ไฟแนนซ์</dt><dd>${esc(it.provider || "–")}</dd>
          <dt>ราคาสินค้า</dt><dd>${fmtMoney(it.total)}</dd>
          <dt>อัตราดอกเบี้ย</dt><dd>${esc(rateText)}</dd>
          <dt>เริ่มผ่อนงวดแรก</dt><dd>${esc(it.start)}</dd>
          <dt>ครบกำหนดทุกวันที่</dt><dd>${it.dueDay}</dd>
          <dt>งวดสุดท้าย</dt><dd>${fmtDateShort(lastDue)}</dd>
          ${it.note ? `<dt>หมายเหตุ</dt><dd>${esc(it.note)}</dd>` : ""}
        </dl>
      </div>
    </div>

    <div class="section-gap">
      <div class="section-title">ตารางการผ่อน</div>
      <div class="table-wrap">
        <table class="data-table schedule-tbl" aria-label="ตารางการผ่อน">
          <thead><tr>
            <th>งวด</th><th>กำหนดชำระ</th><th class="num">ยอดงวด</th><th class="num">ชำระแล้ว</th><th>สถานะ</th><th></th>
          </tr></thead>
          <tbody>
            ${d.rows.map(row => rowHTML(row, d.next, today)).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div class="section-gap">
      <div class="section-title">ประวัติการชำระ</div>
      ${payHistory.length === 0 ? `<p class="text-muted" style="font-size:14px">ยังไม่มีการชำระ</p>` : `
      <div class="table-wrap">
        <table class="data-table pay-history" aria-label="ประวัติการชำระ">
          <thead><tr><th>วันที่</th><th class="num">จำนวนเงิน</th><th>สลิป</th><th>หมายเหตุ</th><th></th></tr></thead>
          <tbody>
            ${payHistory.map(p => payRowHTML(p, it.id)).join("")}
            <tr class="total-row"><td colspan="2" style="text-align:right"><strong>รวม ${fmtMoney(totalPaid)}</strong></td><td colspan="3"></td></tr>
          </tbody>
        </table>
      </div>`}
    </div>
    <div style="height:32px"></div>
  </div>`;
}
function rowHTML(row, next, today) {
    const rs = rowStatus(row, next, today);
    let statusHTML = "";
    switch (rs) {
        case "paid":
            statusHTML = `<span class="st good">ชำระครบ ${row.paidAt ? fmtDateShort(row.paidAt) : ""}</span>`;
            break;
        case "part": {
            const over = row.due < today;
            statusHTML = `<span class="st ${over ? "bad" : "warn"}">จ่ายแล้ว ${fmtMoney(row.covered)} · ค้าง ${fmtMoney(row.amount - row.covered)}</span>`;
            break;
        }
        case "over":
            statusHTML = `<span class="st bad">เลยกำหนด</span>`;
            break;
        case "soon":
            statusHTML = `<span class="st warn">ใกล้ครบกำหนด</span>`;
            break;
        default: statusHTML = `<span class="st muted">รอชำระ</span>`;
    }
    const isNext = row === next;
    return `<tr class="${isNext ? "next-row" : ""}">
    <td>${row.num}</td>
    <td>${fmtDateShort(row.due)}</td>
    <td class="num">${fmtMoney(row.amount)}</td>
    <td class="num">${row.covered > 0 ? fmtMoney(row.covered) : "–"}</td>
    <td>${statusHTML}</td>
    <td>${isNext ? `<button class="btn sm" data-pay-row="${row.num}">จ่ายงวดนี้</button>` : ""}</td>
  </tr>`;
}
function payRowHTML(p, _itemId) {
    const slipHTML = p.slip ? `<button class="btn ghost sm" data-slip-pay="${esc(p.id)}" aria-label="ดูสลิป">ดูสลิป</button>` : "–";
    return `<tr>
    <td>${fmtDateShort(p.date)}</td>
    <td class="num">${fmtMoney(p.amount)}</td>
    <td>${slipHTML}</td>
    <td>${esc(p.note || "–")}</td>
    <td>
      <button class="btn ghost sm" data-edit-pay="${esc(p.id)}">แก้ไข</button>
      <button class="btn ghost sm danger" data-del-pay="${esc(p.id)}">ลบ</button>
    </td>
  </tr>`;
}
function attachEvents(container, it) {
    container.querySelector("#back-btn")?.addEventListener("click", goBack);
    container.querySelector("#edit-btn")?.addEventListener("click", () => openAddPlan(it));
    container.querySelector("#delete-btn")?.addEventListener("click", async () => {
        if (!confirm(`ลบ "${it.name}"?\nข้อมูลการผ่อนและประวัติการจ่ายจะหายไปทั้งหมด`))
            return;
        await deleteItem(it.id);
        showToast("ลบรายการแล้ว", "good");
        goBack();
    });
    container.querySelector("#pay-btn")?.addEventListener("click", () => openPaymentDialog(it, null));
    container.querySelectorAll("[data-pay-row]").forEach(btn => {
        btn.addEventListener("click", () => openPaymentDialog(it, null));
    });
    container.querySelectorAll("[data-edit-pay]").forEach(btn => {
        const p = it.payments.find(x => x.id === btn.dataset.editPay);
        if (p)
            btn.addEventListener("click", () => openPaymentDialog(it, p));
    });
    container.querySelectorAll("[data-del-pay]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const p = it.payments.find(x => x.id === btn.dataset.delPay);
            if (!p)
                return;
            if (!confirm("ลบการชำระนี้?"))
                return;
            await deletePayment(it.id, p.id);
            showToast("ลบการชำระแล้ว", "good");
        });
    });
    container.querySelectorAll("[data-slip-pay]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const p = it.payments.find(x => x.id === btn.dataset.slipPay);
            if (!p?.slip)
                return;
            const src = await slipSrc(p.slip);
            openSlipViewer(src, it.name, p.date, p.amount);
        });
    });
}

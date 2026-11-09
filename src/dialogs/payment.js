import { savePayment, uploadSlip, deleteSlip } from "../state";
import { derive, r2 } from "../calc";
import { fmtMoney, todayStr, genPaymentId, esc, resizeImage } from "../utils";
import { showToast } from "../components/toast";
let scrim = null;
let pendingSlipBlob = null;
let removedSlip = null;
export function openPaymentDialog(item, existing) {
    closePaymentDialog();
    pendingSlipBlob = null;
    removedSlip = null;
    const isEdit = existing !== null;
    scrim = document.createElement("div");
    scrim.className = "scrim";
    scrim.setAttribute("role", "dialog");
    scrim.setAttribute("aria-modal", "true");
    scrim.setAttribute("aria-label", isEdit ? "แก้ไขการชำระ" : "บันทึกการชำระ");
    scrim.innerHTML = dialogHTML(item, existing);
    document.body.appendChild(scrim);
    const dialog = scrim.querySelector(".dialog");
    dialog.querySelector("#f-amount")?.focus();
    scrim.addEventListener("click", (e) => { if (e.target === scrim)
        closePaymentDialog(); });
    document.addEventListener("keydown", onEsc);
    attachEvents(scrim, item, existing);
}
export function closePaymentDialog() {
    scrim?.remove();
    scrim = null;
    document.removeEventListener("keydown", onEsc);
}
function onEsc(e) {
    if (e.key === "Escape")
        closePaymentDialog();
}
function dialogHTML(item, existing) {
    const d = derive(item);
    const isEdit = existing !== null;
    const defaultAmt = isEdit ? existing.amount.toFixed(2) : d.owe > 0 ? d.owe.toFixed(2) : "";
    const today = todayStr();
    return `
  <div class="dialog">
    <div class="dialog-title">${isEdit ? "แก้ไขการชำระ" : "บันทึกการชำระ"}</div>
    <div class="form-row">
      <label for="f-amount">ยอดที่จ่าย (บาท) <span style="color:var(--bad)">*</span></label>
      <input id="f-amount" type="number" min="0.01" step="0.01" value="${esc(defaultAmt)}" placeholder="0.00" autocomplete="off">
      <div class="error" id="e-amount"></div>
      <div class="quick-btns">
        ${!isEdit && d.owe > 0 ? `<button type="button" class="quick-btn" data-amt="${d.owe.toFixed(2)}">ยอดงวดนี้ ${fmtMoney(d.owe)}</button>` : ""}
        ${!isEdit && d.owe > 0 && d.remain > d.owe ? `<button type="button" class="quick-btn" data-amt="${Math.min(r2(d.owe + d.per), d.remain).toFixed(2)}">จ่าย 2 งวด ${fmtMoney(Math.min(r2(d.owe + d.per), d.remain))}</button>` : ""}
        ${!isEdit && d.remain > 0 ? `<button type="button" class="quick-btn" data-amt="${d.remain.toFixed(2)}">ปิดยอดทั้งหมด ${fmtMoney(d.remain)}</button>` : ""}
      </div>
    </div>
    <div class="form-row">
      <label for="f-date">วันที่จ่าย <span style="color:var(--bad)">*</span></label>
      <input id="f-date" type="date" value="${existing?.date ?? today}" max="${today}">
      <div class="error" id="e-date"></div>
    </div>
    <div class="form-row">
      <label for="f-note">หมายเหตุ</label>
      <input id="f-note" type="text" maxlength="80" value="${esc(existing?.note ?? "")}" placeholder="ไม่บังคับ">
    </div>
    <div class="form-row">
      <label>รูปสลิป</label>
      ${existing?.slip ? `
        <div class="slip-preview-wrap" id="slip-preview">
          <img class="slip-preview-img" id="slip-img" src="" alt="สลิป">
          <div>
            <button type="button" class="btn sm ghost" id="remove-slip">ลบสลิป</button>
          </div>
        </div>` : ""}
      <label class="slip-upload-area" id="slip-area">
        <input type="file" id="f-slip" accept="image/*">
        <span id="slip-label">แนบสลิป (ไม่บังคับ)</span>
      </label>
    </div>
    <div id="pay-preview" class="payment-preview" style="display:none"></div>
    <div class="dialog-actions">
      <button type="button" class="btn ghost" id="cancel-pay">ยกเลิก</button>
      <button type="button" class="btn primary" id="submit-pay">${isEdit ? "บันทึกการแก้ไข" : "บันทึกการชำระ"}</button>
    </div>
  </div>`;
}
function buildPreview(item, amtStr, existing) {
    const d = derive(item);
    const amt = parseFloat(amtStr) || 0;
    if (amt <= 0)
        return "";
    const ownAmt = existing?.amount ?? 0;
    const effectiveRemain = r2(d.remain + ownAmt);
    if (amt > effectiveRemain + 0.005) {
        return `<span class="over-warn">ยอดเกินที่ค้างอยู่ ใส่ได้ไม่เกิน ${fmtMoney(effectiveRemain)}</span>`;
    }
    // Simulate the payment to show preview
    const simulatedPayments = [...item.payments.filter(p => p.id !== existing?.id), { id: "sim", date: todayStr(), amount: amt, note: "" }];
    const simItem = { ...item, payments: simulatedPayments };
    const sd = derive(simItem);
    if (sd.done)
        return "ปิดยอดครบทุกงวด";
    return `หลังบันทึก: คงเหลือ ${fmtMoney(sd.remain)} · ชำระครบแล้ว ${sd.paidN} จาก ${item.months} งวด${sd.next ? ` · งวดที่ ${sd.next.num} ค้างอีก ${fmtMoney(sd.owe)}` : ""}`;
}
function attachEvents(scrim, item, existing) {
    const amtIn = scrim.querySelector("#f-amount");
    const preview = scrim.querySelector("#pay-preview");
    const slipArea = scrim.querySelector("#slip-area");
    const slipInput = scrim.querySelector("#f-slip");
    const slipLabel = scrim.querySelector("#slip-label");
    function updatePreview() {
        const html = buildPreview(item, amtIn.value, existing);
        if (html) {
            preview.innerHTML = html;
            preview.style.display = "";
        }
        else
            preview.style.display = "none";
        // Red border if over
        const isOver = html.includes("over-warn");
        amtIn.style.borderColor = isOver ? "var(--bad)" : "";
    }
    amtIn.addEventListener("input", updatePreview);
    updatePreview();
    // Quick amount buttons
    scrim.querySelectorAll("[data-amt]").forEach(btn => {
        btn.addEventListener("click", () => {
            amtIn.value = btn.dataset.amt;
            amtIn.dispatchEvent(new Event("input"));
        });
    });
    // Slip handling
    if (existing?.slip) {
        // Load existing slip preview
        const slipImg = scrim.querySelector("#slip-img");
        if (slipImg) {
            import("../state").then(({ slipSrc }) => {
                slipSrc(existing.slip).then(src => { slipImg.src = src; });
            });
        }
        scrim.querySelector("#remove-slip")?.addEventListener("click", () => {
            removedSlip = existing.slip;
            const preview = scrim.querySelector("#slip-preview");
            if (preview)
                preview.style.display = "none";
            slipArea.style.display = "";
            slipLabel.textContent = "แนบสลิปใหม่";
        });
    }
    slipInput.addEventListener("change", async () => {
        const file = slipInput.files?.[0];
        if (!file)
            return;
        if (!file.type.startsWith("image/")) {
            showToast("รองรับเฉพาะไฟล์รูปภาพ", "bad");
            return;
        }
        try {
            pendingSlipBlob = await resizeImage(file, 1600, 0.82);
            slipLabel.textContent = file.name;
        }
        catch {
            if (file.name.toLowerCase().endsWith(".heic")) {
                showToast("ไม่รองรับ HEIC นอก Safari กรุณาใช้ JPG หรือ PNG", "bad");
            }
            else {
                showToast("ไม่สามารถอ่านไฟล์นี้ได้", "bad");
            }
        }
    });
    scrim.querySelector("#cancel-pay")?.addEventListener("click", closePaymentDialog);
    scrim.querySelector("#submit-pay")?.addEventListener("click", async () => {
        const amt = parseFloat(amtIn.value);
        const date = scrim.querySelector("#f-date").value;
        const note = scrim.querySelector("#f-note").value.trim();
        // Validation
        const ownAmt = existing?.amount ?? 0;
        const d = derive(item);
        const effectiveRemain = r2(d.remain + ownAmt);
        let hasError = false;
        const eAmt = scrim.querySelector("#e-amount");
        const eDate = scrim.querySelector("#e-date");
        if (!amt || amt <= 0) {
            eAmt.textContent = "กรุณาใส่จำนวนเงิน";
            hasError = true;
        }
        else if (amt > effectiveRemain + 0.005) {
            eAmt.textContent = `ยอดเกินที่ค้างอยู่ ใส่ได้ไม่เกิน ${fmtMoney(effectiveRemain)}`;
            hasError = true;
        }
        else
            eAmt.textContent = "";
        if (!date) {
            eDate.textContent = "กรุณาเลือกวันที่";
            hasError = true;
        }
        else
            eDate.textContent = "";
        if (hasError)
            return;
        const payId = existing?.id ?? genPaymentId();
        let slip = existing?.slip;
        // Handle slip changes
        if (removedSlip) {
            await deleteSlip(removedSlip).catch(() => { });
            slip = undefined;
        }
        if (pendingSlipBlob) {
            try {
                slip = await uploadSlip(pendingSlipBlob, { itemId: item.id, paymentId: payId });
            }
            catch {
                showToast("อัปโหลดสลิปไม่สำเร็จ บันทึกโดยไม่มีสลิป", "bad");
                slip = undefined;
            }
        }
        const payment = { id: payId, date, amount: amt, note, ...(slip ? { slip } : {}) };
        closePaymentDialog();
        await savePayment(item.id, payment);
        showToast(existing ? "แก้ไขการชำระแล้ว" : "บันทึกการชำระแล้ว", "good");
    });
}

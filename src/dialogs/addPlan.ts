import { saveItem } from "../state";
import { r2 } from "../calc";
import { fmtMoney, currentYM, genId, esc } from "../utils";
import type { Item, ColorKey } from "../types";
import { showToast } from "../components/toast";

const COLORS: { key: ColorKey; name: string; hex: string }[] = [
  { key: "carbon", name: "Carbon", hex: "#101114" },
  { key: "mist", name: "Mist", hex: "#EEF0F2" },
  { key: "electric", name: "Electric", hex: "#2547E8" },
  { key: "violet", name: "Violet", hex: "#5F31C4" },
  { key: "lime", name: "Lime", hex: "#C6F04A" },
  { key: "steel", name: "Steel", hex: "#55606D" },
];

let scrim: HTMLElement | null = null;

export function openAddPlan(existing: Item | null): void {
  closeAddPlan();
  const isEdit = existing !== null;
  scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.setAttribute("role", "dialog");
  scrim.setAttribute("aria-modal", "true");
  scrim.setAttribute("aria-label", isEdit ? "แก้ไขรายการผ่อน" : "เพิ่มรายการผ่อน");
  scrim.innerHTML = dialogHTML(existing);
  document.body.appendChild(scrim);

  const dialog = scrim.querySelector<HTMLElement>(".dialog")!;
  const firstInput = dialog.querySelector<HTMLElement>("input,select");
  firstInput?.focus();

  scrim.addEventListener("click", (e) => { if (e.target === scrim) closeAddPlan(); });
  document.addEventListener("keydown", onEsc);
  attachDialogEvents(scrim, existing);
}

export function closeAddPlan(): void {
  scrim?.remove();
  scrim = null;
  document.removeEventListener("keydown", onEsc);
}

function onEsc(e: KeyboardEvent): void {
  if (e.key === "Escape") closeAddPlan();
}

function dialogHTML(it: Item | null): string {
  const isEdit = it !== null;
  const v = it ?? {
    name: "", provider: "", total: "", months: "", rate: "0",
    dueDay: "5", start: currentYM(), color: "electric" as ColorKey, note: "",
  };
  return `
  <div class="dialog">
    <div class="dialog-title">${isEdit ? "แก้ไขรายการผ่อน" : "เพิ่มรายการผ่อน"}</div>
    <form id="plan-form" novalidate>
      <div class="form-row">
        <label for="f-name">ชื่อสินค้า / รายการ <span style="color:var(--bad)">*</span></label>
        <input id="f-name" type="text" maxlength="60" value="${esc(String(v.name))}" placeholder="เช่น iPhone 16 Pro" autocomplete="off">
        <div class="error" id="e-name"></div>
      </div>
      <div class="form-row">
        <label for="f-provider">ผ่อนผ่านบัตร / ไฟแนนซ์</label>
        <input id="f-provider" type="text" maxlength="40" value="${esc(String(v.provider))}" placeholder="เช่น KTC VISA, KBANK Easy Buy">
      </div>
      <div class="form-2col">
        <div class="form-row">
          <label for="f-total">ราคาสินค้า (บาท) <span style="color:var(--bad)">*</span></label>
          <input id="f-total" type="number" min="0.01" step="0.01" value="${v.total || ""}" placeholder="0.00">
          <div class="error" id="e-total"></div>
        </div>
        <div class="form-row">
          <label for="f-months">จำนวนงวด (เดือน) <span style="color:var(--bad)">*</span></label>
          <input id="f-months" type="number" min="1" max="120" step="1" value="${v.months || ""}" placeholder="1–120">
          <div class="error" id="e-months"></div>
        </div>
      </div>
      <div class="form-2col">
        <div class="form-row">
          <label for="f-rate">ดอกเบี้ย % ต่อเดือน</label>
          <input id="f-rate" type="number" min="0" max="10" step="0.01" value="${v.rate ?? "0"}" placeholder="0.00">
          <div class="error" id="e-rate"></div>
        </div>
        <div class="form-row">
          <label for="f-dueday">ครบกำหนดทุกวันที่ <span style="color:var(--bad)">*</span></label>
          <input id="f-dueday" type="number" min="1" max="31" step="1" value="${v.dueDay || ""}" placeholder="1–31">
          <div class="error" id="e-dueday"></div>
        </div>
      </div>
      <div class="form-row">
        <label for="f-start">เดือนที่เริ่มผ่อนงวดแรก <span style="color:var(--bad)">*</span></label>
        <input id="f-start" type="month" value="${esc(String(v.start))}">
        <div class="error" id="e-start"></div>
      </div>
      <div id="calc-preview" class="calc-preview" style="display:none"></div>
      <div class="form-row">
        <label>สีบัตร</label>
        <div class="swatches" role="radiogroup" aria-label="สีบัตร">
          ${COLORS.map(c => `
            <button type="button" role="radio" aria-checked="${v.color === c.key}" class="swatch c-${c.key} ${v.color === c.key ? "selected" : ""}" data-color="${c.key}">
              <div class="swatch-name">${c.name}</div>
              <div class="swatch-hex">${c.hex}</div>
            </button>`).join("")}
        </div>
      </div>
      <div class="form-row">
        <label for="f-note">หมายเหตุ</label>
        <input id="f-note" type="text" maxlength="200" value="${esc(String(v.note || ""))}" placeholder="ไม่บังคับ">
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn ghost" id="cancel-plan">ยกเลิก</button>
        <button type="submit" class="btn primary">${isEdit ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}</button>
      </div>
    </form>
  </div>`;
}

function calcPreview(total: number, months: number, rate: number): string {
  if (!total || !months) return "";
  const interest = total * (rate / 100) * months;
  const grand = r2(total + interest);
  const per = Math.floor((grand / months) * 100) / 100;
  const last = r2(grand - per * (months - 1));
  const perText = per === last ? fmtMoney(per) : `${fmtMoney(per)} (งวดสุดท้าย ${fmtMoney(last)})`;
  return `ผ่อนงวดละ <strong>${perText}</strong> × ${months} งวด · รวม <strong>${fmtMoney(grand)}</strong>${rate > 0 ? ` (ดอกเบี้ย ${fmtMoney(interest)})` : ""}`;
}

function attachDialogEvents(scrim: HTMLElement, existing: Item | null): void {
  let selectedColor: ColorKey = existing?.color ?? "electric";

  const form = scrim.querySelector<HTMLFormElement>("#plan-form")!;
  const totalIn = form.querySelector<HTMLInputElement>("#f-total")!;
  const monthsIn = form.querySelector<HTMLInputElement>("#f-months")!;
  const rateIn = form.querySelector<HTMLInputElement>("#f-rate")!;
  const preview = form.querySelector<HTMLElement>("#calc-preview")!;

  function updatePreview(): void {
    const t = parseFloat(totalIn.value) || 0;
    const m = parseInt(monthsIn.value) || 0;
    const r = parseFloat(rateIn.value) || 0;
    const html = calcPreview(t, m, r);
    if (html) { preview.innerHTML = html; preview.style.display = ""; }
    else preview.style.display = "none";
  }

  [totalIn, monthsIn, rateIn].forEach(el => el.addEventListener("input", updatePreview));
  updatePreview();

  scrim.querySelectorAll<HTMLButtonElement>("[data-color]").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedColor = btn.dataset.color as ColorKey;
      scrim.querySelectorAll("[data-color]").forEach(b => {
        b.classList.toggle("selected", b === btn);
        b.setAttribute("aria-checked", String(b === btn));
      });
    });
  });

  scrim.querySelector("#cancel-plan")?.addEventListener("click", closeAddPlan);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errors = validate(form);
    if (errors > 0) return;

    const item: Item = {
      id: existing?.id ?? genId(),
      name: (form.querySelector<HTMLInputElement>("#f-name")!.value.trim()),
      provider: (form.querySelector<HTMLInputElement>("#f-provider")!.value.trim()),
      total: parseFloat(form.querySelector<HTMLInputElement>("#f-total")!.value),
      months: parseInt(form.querySelector<HTMLInputElement>("#f-months")!.value),
      rate: parseFloat(form.querySelector<HTMLInputElement>("#f-rate")!.value) || 0,
      dueDay: parseInt(form.querySelector<HTMLInputElement>("#f-dueday")!.value),
      start: form.querySelector<HTMLInputElement>("#f-start")!.value,
      color: selectedColor,
      note: form.querySelector<HTMLInputElement>("#f-note")!.value.trim(),
      payments: existing?.payments ?? [],
    };

    closeAddPlan();
    await saveItem(item);
    showToast(existing ? "แก้ไขรายการแล้ว" : "เพิ่มรายการแล้ว", "good");
  });
}

function setError(form: HTMLFormElement, id: string, msg: string): void {
  const el = form.querySelector<HTMLElement>(`#${id}`);
  if (el) el.textContent = msg;
}
function clearError(form: HTMLFormElement, id: string): void {
  const el = form.querySelector<HTMLElement>(`#${id}`);
  if (el) el.textContent = "";
}

function validate(form: HTMLFormElement): number {
  let errors = 0;
  const name = form.querySelector<HTMLInputElement>("#f-name")!.value.trim();
  if (!name) { setError(form, "e-name", "ใส่ชื่อรายการก่อนบันทึก"); errors++; }
  else clearError(form, "e-name");

  const total = parseFloat(form.querySelector<HTMLInputElement>("#f-total")!.value);
  if (!total || total <= 0) { setError(form, "e-total", "ราคาสินค้าต้องมากกว่า 0"); errors++; }
  else clearError(form, "e-total");

  const months = parseInt(form.querySelector<HTMLInputElement>("#f-months")!.value);
  if (!months || months < 1 || months > 120) { setError(form, "e-months", "จำนวนงวดต้องอยู่ระหว่าง 1–120"); errors++; }
  else clearError(form, "e-months");

  const rate = parseFloat(form.querySelector<HTMLInputElement>("#f-rate")!.value);
  if (isNaN(rate) || rate < 0 || rate > 10) { setError(form, "e-rate", "ดอกเบี้ยต้องไม่ติดลบ"); errors++; }
  else clearError(form, "e-rate");

  const dueDay = parseInt(form.querySelector<HTMLInputElement>("#f-dueday")!.value);
  if (!dueDay || dueDay < 1 || dueDay > 31) { setError(form, "e-dueday", "วันครบกำหนดต้องอยู่ระหว่าง 1–31"); errors++; }
  else clearError(form, "e-dueday");

  const start = form.querySelector<HTMLInputElement>("#f-start")!.value;
  if (!start || !/^\d{4}-\d{2}$/.test(start)) { setError(form, "e-start", "เลือกเดือนที่เริ่มผ่อน"); errors++; }
  else clearError(form, "e-start");

  return errors;
}

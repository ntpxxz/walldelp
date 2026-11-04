import { fmtDateLong, fmtMoney, esc } from "../utils";

let scrim: HTMLElement | null = null;

export function openSlipViewer(src: string, itemName: string, date: string, amount: number): void {
  closeSlipViewer();
  scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.setAttribute("role", "dialog");
  scrim.setAttribute("aria-modal", "true");
  scrim.setAttribute("aria-label", "ดูสลิป");
  scrim.innerHTML = `
  <div class="slip-viewer">
    <img class="slip-viewer-img" src="${esc(src)}" alt="สลิปการโอนเงิน">
    <div class="slip-viewer-info">
      <div style="font-weight:700;font-size:15px">${esc(itemName)}</div>
      <div class="text-muted" style="font-size:13.5px">${fmtDateLong(date)} · ${fmtMoney(amount)}</div>
    </div>
    <div class="slip-viewer-actions">
      <button class="btn" id="close-slip">ปิด</button>
    </div>
  </div>`;
  document.body.appendChild(scrim);

  scrim.querySelector("#close-slip")?.addEventListener("click", closeSlipViewer);
  scrim.addEventListener("click", (e) => { if (e.target === scrim) closeSlipViewer(); });
  document.addEventListener("keydown", onEsc);
  scrim.querySelector<HTMLElement>("#close-slip")?.focus();
}

export function closeSlipViewer(): void {
  scrim?.remove();
  scrim = null;
  document.removeEventListener("keydown", onEsc);
}

function onEsc(e: KeyboardEvent): void {
  if (e.key === "Escape") closeSlipViewer();
}

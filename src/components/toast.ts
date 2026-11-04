let toastEl: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function showToast(msg: string, type: "good" | "bad" | "info" = "info"): void {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "toast";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.className = `toast-${type} visible`;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { toastEl!.classList.remove("visible"); }, 2600);
}

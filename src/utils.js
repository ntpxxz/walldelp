export function esc(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
export function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function currentYM() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function pad(n) {
    return String(n).padStart(2, "0");
}
export function toBE(year) {
    return year + 543;
}
const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MONTHS_LONG = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
export function fmtMoney(n, forceDecimals = false) {
    const abs = Math.abs(n);
    const formatted = abs.toLocaleString("th-TH", {
        minimumFractionDigits: forceDecimals ? 2 : 0,
        maximumFractionDigits: 2,
    });
    return (n < 0 ? "-" : "") + "฿" + formatted;
}
export function fmtDateShort(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return `${d} ${MONTHS_SHORT[m - 1]} ${String(toBE(y)).slice(-2)}`;
}
export function fmtDateLong(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return `${d} ${MONTHS_LONG[m - 1]} ${toBE(y)}`;
}
export function fmtMonthThai(ym) {
    const [y, m] = ym.split("-").map(Number);
    return `${MONTHS_LONG[m - 1]} ${toBE(y)}`;
}
export function fmtMonthShort(ym) {
    const [y, m] = ym.split("-").map(Number);
    return `${MONTHS_SHORT[m - 1]} ${String(toBE(y)).slice(-2)}`;
}
export function daysDiff(from, to) {
    const a = new Date(from).getTime();
    const b = new Date(to).getTime();
    return Math.round((b - a) / 86400000);
}
export function addMonthsToYM(ym, n) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}
export function genId() {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 6);
    return `i${t}${r}`;
}
export function genPaymentId() {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 6);
    return `p${t}${r}`;
}
export function ymFromDate(iso) {
    return iso.slice(0, 7);
}
export function compareYM(a, b) {
    return a.localeCompare(b);
}
export function resizeImage(file, maxPx, quality) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let w = img.naturalWidth, h = img.naturalHeight;
            if (w > maxPx || h > maxPx) {
                if (w >= h) {
                    h = Math.round(h * maxPx / w);
                    w = maxPx;
                }
                else {
                    w = Math.round(w * maxPx / h);
                    h = maxPx;
                }
            }
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            canvas.getContext("2d").drawImage(img, 0, 0, w, h);
            canvas.toBlob(b => b ? resolve(b) : reject(new Error("canvas_blob")), "image/jpeg", quality);
        };
        img.onerror = reject;
        img.src = url;
    });
}

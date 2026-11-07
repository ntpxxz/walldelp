import { addMonthsToYM, daysInMonth } from "./utils";
export const EPS = 0.005;
export function r2(n) {
    return Math.round(n * 100) / 100;
}
function dueDate(start, i, dueDay) {
    const ym = addMonthsToYM(start, i);
    const [y, m] = ym.split("-").map(Number);
    const day = Math.min(dueDay, daysInMonth(y, m));
    return `${ym}-${String(day).padStart(2, "0")}`;
}
export function derive(item) {
    const { total, rate, months, start, dueDay, payments } = item;
    const interest = total * (rate / 100) * months;
    const grand = r2(total + interest);
    const per = Math.floor((grand / months) * 100) / 100;
    const last = r2(grand - per * (months - 1));
    const rows = [];
    let cumDue = 0;
    for (let i = 0; i < months; i++) {
        const amount = i === months - 1 ? last : per;
        cumDue = r2(cumDue + amount);
        rows.push({ idx: i, num: i + 1, amount, due: dueDate(start, i, dueDay), cumDue, covered: 0, full: false, paidAt: null });
    }
    const paidAmt = r2(payments.reduce((s, p) => s + p.amount, 0));
    for (let i = 0; i < rows.length; i++) {
        const prevCum = i > 0 ? rows[i - 1].cumDue : 0;
        rows[i].covered = Math.min(Math.max(r2(paidAmt - prevCum), 0), rows[i].amount);
        rows[i].full = rows[i].covered >= rows[i].amount - EPS;
    }
    // paidAt: date of the payment that pushed cumulative total to >= cumDue[i] - EPS
    const sorted = [...payments].sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    let ri = 0;
    for (const p of sorted) {
        running = r2(running + p.amount);
        while (ri < rows.length && running >= rows[ri].cumDue - EPS) {
            if (!rows[ri].paidAt)
                rows[ri].paidAt = p.date;
            ri++;
        }
    }
    const next = rows.find(r => !r.full) ?? null;
    const paidN = rows.filter(r => r.full).length;
    const owe = next ? r2(next.cumDue - paidAmt) : 0;
    const remain = Math.max(0, r2(grand - paidAmt));
    const pct = Math.min(100, grand > 0 ? (paidAmt / grand) * 100 : 0);
    const done = next === null;
    return { interest, grand, per, last, rows, paidAmt, paidN, next, owe, remain, pct, done };
}
export function itemStatus(item, today) {
    const d = derive(item);
    if (d.done)
        return { text: "ผ่อนครบแล้ว", cls: "good", solid: false };
    const diff = Math.round((new Date(d.next.due).getTime() - new Date(today).getTime()) / 86400000);
    if (diff < 0)
        return { text: `เลยกำหนด ${-diff} วัน`, cls: "bad", solid: true };
    if (diff === 0)
        return { text: "ครบกำหนดวันนี้", cls: "warn", solid: true };
    if (diff <= 7)
        return { text: `อีก ${diff} วัน`, cls: "warn", solid: false };
    return { text: `ครบ ${fmtDueShort(d.next.due)}`, cls: "info", solid: false };
}
function fmtDueShort(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    return `${d} ${months[m - 1]} ${String(y + 543).slice(-2)}`;
}
export function rowStatus(row, next, today) {
    if (row.full)
        return "paid";
    if (row.covered > 0)
        return "part";
    const diff = Math.round((new Date(row.due).getTime() - new Date(today).getTime()) / 86400000);
    if (diff < 0)
        return "over";
    if (row === next && diff >= 0 && diff <= 7)
        return "soon";
    return "wait";
}

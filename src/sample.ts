import type { Item, AppState, ColorKey } from "./types";

const OLD_COLOR_MAP: Record<string, ColorKey> = {
  obsidian: "carbon", ocean: "electric", rose: "violet",
  emerald: "lime", gold: "steel", sunset: "lime",
};

export function legacyMigrate(raw: unknown): AppState {
  const r = raw as Record<string, unknown>;
  const items = ((r.items as unknown[]) || []).map((it: unknown) => {
    const item = it as Record<string, unknown>;
    const color = migrateColor(String(item.color || "electric"));
    const payments = item.payments ? [...(item.payments as unknown[])] : [];
    // legacy: paid: string[] → payments
    if (Array.isArray(item.paid)) {
      const { per, last } = calcPerLast(Number(item.total || 0), Number(item.months || 1), Number(item.rate || 0));
      (item.paid as string[]).forEach((date, i) => {
        const amount = i === Number(item.months) - 1 ? last : per;
        payments.push({ id: `pl${i}-${item.id}`, date, amount, note: "" });
      });
    }
    return {
      id: String(item.id || ""),
      name: String(item.name || ""),
      provider: String(item.provider || ""),
      total: Number(item.total || 0),
      months: Number(item.months || 1),
      rate: Number(item.rate || 0),
      start: String(item.start || ""),
      dueDay: Number(item.dueDay || 1),
      color,
      note: String(item.note || ""),
      payments: payments as Item["payments"],
    } satisfies Item;
  });
  return {
    updatedAt: Number(r.updatedAt || 0),
    sample: Boolean(r.sample),
    items,
  };
}

function migrateColor(c: string): ColorKey {
  if (["carbon", "mist", "electric", "violet", "lime", "steel"].includes(c)) return c as ColorKey;
  return OLD_COLOR_MAP[c] ?? "electric";
}

function calcPerLast(total: number, months: number, rate: number) {
  const grand = Math.round((total + total * (rate / 100) * months) * 100) / 100;
  const per = Math.floor((grand / months) * 100) / 100;
  const last = Math.round((grand - per * (months - 1)) * 100) / 100;
  return { per, last };
}

export const SAMPLE_ITEMS: Item[] = [
  {
    id: "s1",
    name: "iPhone 16 Pro",
    provider: "KTC VISA",
    total: 42900,
    months: 10,
    rate: 0,
    start: "2026-08",
    dueDay: 15,
    color: "carbon",
    note: "",
    payments: [
      { id: "sp1", date: "2026-08-15", amount: 4290, note: "" },
      { id: "sp2", date: "2026-09-15", amount: 4290, note: "" },
      { id: "sp3", date: "2026-10-15", amount: 4290, note: "" },
    ],
  },
  {
    id: "s2",
    name: "แอร์ Daikin 18000 BTU",
    provider: "KBANK Easy Buy",
    total: 28500,
    months: 12,
    rate: 0.69,
    start: "2026-06",
    dueDay: 5,
    color: "electric",
    note: "ติดตั้งห้องนอนใหญ่",
    payments: [
      { id: "sp4", date: "2026-06-05", amount: 2600.63, note: "" },
      { id: "sp5", date: "2026-07-05", amount: 2600.63, note: "" },
      { id: "sp6", date: "2026-08-05", amount: 2600.63, note: "" },
      { id: "sp7", date: "2026-09-05", amount: 2600.63, note: "" },
      { id: "sp8", date: "2026-10-05", amount: 2600.63, note: "" },
    ],
  },
  {
    id: "s3",
    name: "โน้ตบุ๊ค ASUS Zenbook",
    provider: "SCB แบ่งชำระ",
    total: 32000,
    months: 6,
    rate: 0,
    start: "2026-09",
    dueDay: 20,
    color: "violet",
    note: "",
    payments: [
      { id: "sp9", date: "2026-09-20", amount: 5333.33, note: "" },
      { id: "sp10", date: "2026-10-20", amount: 5333.33, note: "" },
    ],
  },
];

export const INITIAL_STATE: AppState = {
  updatedAt: 0,
  sample: true,
  items: SAMPLE_ITEMS,
};

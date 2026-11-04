import type { Item, Payment, Slip, Store } from "../types";

const KEY = "wallet_dept_state";

function load(): Item[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Item[]) : [];
  } catch {
    return [];
  }
}

function save(items: Item[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function createLocalStore(): Store {
  let items: Item[] = load();
  const listeners = new Set<(items: Item[]) => void>();

  function notify() {
    listeners.forEach(fn => fn(items));
  }

  return {
    async signIn() {
      return { uid: "local", email: "local@device" };
    },
    async signOut() {},

    async load() {
      items = load();
      return items;
    },

    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async saveItem(item: Item) {
      const { payments: _, ...rest } = item;
      const existing = items.find(i => i.id === item.id);
      if (existing) {
        Object.assign(existing, rest);
      } else {
        items.push({ ...item });
      }
      save(items);
      notify();
    },

    async deleteItem(id: string) {
      items = items.filter(i => i.id !== id);
      save(items);
      notify();
    },

    async savePayment(itemId: string, p: Payment) {
      const item = items.find(i => i.id === itemId);
      if (!item) return;
      const idx = item.payments.findIndex(x => x.id === p.id);
      if (idx >= 0) item.payments[idx] = p;
      else item.payments.push(p);
      save(items);
      notify();
    },

    async deletePayment(itemId: string, pId: string) {
      const item = items.find(i => i.id === itemId);
      if (!item) return;
      item.payments = item.payments.filter(p => p.id !== pId);
      save(items);
      notify();
    },

    async uploadSlip(blob: Blob, _ref: { itemId: string; paymentId: string }): Promise<Slip> {
      return new Promise<Slip>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ data: reader.result as string });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    },

    async slipSrc(slip: Slip) {
      if ("data" in slip) return slip.data;
      return slip.url ?? "";
    },

    async deleteSlip(_slip: Slip) {},
  };
}

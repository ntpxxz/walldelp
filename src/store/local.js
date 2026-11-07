const KEY = "wallet_dept_state";
function load() {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : [];
    }
    catch {
        return [];
    }
}
function save(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
}
export function createLocalStore() {
    let items = load();
    const listeners = new Set();
    function notify() {
        listeners.forEach(fn => fn(items));
    }
    return {
        async signIn() {
            return { uid: "local", email: "local@device" };
        },
        async signOut() { },
        async load() {
            items = load();
            return items;
        },
        subscribe(cb) {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        async saveItem(item) {
            const { payments: _, ...rest } = item;
            const existing = items.find(i => i.id === item.id);
            if (existing) {
                Object.assign(existing, rest);
            }
            else {
                items.push({ ...item });
            }
            save(items);
            notify();
        },
        async deleteItem(id) {
            items = items.filter(i => i.id !== id);
            save(items);
            notify();
        },
        async savePayment(itemId, p) {
            const item = items.find(i => i.id === itemId);
            if (!item)
                return;
            const idx = item.payments.findIndex(x => x.id === p.id);
            if (idx >= 0)
                item.payments[idx] = p;
            else
                item.payments.push(p);
            save(items);
            notify();
        },
        async deletePayment(itemId, pId) {
            const item = items.find(i => i.id === itemId);
            if (!item)
                return;
            item.payments = item.payments.filter(p => p.id !== pId);
            save(items);
            notify();
        },
        async uploadSlip(blob, _ref) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve({ data: reader.result });
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        },
        async slipSrc(slip) {
            if ("data" in slip)
                return slip.data;
            return slip.url ?? "";
        },
        async deleteSlip(_slip) { },
    };
}

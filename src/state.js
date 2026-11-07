import { INITIAL_STATE, legacyMigrate } from "./sample";
import { showToast } from "./components/toast";
const STORAGE_KEY = "wallet_dept_v2";
let _state = INITIAL_STATE;
let _store = null;
const _listeners = new Set();
let _unsubscribe = null;
export function getState() { return _state; }
export function getStore() { return _store; }
export function subscribe(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}
export function notify() {
    _listeners.forEach(fn => fn());
}
function persist(s) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    }
    catch { }
}
function loadLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return null;
        return legacyMigrate(JSON.parse(raw));
    }
    catch {
        return null;
    }
}
export function setState(next) {
    _state = { ..._state, ...next, updatedAt: Date.now() };
    persist(_state);
    notify();
}
export async function initStore(store) {
    _store = store;
    // Load from localStorage first for instant render
    const local = loadLocal();
    if (local) {
        _state = local;
        notify();
    }
    // Load from store
    try {
        const items = await store.load();
        _state = { ..._state, items, updatedAt: Date.now() };
        persist(_state);
        notify();
    }
    catch (e) {
        console.error("store.load", e);
    }
    // Live updates (Firebase onSnapshot)
    if (store.subscribe) {
        _unsubscribe = store.subscribe(items => {
            _state = { ..._state, items, updatedAt: Date.now() };
            persist(_state);
            notify();
        });
    }
}
export function teardown() {
    _unsubscribe?.();
    _unsubscribe = null;
    _listeners.clear();
}
// --- Mutations ---
export async function saveItem(item) {
    const items = _state.items.filter(i => i.id !== item.id);
    items.push(item);
    setState({ items });
    try {
        await _store.saveItem(item);
    }
    catch {
        showToast("บันทึกไม่สำเร็จ ลองอีกครั้ง", "bad");
        const fresh = await _store.load();
        setState({ items: fresh });
    }
}
export async function deleteItem(id) {
    setState({ items: _state.items.filter(i => i.id !== id) });
    try {
        await _store.deleteItem(id);
    }
    catch {
        showToast("ลบไม่สำเร็จ ลองอีกครั้ง", "bad");
        const fresh = await _store.load();
        setState({ items: fresh });
    }
}
export async function savePayment(itemId, p) {
    const items = _state.items.map(it => {
        if (it.id !== itemId)
            return it;
        const pays = it.payments.filter(x => x.id !== p.id);
        pays.push(p);
        return { ...it, payments: pays };
    });
    setState({ items });
    try {
        await _store.savePayment(itemId, p);
    }
    catch {
        showToast("บันทึกไม่สำเร็จ ลองอีกครั้ง", "bad");
        const fresh = await _store.load();
        setState({ items: fresh });
    }
}
export async function deletePayment(itemId, paymentId) {
    const items = _state.items.map(it => {
        if (it.id !== itemId)
            return it;
        return { ...it, payments: it.payments.filter(p => p.id !== paymentId) };
    });
    setState({ items });
    try {
        await _store.deletePayment(itemId, paymentId);
    }
    catch {
        showToast("ลบไม่สำเร็จ ลองอีกครั้ง", "bad");
        const fresh = await _store.load();
        setState({ items: fresh });
    }
}
export async function uploadSlip(blob, ref) {
    return _store.uploadSlip(blob, ref);
}
export async function slipSrc(slip) {
    return _store.slipSrc(slip);
}
export async function deleteSlip(slip) {
    return _store.deleteSlip(slip);
}
export async function clearSample() {
    const sampleIds = _state.items.filter(i => i.id.startsWith("s")).map(i => i.id);
    const items = _state.items.filter(i => !i.id.startsWith("s"));
    setState({ items, sample: false });
    for (const id of sampleIds) {
        try {
            await _store.deleteItem(id);
        }
        catch { }
    }
}

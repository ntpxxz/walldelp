import type { AppState, Item, Payment, Slip } from "./types";
import type { Store } from "./store/index";
import { INITIAL_STATE, legacyMigrate } from "./sample";
import { showToast } from "./components/toast";

const STORAGE_KEY = "wallet_dept_v2";

type Listener = () => void;

let _state: AppState = INITIAL_STATE;
let _store: Store | null = null;
const _listeners = new Set<Listener>();
let _unsubscribe: (() => void) | null = null;

export function getState(): AppState { return _state; }
export function getStore(): Store { return _store!; }

export function subscribe(fn: Listener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function notify(): void {
  _listeners.forEach(fn => fn());
}

function persist(s: AppState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function loadLocal(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return legacyMigrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function setState(next: Partial<AppState>): void {
  _state = { ..._state, ...next, updatedAt: Date.now() };
  persist(_state);
  notify();
}

export async function initStore(store: Store): Promise<void> {
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
  } catch (e) {
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

export function teardown(): void {
  _unsubscribe?.();
  _unsubscribe = null;
  _listeners.clear();
}

// --- Mutations ---

export async function saveItem(item: Item): Promise<void> {
  const items = _state.items.filter(i => i.id !== item.id);
  items.push(item);
  setState({ items });
  try {
    await _store!.saveItem(item);
  } catch {
    showToast("บันทึกไม่สำเร็จ ลองอีกครั้ง", "bad");
    const fresh = await _store!.load();
    setState({ items: fresh });
  }
}

export async function deleteItem(id: string): Promise<void> {
  setState({ items: _state.items.filter(i => i.id !== id) });
  try {
    await _store!.deleteItem(id);
  } catch {
    showToast("ลบไม่สำเร็จ ลองอีกครั้ง", "bad");
    const fresh = await _store!.load();
    setState({ items: fresh });
  }
}

export async function savePayment(itemId: string, p: Payment): Promise<void> {
  const items = _state.items.map(it => {
    if (it.id !== itemId) return it;
    const pays = it.payments.filter(x => x.id !== p.id);
    pays.push(p);
    return { ...it, payments: pays };
  });
  setState({ items });
  try {
    await _store!.savePayment(itemId, p);
  } catch {
    showToast("บันทึกไม่สำเร็จ ลองอีกครั้ง", "bad");
    const fresh = await _store!.load();
    setState({ items: fresh });
  }
}

export async function deletePayment(itemId: string, paymentId: string): Promise<void> {
  const items = _state.items.map(it => {
    if (it.id !== itemId) return it;
    return { ...it, payments: it.payments.filter(p => p.id !== paymentId) };
  });
  setState({ items });
  try {
    await _store!.deletePayment(itemId, paymentId);
  } catch {
    showToast("ลบไม่สำเร็จ ลองอีกครั้ง", "bad");
    const fresh = await _store!.load();
    setState({ items: fresh });
  }
}

export async function uploadSlip(blob: Blob, ref: { itemId: string; paymentId: string }): Promise<Slip> {
  return _store!.uploadSlip(blob, ref);
}

export async function slipSrc(slip: Slip): Promise<string> {
  return _store!.slipSrc(slip);
}

export async function deleteSlip(slip: Slip): Promise<void> {
  return _store!.deleteSlip(slip);
}

export async function clearSample(): Promise<void> {
  const sampleIds = _state.items.filter(i => i.id.startsWith("s")).map(i => i.id);
  const items = _state.items.filter(i => !i.id.startsWith("s"));
  setState({ items, sample: false });
  for (const id of sampleIds) {
    try { await _store!.deleteItem(id); } catch {}
  }
}

import { initializeApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut as fbSignOut,
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDocs, setDoc, deleteDoc, onSnapshot,
  runTransaction, serverTimestamp,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import type { Item, Payment, Slip, Store } from "../types";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FB_APP_ID,
});

const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

const SLIP_MODE = import.meta.env.VITE_SLIP_MODE || "firestore";
const storage = SLIP_MODE === "storage" ? getStorage(app) : null;

const uid = (): string => {
  const u = auth.currentUser;
  if (!u) throw new Error("unauthenticated");
  return u.uid;
};

const itemsCol = () => collection(db, "users", uid(), "items");
const itemDoc = (id: string) => doc(db, "users", uid(), "items", id);
const slipDoc = (id: string) => doc(db, "users", uid(), "slips", id);
const fromDoc = (d: { id: string; data(): Record<string, unknown> }): Item => ({
  id: d.id,
  ...(d.data() as Omit<Item, "id" | "payments">),
  payments: (d.data().payments as Payment[]) || [],
});

const blobToDataUrl = (b: Blob): Promise<string> =>
  new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as string);
    r.onerror = no;
    r.readAsDataURL(b);
  });

export function createFirebaseStore(): Store {
  return {
    signIn() {
      return new Promise((resolve, reject) => {
        // Check for redirect result first (LINE / in-app browsers)
        getRedirectResult(auth).catch(() => {});
        const off = onAuthStateChanged(auth, async u => {
          if (u) {
            off();
            await setDoc(doc(db, "users", u.uid), { email: u.email, updatedAt: serverTimestamp() }, { merge: true });
            resolve({ uid: u.uid, email: u.email! });
          } else {
            const provider = new GoogleAuthProvider();
            signInWithPopup(auth, provider).catch(e => {
              if ((e as { code?: string }).code === "auth/popup-blocked") {
                signInWithRedirect(auth, provider);
              } else {
                reject(e);
              }
            });
          }
        });
      });
    },

    async signOut() {
      await fbSignOut(auth);
    },

    async load() {
      const snap = await getDocs(itemsCol());
      return snap.docs.map(fromDoc);
    },

    subscribe(cb) {
      return onSnapshot(itemsCol(), snap => cb(snap.docs.map(fromDoc)));
    },

    async saveItem(item: Item) {
      const { id, payments: _p, ...rest } = item;
      await setDoc(itemDoc(id), { ...rest, updatedAt: serverTimestamp() }, { merge: true });
    },

    async deleteItem(id: string) {
      const snap = await getDocs(itemsCol());
      const it = snap.docs.find(d => d.id === id);
      for (const p of ((it?.data().payments as Payment[]) || [])) {
        if (p.slip) await this.deleteSlip(p.slip).catch(() => {});
      }
      await deleteDoc(itemDoc(id));
    },

    async savePayment(itemId: string, p: Payment) {
      await runTransaction(db, async tx => {
        const ref_ = itemDoc(itemId);
        const cur = await tx.get(ref_);
        const list = ((cur.data()?.payments as Payment[]) || []).filter(x => x.id !== p.id);
        list.push(Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as Payment);
        tx.update(ref_, { payments: list, updatedAt: serverTimestamp() });
      });
    },

    async deletePayment(itemId: string, paymentId: string) {
      await runTransaction(db, async tx => {
        const ref_ = itemDoc(itemId);
        const cur = await tx.get(ref_);
        const list = (cur.data()?.payments as Payment[]) || [];
        const gone = list.find(x => x.id === paymentId);
        tx.update(ref_, { payments: list.filter(x => x.id !== paymentId), updatedAt: serverTimestamp() });
        return gone;
      }).then(gone => gone?.slip && this.deleteSlip(gone.slip));
    },

    async uploadSlip(blob: Blob, { itemId, paymentId }: { itemId: string; paymentId: string }): Promise<Slip> {
      if (SLIP_MODE === "storage" && storage) {
        const path = `users/${uid()}/slips/${itemId}/${paymentId}.jpg`;
        await uploadBytes(ref(storage, path), blob, { contentType: "image/jpeg" });
        return { id: path, url: await getDownloadURL(ref(storage, path)) };
      }
      await setDoc(slipDoc(paymentId), {
        itemId, data: await blobToDataUrl(blob), createdAt: serverTimestamp(),
      });
      return { id: paymentId };
    },

    async slipSrc(slip: Slip) {
      if ("data" in slip) return slip.data;
      if ("url" in slip && slip.url) return slip.url;
      const snap = await getDocs(collection(db, "users", uid(), "slips"));
      const d = snap.docs.find(x => x.id === (slip as { id: string }).id);
      return (d?.data().data as string) || "";
    },

    async deleteSlip(slip: Slip) {
      if ("id" in slip) {
        if (SLIP_MODE === "storage" && storage && (slip.id as string).startsWith("users/")) {
          return deleteObject(ref(storage, slip.id));
        }
        return deleteDoc(slipDoc(slip.id));
      }
    },
  };
}

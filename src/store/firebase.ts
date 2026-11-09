import { initializeApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
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

function fbErrMsg(code: string): string {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential": return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    case "auth/email-already-in-use": return "อีเมลนี้มีบัญชีอยู่แล้ว";
    case "auth/too-many-requests": return "พยายามมากเกินไป กรุณารอสักครู่";
    case "auth/network-request-failed": return "ไม่สามารถเชื่อมต่อเครือข่ายได้";
    default: return "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
  }
}

function showSignInOverlay(): void {
  const overlay = document.createElement("div");
  overlay.id = "si-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;background:var(--bg);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto";

  let mode: "signin" | "register" = "signin";

  function showErr(msg: string) {
    const el = overlay.querySelector<HTMLElement>("#si-err");
    if (el) { el.textContent = msg; el.style.display = "block"; }
  }

  function render() {
    overlay.innerHTML = `
      <div style="width:100%;max-width:360px">
        <h1 style="font-family:var(--f-display);font-size:28px;font-weight:700;margin-bottom:4px">ผ่อนฉัน</h1>
        <p style="color:var(--muted);font-size:14px;margin-bottom:24px">
          ${mode === "signin" ? "เข้าสู่ระบบเพื่อใช้งาน" : "สร้างบัญชีใหม่"}
        </p>
        <div class="form-row">
          <label>อีเมล</label>
          <input type="email" id="si-email" placeholder="email@example.com" autocomplete="email" />
        </div>
        <div class="form-row">
          <label>รหัสผ่าน</label>
          <input type="password" id="si-password"
            placeholder="${mode === "signin" ? "รหัสผ่าน" : "สร้างรหัสผ่าน (อย่างน้อย 6 ตัว)"}"
            autocomplete="${mode === "signin" ? "current-password" : "new-password"}" />
        </div>
        ${mode === "register" ? `
        <div class="form-row">
          <label>ยืนยันรหัสผ่าน</label>
          <input type="password" id="si-confirm" placeholder="ยืนยันรหัสผ่านอีกครั้ง" autocomplete="new-password" />
        </div>` : ""}
        <div id="si-err" style="display:none;font-size:13px;color:var(--bad);background:color-mix(in srgb,var(--bad) 10%,transparent);border-radius:8px;padding:9px 12px;margin-bottom:12px"></div>
        <button class="btn primary" id="si-submit" style="width:100%">
          ${mode === "signin" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
        </button>
        <div style="display:flex;align-items:center;gap:10px;margin:16px 0;color:var(--muted);font-size:13px">
          <div style="flex:1;height:1px;background:var(--line)"></div><span>หรือ</span><div style="flex:1;height:1px;background:var(--line)"></div>
        </div>
        <button class="btn" id="si-google" style="width:100%;gap:8px">
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
            <path d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3L37.4 9.5C34 6.4 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-9 20-20 0-1.2-.1-2.3-.4-3.5z" fill="#FFC107"/>
            <path d="M6.3 14.7l6.6 4.8C14.6 16.1 18.9 12 24 12c3.1 0 5.8 1.1 7.9 3L37.4 9.5C34 6.4 29.2 4 24 4c-7.7 0-14.3 4.3-17.7 10.7z" fill="#FF3D00"/>
            <path d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.5 26.8 36 24 36c-5.3 0-9.7-3.4-11.3-8.1L6 32.7C9.4 39.4 16.1 44 24 44z" fill="#4CAF50"/>
            <path d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.2C40.9 36.1 44 30.5 44 24c0-1.2-.1-2.3-.4-3.5z" fill="#1976D2"/>
          </svg>
          Sign in with Google
        </button>
        <p style="text-align:center;margin-top:16px;font-size:13.5px;color:var(--muted)">
          ${mode === "signin"
            ? `ยังไม่มีบัญชี? <button id="si-mode" class="btn ghost sm" style="padding:2px 6px">สมัครสมาชิก</button>`
            : `มีบัญชีแล้ว? <button id="si-mode" class="btn ghost sm" style="padding:2px 6px">เข้าสู่ระบบ</button>`}
        </p>
      </div>`;

    overlay.querySelector<HTMLInputElement>("#si-email")?.focus();

    overlay.querySelector("#si-submit")?.addEventListener("click", handleEmail);
    overlay.querySelector<HTMLInputElement>("#si-password")?.addEventListener("keydown", e => {
      if (e.key === "Enter") handleEmail();
    });
    overlay.querySelector<HTMLInputElement>("#si-confirm")?.addEventListener("keydown", e => {
      if (e.key === "Enter") handleEmail();
    });
    overlay.querySelector("#si-google")?.addEventListener("click", handleGoogle);
    overlay.querySelector("#si-mode")?.addEventListener("click", () => {
      mode = mode === "signin" ? "register" : "signin";
      render();
    });
  }

  async function handleEmail() {
    const email = overlay.querySelector<HTMLInputElement>("#si-email")?.value.trim() ?? "";
    const password = overlay.querySelector<HTMLInputElement>("#si-password")?.value ?? "";
    const submitBtn = overlay.querySelector<HTMLButtonElement>("#si-submit")!;

    if (!email || !password) { showErr("กรุณากรอกอีเมลและรหัสผ่าน"); return; }

    if (mode === "register") {
      const confirm = overlay.querySelector<HTMLInputElement>("#si-confirm")?.value ?? "";
      if (password !== confirm) { showErr("รหัสผ่านไม่ตรงกัน"); return; }
      if (password.length < 6) { showErr("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"); return; }
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "กำลังดำเนินการ…";

    try {
      if (mode === "register") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      // onAuthStateChanged fires → overlay removed there
    } catch (e) {
      showErr(fbErrMsg((e as { code?: string }).code ?? ""));
      submitBtn.disabled = false;
      submitBtn.textContent = mode === "signin" ? "เข้าสู่ระบบ" : "สมัครสมาชิก";
    }
  }

  async function handleGoogle() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (code === "auth/popup-blocked") {
        signInWithRedirect(auth, provider);
      } else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        showErr(fbErrMsg(code));
      }
    }
  }

  render();
  document.body.appendChild(overlay);
}

export function createFirebaseStore(): Store {
  return {
    async signIn() {
      // Await redirect result before registering the observer — prevents the observer from
      // firing with null while a redirect sign-in is still being processed on page load.
      await getRedirectResult(auth).catch(() => {});

      return new Promise((resolve) => {
        let uiShown = false;
        const off = onAuthStateChanged(auth, async u => {
          if (u) {
            off();
            document.getElementById("si-overlay")?.remove();
            await setDoc(doc(db, "users", u.uid), { email: u.email, updatedAt: serverTimestamp() }, { merge: true });
            resolve({ uid: u.uid, email: u.email! });
          } else if (!uiShown) {
            uiShown = true;
            showSignInOverlay();
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
      const { id, ...rest } = item;
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

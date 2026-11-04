# กระเป๋าผ่อน: Backend

Two supported backends sit behind one client-side interface:

| | **A. Google Sheets + Apps Script** | **B. Firebase (Auth + Firestore [+ Storage])** |
|---|---|---|
| Best for | One person who wants to see and edit data in a spreadsheet | A real app: multi-device, offline, live sync, room to add users later |
| Cost | Free (your Google account) | Free on the Spark plan for Auth, Firestore and Hosting. **Slips in Cloud Storage need Blaze** (see B.5) |
| Auth | Google Sign-In ID token, verified in Apps Script against an email allowlist | Firebase Auth (Google provider) plus security rules |
| Latency | ~0.6–2 s per call (cold start) | ~50–200 ms. Instant with the offline cache |
| Live sync between devices | No (reload or poll) | Yes (`onSnapshot`) |
| Offline | No | Yes (persistent IndexedDB cache) |
| Slips | Google Drive folder (private), served through the script | Cloud Storage (Blaze), or inline Firestore doc (Spark) |
| Effort | Low | Medium |

**Recommendation:** use **Firebase** if this will live on a phone day to day. Use **Sheets** if a spreadsheet is the point and a short loading delay is fine.

Both backends keep the data model from `SPEC.md` §4. All derived values (schedule, allocation, status) stay **client-side** in pure functions (`calc.js`), so neither backend has business logic beyond validation and auth.

---

## 1. Shared contract

### 1.1 Entities (wire format)
```ts
Item    { id, name, provider, total, months, rate, start, dueDay, color, note, createdAt, updatedAt }
Payment { id, itemId, date, amount, note, slip?: { id, url? } | { data }, createdAt, updatedAt }
```
- IDs are client-generated (`crypto.randomUUID()`), so creates are idempotent and work offline.
- `createdAt` and `updatedAt` are ISO strings (Sheets) or server timestamps (Firestore).

### 1.2 Server-side validation (both backends)
| Field | Rule |
|---|---|
| `name` | string, 1–60 |
| `provider` | string, 0–40 |
| `total` | number > 0, ≤ 10,000,000 |
| `months` | integer 1–120 |
| `rate` | number 0–10 |
| `start` | `/^\d{4}-\d{2}$/` |
| `dueDay` | integer 1–31 |
| `color` | one of `carbon mist electric violet lime steel` |
| `note` | string, 0–200 |
| Payment `date` | `/^\d{4}-\d{2}-\d{2}$/` |
| Payment `amount` | number > 0, ≤ 10,000,000 |
| Payment `note` | 0–80 |
| Slip | image/*, ≤ 5 MB after client compression (target < 400 KB) |

The "amount ≤ remaining balance" rule is enforced in the client only, because it depends on the derived schedule. The server accepts any positive amount.

---

## 2. Client `Store` interface

```js
// src/store/index.js
/**
 * @typedef {Object} Store
 * @property {() => Promise<{uid:string,email:string}>} signIn
 * @property {() => Promise<void>} signOut
 * @property {() => Promise<Item[]>} load              // items with payments[] nested
 * @property {(item: Item) => Promise<void>} saveItem  // upsert (without payments)
 * @property {(id: string) => Promise<void>} deleteItem // also deletes its payments + slips
 * @property {(itemId: string, p: Payment) => Promise<void>} savePayment
 * @property {(itemId: string, pId: string) => Promise<void>} deletePayment
 * @property {(blob: Blob, ref:{itemId:string,paymentId:string}) => Promise<Slip>} uploadSlip
 * @property {(slip: Slip) => Promise<string>} slipSrc // URL or data URL for <img>
 * @property {(slip: Slip) => Promise<void>} deleteSlip
 * @property {((cb:(items:Item[])=>void)=>()=>void)=} subscribe // optional live updates
 */
import { createSheetsStore } from "./sheets.js";
import { createFirebaseStore } from "./firebase.js";
import { createLocalStore } from "./local.js";

export function createStore() {
  switch (import.meta.env.VITE_BACKEND) {
    case "sheets":   return createSheetsStore();
    case "firebase": return createFirebaseStore();
    default:         return createLocalStore(); // localStorage, for dev/demo
  }
}
```

The UI uses **optimistic updates**: mutate in-memory state, re-render, then `await store.x()`. On failure it shows a toast ("บันทึกไม่สำเร็จ ลองอีกครั้ง") and reloads from `store.load()`.

---

## A. Google Sheets + Apps Script

### A.1 Spreadsheet layout
Create one spreadsheet with two sheets. Row 1 holds the headers. **Format every column as Plain text** so `2026-06` doesn't turn into a date; `setup()` below does this.

**`items`**
| id | name | provider | total | months | rate | start | dueDay | color | note | createdAt | updatedAt |
|---|---|---|---|---|---|---|---|---|---|---|---|

**`payments`**
| id | itemId | date | amount | note | slipFileId | createdAt | updatedAt |
|---|---|---|---|---|---|---|---|

Slips are stored as private files in a Drive folder. They are never link-shared, because they contain bank details. The script returns them as data URLs on request.

### A.2 Script properties
In the Apps Script editor go to **Project Settings → Script properties** and set:

| Key | Value |
|---|---|
| `SHEET_ID` | The spreadsheet ID (from its URL) |
| `SLIP_FOLDER_ID` | A Drive folder ID for slips |
| `CLIENT_ID` | OAuth 2.0 Web client ID (see `DEPLOYMENT.md` §B.2) |
| `ALLOWED_EMAILS` | Comma-separated emails allowed to use the API, e.g. `you@gmail.com` |

### A.3 `Code.gs`

```js
/** กระเป๋าผ่อน API — Google Apps Script Web App */
const P = PropertiesService.getScriptProperties();
const SHEET_ID = P.getProperty('SHEET_ID');
const SLIP_FOLDER_ID = P.getProperty('SLIP_FOLDER_ID');
const CLIENT_ID = P.getProperty('CLIENT_ID');
const ALLOWED = (P.getProperty('ALLOWED_EMAILS') || '').toLowerCase().split(',').map(s => s.trim()).filter(String);

const ITEM_COLS = ['id','name','provider','total','months','rate','start','dueDay','color','note','createdAt','updatedAt'];
const PAY_COLS  = ['id','itemId','date','amount','note','slipFileId','createdAt','updatedAt'];
const NUM = { total:1, months:1, rate:1, dueDay:1, amount:1 };
const COLORS = ['carbon','mist','electric','violet','lime','steel'];

/** Run once from the editor. Creates sheets + headers, forces plain-text columns. */
function setup() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  [['items', ITEM_COLS], ['payments', PAY_COLS]].forEach(([name, cols]) => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    sh.setFrozenRows(1);
  });
}

function doGet() { return json_({ ok: true, service: 'installment-wallet', time: new Date().toISOString() }); }

function doPost(e) {
  let req;
  try { req = JSON.parse((e.postData && e.postData.contents) || '{}'); }
  catch (_) { return json_({ ok: false, error: 'bad_json' }); }
  try {
    const email = auth_(req.idToken);
    const write = ['list', 'slip', 'whoami'].indexOf(req.action) < 0;
    const lock = LockService.getScriptLock();
    if (write) lock.waitLock(15000);
    try { return json_({ ok: true, data: route_(req, email) }); }
    finally { if (write) lock.releaseLock(); }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function route_(req, email) {
  switch (req.action) {
    case 'whoami':        return { email };
    case 'list':          return list_();
    case 'saveItem':      return upsert_('items', ITEM_COLS, validItem_(req.item));
    case 'deleteItem':    return deleteItem_(req.id);
    case 'savePayment':   return upsert_('payments', PAY_COLS, validPayment_(req.payment));
    case 'deletePayment': return deletePayment_(req.id);
    case 'uploadSlip':    return uploadSlip_(req);
    case 'slip':          return slip_(req.fileId);
    default: throw new Error('unknown_action');
  }
}

/* ---------- auth: Google ID token → allowlisted email ---------- */
function auth_(idToken) {
  if (!idToken) throw new Error('unauthenticated');
  const key = 't:' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken)).slice(0, 40);
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) return hit;
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('invalid_token');
  const t = JSON.parse(res.getContentText());
  if (t.aud !== CLIENT_ID) throw new Error('wrong_audience');
  if (String(t.email_verified) !== 'true') throw new Error('email_unverified');
  const email = String(t.email).toLowerCase();
  if (ALLOWED.indexOf(email) < 0) throw new Error('forbidden');
  const ttl = Math.max(60, Math.min(600, Number(t.exp) - Math.floor(Date.now() / 1000) - 30));
  cache.put(key, email, ttl);
  return email;
}

/* ---------- sheet helpers ---------- */
function sheet_(name) { return SpreadsheetApp.openById(SHEET_ID).getSheetByName(name); }

function readAll_(name, cols) {
  const sh = sheet_(name), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, cols.length).getValues()
    .filter(r => r[0] !== '')
    .map(r => cols.reduce((o, c, i) => (o[c] = NUM[c] ? Number(r[i]) : String(r[i]), o), {}));
}

function rowOf_(sh, id) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return -1;
  const ids = sh.getRange(2, 1, n, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return -1;
}

function upsert_(name, cols, obj) {
  const sh = sheet_(name), now = new Date().toISOString(), row = rowOf_(sh, obj.id);
  if (row > 0) {
    const prev = sh.getRange(row, 1, 1, cols.length).getValues()[0];
    obj.createdAt = String(prev[cols.indexOf('createdAt')] || now);
  } else obj.createdAt = now;
  obj.updatedAt = now;
  const values = [cols.map(c => obj[c] == null ? '' : String(obj[c]))];
  if (row > 0) sh.getRange(row, 1, 1, cols.length).setValues(values);
  else sh.appendRow(values[0]);
  return { id: obj.id, updatedAt: now };
}

function deleteRows_(sh, predicate, cols) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const rows = sh.getRange(2, 1, n, cols.length).getValues(), removed = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const o = cols.reduce((a, c, j) => (a[c] = rows[i][j], a), {});
    if (predicate(o)) { sh.deleteRow(i + 2); removed.push(o); }
  }
  return removed;
}

/* ---------- actions ---------- */
function list_() {
  const items = readAll_('items', ITEM_COLS);
  const pays = readAll_('payments', PAY_COLS);
  const byItem = {};
  pays.forEach(p => {
    const out = { id: p.id, date: p.date, amount: p.amount, note: p.note };
    if (p.slipFileId) out.slip = { id: p.slipFileId };
    (byItem[p.itemId] = byItem[p.itemId] || []).push(out);
  });
  items.forEach(it => it.payments = byItem[it.id] || []);
  return { items };
}

function deleteItem_(id) {
  deleteRows_(sheet_('items'), o => String(o.id) === id, ITEM_COLS);
  const gone = deleteRows_(sheet_('payments'), o => String(o.itemId) === id, PAY_COLS);
  gone.forEach(p => p.slipFileId && trash_(String(p.slipFileId)));
  return { id };
}

function deletePayment_(id) {
  const gone = deleteRows_(sheet_('payments'), o => String(o.id) === id, PAY_COLS);
  gone.forEach(p => p.slipFileId && trash_(String(p.slipFileId)));
  return { id };
}

function uploadSlip_(req) {
  const m = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(req.dataUrl || '');
  if (!m) throw new Error('bad_image');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('too_large');
  const blob = Utilities.newBlob(bytes, m[1], 'slip-' + req.paymentId + '.jpg');
  const file = DriveApp.getFolderById(SLIP_FOLDER_ID).createFile(blob);   // private by default
  // link slip to payment row
  const sh = sheet_('payments'), row = rowOf_(sh, req.paymentId);
  if (row > 0) {
    const col = PAY_COLS.indexOf('slipFileId') + 1, old = String(sh.getRange(row, col).getValue() || '');
    if (old) trash_(old);
    sh.getRange(row, col).setValue(file.getId());
  }
  return { id: file.getId() };
}

function slip_(fileId) {
  const f = DriveApp.getFileById(fileId);
  if (f.getParents().next().getId() !== SLIP_FOLDER_ID) throw new Error('forbidden');
  const b = f.getBlob();
  return { dataUrl: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) };
}

function trash_(fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch (_) {} }

/* ---------- validation ---------- */
function req_(c, msg) { if (!c) throw new Error('invalid:' + msg); }
function validItem_(x) {
  x = x || {};
  req_(typeof x.id === 'string' && x.id.length <= 64, 'id');
  req_(typeof x.name === 'string' && x.name.trim().length >= 1 && x.name.length <= 60, 'name');
  req_(!x.provider || String(x.provider).length <= 40, 'provider');
  req_(+x.total > 0 && +x.total <= 1e7, 'total');
  req_(Number.isInteger(+x.months) && +x.months >= 1 && +x.months <= 120, 'months');
  req_(+x.rate >= 0 && +x.rate <= 10, 'rate');
  req_(/^\d{4}-\d{2}$/.test(x.start), 'start');
  req_(Number.isInteger(+x.dueDay) && +x.dueDay >= 1 && +x.dueDay <= 31, 'dueDay');
  req_(COLORS.indexOf(x.color) >= 0, 'color');
  req_(!x.note || String(x.note).length <= 200, 'note');
  return ITEM_COLS.reduce((o, c) => (o[c] = x[c], o), {});
}
function validPayment_(x) {
  x = x || {};
  req_(typeof x.id === 'string' && x.id.length <= 64, 'id');
  req_(typeof x.itemId === 'string' && rowOf_(sheet_('items'), x.itemId) > 0, 'itemId');
  req_(/^\d{4}-\d{2}-\d{2}$/.test(x.date), 'date');
  req_(+x.amount > 0 && +x.amount <= 1e7, 'amount');
  req_(!x.note || String(x.note).length <= 80, 'note');
  const o = PAY_COLS.reduce((a, c) => (a[c] = x[c], a), {});
  // keep existing slip link unless caller explicitly clears it
  if (x.slipFileId === undefined) {
    const sh = sheet_('payments'), row = rowOf_(sh, x.id);
    o.slipFileId = row > 0 ? sh.getRange(row, PAY_COLS.indexOf('slipFileId') + 1).getValue() : '';
  }
  return o;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
```

**Notes**
- Every call is a `POST` with `Content-Type: text/plain;charset=utf-8`. That makes it a "simple" CORS request with no preflight, which Apps Script can't answer. The ID token travels in the body, never in the URL.
- `LockService` serialises writes, so two devices saving at the same moment don't interleave `appendRow`/`deleteRow`.
- A row lookup scans column A. That's fine into the low thousands of rows; for more, keep an id→row index in `CacheService`.
- After **any** code change you must publish a new version of the deployment (`DEPLOYMENT.md` §B.3). Otherwise the `/exec` URL keeps serving the old code.

### A.4 Client adapter `src/store/sheets.js`

```js
const API = import.meta.env.VITE_SHEETS_API_URL;          // https://script.google.com/macros/s/…/exec
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
let idToken = null;

/* Google Identity Services: <script src="https://accounts.google.com/gsi/client" async></script> */
function signInGIS() {
  return new Promise((resolve, reject) => {
    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      auto_select: true,
      callback: r => { idToken = r.credential; resolve(); },
    });
    google.accounts.id.prompt(n => { if (n.isNotDisplayed() || n.isSkippedMoment()) {
      // fall back to a rendered button
      const el = document.getElementById("gsi-button");
      el.hidden = false;
      google.accounts.id.renderButton(el, { theme: "outline", size: "large", shape: "pill" });
    }});
    setTimeout(() => !idToken && reject(new Error("sign_in_timeout")), 120000);
  });
}

async function call(action, body = {}) {
  const res = await fetch(API, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, idToken, ...body }),
  });
  const j = await res.json();
  if (!j.ok) {
    if (j.error === "invalid_token") { idToken = null; await signInGIS(); return call(action, body); } // ID tokens live ~1 h
    throw new Error(j.error);
  }
  return j.data;
}

const blobToDataUrl = b => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(b); });
const slipCache = new Map();

export function createSheetsStore() {
  return {
    async signIn()        { await signInGIS(); return call("whoami"); },
    async signOut()       { google.accounts.id.disableAutoSelect(); idToken = null; },
    async load()          { return (await call("list")).items; },
    saveItem(item)        { const { payments, ...row } = item; return call("saveItem", { item: row }); },
    deleteItem(id)        { return call("deleteItem", { id }); },
    savePayment(itemId,p) { const { slip, ...row } = p; return call("savePayment", { payment: { ...row, itemId } }); },
    deletePayment(_, id)  { return call("deletePayment", { id }); },
    async uploadSlip(blob, { paymentId }) {
      const r = await call("uploadSlip", { paymentId, dataUrl: await blobToDataUrl(blob) });
      return { id: r.id };
    },
    async slipSrc(slip) {
      if (slip.data) return slip.data;
      if (!slipCache.has(slip.id)) slipCache.set(slip.id, call("slip", { fileId: slip.id }).then(r => r.dataUrl));
      return slipCache.get(slip.id);
    },
    async deleteSlip() { /* handled server-side on payment delete / replace */ },
  };
}
```

**Order of calls when recording a payment with a slip:** first `savePayment` (it creates the row), then `uploadSlip` (it links `slipFileId`).

### A.5 Limits to know
- Each call is a fresh script execution with a cold start of about 0.5–2 s. Batch where you can (`list` returns everything in one call).
- Apps Script has daily quotas for executions and URL fetches, plus per-execution time limits. A single user won't come close, but don't poll every few seconds. Use a refresh-on-focus approach.
- The spreadsheet is the source of truth, and you can edit it by hand. Keep the IDs intact and the formats as text.

---

## B. Firebase

### B.1 Services
| Service | Plan | Used for |
|---|---|---|
| Authentication (Google provider) | Spark | Sign-in |
| Cloud Firestore (Standard edition) | Spark: 1 GiB stored, 50k reads/day, 20k writes/day | Items and payments |
| Hosting | Spark: 10 GB stored, 360 MB/day transfer | Static site |
| Cloud Storage for Firebase | **Blaze required** (as of 3 Feb 2026, even within the no-cost tier) | Slips (option 1) |

### B.2 Firestore structure

```
users/{uid}                                   { email, createdAt }
users/{uid}/items/{itemId}                    Item fields + payments: Payment[]  (embedded array)
users/{uid}/slips/{paymentId}                 { itemId, data: "data:image/jpeg;base64,…", createdAt }   ← Spark-only slip option
```

**Why payments are embedded:** a plan has at most 120 installments and a payment is about 150 bytes, so even 300 payments are ~45 KB, well under the 1 MiB document limit. One document per plan means:
- one read per plan
- atomic updates to a plan and its payments
- a trivial `onSnapshot`

Slips are **never** embedded in the item document.

### B.3 Security rules: `firestore.rules`

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    function signedIn() { return request.auth != null; }
    function owner(uid) { return signedIn() && request.auth.uid == uid; }
    function str(v, min, max) { return v is string && v.size() >= min && v.size() <= max; }
    function num(v, min, max) { return v is number && v >= min && v <= max; }

    function validPayment(p) {
      return p.keys().hasOnly(['id','date','amount','note','slip'])
        && str(p.id, 1, 64)
        && p.date is string && p.date.matches('^\\d{4}-\\d{2}-\\d{2}$')
        && num(p.amount, 0.01, 10000000)
        && (!('note' in p) || str(p.note, 0, 80));
    }

    function validItem(d) {
      return d.keys().hasOnly(['name','provider','total','months','rate','start','dueDay','color','note','payments','createdAt','updatedAt'])
        && str(d.name, 1, 60)
        && str(d.provider, 0, 40)
        && num(d.total, 0.01, 10000000)
        && d.months is int && d.months >= 1 && d.months <= 120
        && num(d.rate, 0, 10)
        && d.start.matches('^\\d{4}-\\d{2}$')
        && d.dueDay is int && d.dueDay >= 1 && d.dueDay <= 31
        && d.color in ['carbon','mist','electric','violet','lime','steel']
        && str(d.note, 0, 200)
        && d.payments is list && d.payments.size() <= 500
        // spot-check the newest payment; full per-element validation isn't possible in rules
        && (d.payments.size() == 0 || validPayment(d.payments[d.payments.size() - 1]));
    }

    match /users/{uid} {
      allow read, write: if owner(uid);

      match /items/{itemId} {
        allow read, delete: if owner(uid);
        allow create, update: if owner(uid) && validItem(request.resource.data);
      }

      match /slips/{paymentId} {
        allow read, delete: if owner(uid);
        allow create, update: if owner(uid)
          && request.resource.data.data is string
          && request.resource.data.data.size() < 900000      // < ~900 KB data URL
          && request.resource.data.data.matches('^data:image/(jpeg|png|webp);base64,.*');
      }
    }
  }
}
```

### B.4 `storage.rules` (only if you use Cloud Storage for slips)

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{uid}/slips/{itemId}/{fileName} {
      allow read, delete: if request.auth != null && request.auth.uid == uid;
      allow write: if request.auth != null && request.auth.uid == uid
        && request.resource.size < 5 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
  }
}
```

### B.5 Slips: choose one

| Option | Plan | How | Trade-off |
|---|---|---|---|
| **1. Cloud Storage** | Blaze (has a no-cost tier, but a card is required; set a budget alert) | `users/{uid}/slips/{itemId}/{paymentId}.jpg`, store `{ path }` on the payment | Clean and scales. Needs billing |
| **2. Firestore doc** | Spark | Compress to ≤ 1000 px JPEG q0.7 (~80–200 KB). Write a data URL to `users/{uid}/slips/{paymentId}`. Store `{ id: paymentId }` on the payment | Free. ~1 read per thumbnail view. Hard cap < 1 MiB per slip |

The adapter below supports both. `VITE_SLIP_MODE=storage|firestore`.

### B.6 Client adapter `src/store/firebase.js`

```js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, runTransaction, serverTimestamp,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FB_APP_ID,
});
const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), // offline + multi-tab
});
const SLIP_MODE = import.meta.env.VITE_SLIP_MODE || "firestore";
const storage = SLIP_MODE === "storage" ? getStorage(app) : null;

const uid = () => { const u = auth.currentUser; if (!u) throw new Error("unauthenticated"); return u.uid; };
const itemsCol = () => collection(db, "users", uid(), "items");
const itemDoc = id => doc(db, "users", uid(), "items", id);
const slipDoc = id => doc(db, "users", uid(), "slips", id);
const blobToDataUrl = b => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(b); });
const fromDoc = d => ({ id: d.id, ...d.data(), payments: d.data().payments || [] });

export function createFirebaseStore() {
  return {
    signIn() {
      return new Promise((resolve, reject) => {
        const off = onAuthStateChanged(auth, async u => {
          if (u) { off(); await setDoc(doc(db, "users", u.uid), { email: u.email, createdAt: serverTimestamp() }, { merge: true });
                   return resolve({ uid: u.uid, email: u.email }); }
          const p = new GoogleAuthProvider();
          // popups are blocked in some in-app browsers (LINE, Facebook) → redirect fallback
          signInWithPopup(auth, p).catch(e => e.code === "auth/popup-blocked" ? signInWithRedirect(auth, p) : reject(e));
        });
      });
    },
    signOut: () => signOut(auth),

    async load() { return (await getDocs(itemsCol())).docs.map(fromDoc); },
    subscribe(cb) { return onSnapshot(itemsCol(), s => cb(s.docs.map(fromDoc))); },

    saveItem(item) {
      const { id, payments, ...rest } = item;               // payments are written via savePayment
      return setDoc(itemDoc(id), { ...rest, updatedAt: serverTimestamp(),
        ...(item.createdAt ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
    },

    async deleteItem(id) {
      const it = await getDoc(itemDoc(id));
      for (const p of (it.data()?.payments || [])) if (p.slip) await this.deleteSlip(p.slip).catch(() => {});
      await deleteDoc(itemDoc(id));
    },

    savePayment(itemId, p) {
      return runTransaction(db, async tx => {
        const ref_ = itemDoc(itemId), cur = await tx.get(ref_);
        const list = (cur.data()?.payments || []).filter(x => x.id !== p.id);
        list.push(Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)));
        tx.update(ref_, { payments: list, updatedAt: serverTimestamp() });
      });
    },

    deletePayment(itemId, paymentId) {
      return runTransaction(db, async tx => {
        const ref_ = itemDoc(itemId), cur = await tx.get(ref_);
        const list = cur.data()?.payments || [];
        const gone = list.find(x => x.id === paymentId);
        tx.update(ref_, { payments: list.filter(x => x.id !== paymentId), updatedAt: serverTimestamp() });
        return gone;
      }).then(gone => gone?.slip && this.deleteSlip(gone.slip));
    },

    async uploadSlip(blob, { itemId, paymentId }) {
      if (SLIP_MODE === "storage") {
        const path = `users/${uid()}/slips/${itemId}/${paymentId}.jpg`;
        await uploadBytes(ref(storage, path), blob, { contentType: "image/jpeg" });
        return { id: path, url: await getDownloadURL(ref(storage, path)) };
      }
      await setDoc(slipDoc(paymentId), { itemId, data: await blobToDataUrl(blob), createdAt: serverTimestamp() });
      return { id: paymentId };
    },

    async slipSrc(slip) {
      if (slip.data) return slip.data;
      if (slip.url) return slip.url;
      return (await getDoc(slipDoc(slip.id))).data()?.data || "";
    },

    async deleteSlip(slip) {
      if (SLIP_MODE === "storage" && slip.id?.startsWith("users/")) return deleteObject(ref(storage, slip.id));
      return deleteDoc(slipDoc(slip.id));
    },
  };
}
```

**Notes**
- **Offline:** `persistentLocalCache` makes reads instant and queues writes while offline. They sync when back online. Transactions need a connection, so for offline-first payment edits, swap `runTransaction` for `updateDoc` with `arrayUnion` (for adding) and accept last-write-wins on edits.
- **Live sync:** call `subscribe` once after sign-in and re-render on each snapshot.
- **The web API key isn't a secret.** Access is controlled by security rules and authorised domains. Also add **App Check** (reCAPTCHA Enterprise) before sharing the URL widely.
- **SDK version:** install with `npm i firebase` (v12.x was current mid-2026; v13 has since shipped). Pin the version in `package.json` and update deliberately.

### B.7 Indexes
None are needed. Every query is a full read of one user's `items` subcollection.

---

## 3. Migrating data from the artifact version

The artifact keeps state as JSON in the page. Move it with this one-time script:

1. Add an **Export JSON** button to the artifact (or ask Claude to). It copies `JSON.stringify(state)` to the clipboard.
2. In the new app, an **Import JSON** dialog takes the pasted JSON, runs the legacy migration (SPEC §4) and calls:

```js
async function importState(store, state) {
  for (const it of state.items) {
    const { payments = [], ...item } = it;
    const id = crypto.randomUUID();                      // fresh ids; artifact ids like "s1" may collide
    await store.saveItem({ ...item, id });
    for (const p of payments) {
      const { slip, ...pay } = p;
      await store.savePayment(id, pay);
      if (slip?.data) {                                  // inline slips can be re-uploaded
        const blob = await (await fetch(slip.data)).blob();
        const s = await store.uploadSlip(blob, { itemId: id, paymentId: p.id });
        await store.savePayment(id, { ...pay, slip: s });
      }
    }
  }
}
```

Slips held in the artifact's asset store (`/_blob/…` URLs) only resolve inside the artifact page. To keep them, re-attach them by hand or download them first.

Drop the sample items (`id` starting with `s`) unless you want them.

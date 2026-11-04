# กระเป๋าผ่อน: Deployment

How to take the app from a single-file claude.ai artifact to a standalone web app on your own hosting, backed by **Firebase** or **Google Sheets**.

> **Why leave the artifact at all?** The artifact sandbox only loads scripts from a short CDN allowlist and blocks `fetch` to other hosts. Firebase SDKs, Google Sign-In and the Apps Script API all need network access, so the backend versions must be self-hosted.

---

## 0. Project layout

Use **Vite** (vanilla JS) for a plain static build. There is no framework to learn and the output is just files.

```
installment-wallet/
├─ index.html                 # shell: <div id="app">, fonts, (GIS script for Sheets mode)
├─ public/
│  ├─ manifest.webmanifest    # PWA: name "กระเป๋าผ่อน", theme_color #101114, icons
│  └─ icons/                  # 192/512 px PNG
├─ src/
│  ├─ main.js                 # boot: sign-in → store.load() → render(); hash router
│  ├─ calc.js                 # PURE: plan(), info(), rowStatus(), forecast buckets  ← unit-tested
│  ├─ ui/                     # wallet.js, detail.js, calendar.js, forecast.js, dialogs.js
│  ├─ store/
│  │  ├─ index.js             # createStore() switch (BACKEND.md §2)
│  │  ├─ local.js             # localStorage store for dev/demo
│  │  ├─ firebase.js          # BACKEND.md §B.6
│  │  └─ sheets.js            # BACKEND.md §A.4
│  └─ styles.css              # tokens + components (DESIGN_SYSTEM.md §7)
├─ tests/calc.test.js         # vitest: SPEC.md §9 acceptance cases
├─ firebase.json  .firebaserc  firestore.rules  storage.rules     # Firebase only
├─ apps-script/Code.gs  apps-script/appsscript.json             # Sheets only
├─ .env.example
└─ package.json
```

```bash
npm create vite@latest installment-wallet -- --template vanilla
cd installment-wallet
npm i firebase          # only for the Firebase backend
npm i -D vitest
```

**Porting the artifact:** split the single HTML file along its existing sections:
- the `<style id="css">` block → `styles.css`
- `plan` / `info` / `rowStatus` / `allDues` → `calc.js`
- the `render*` functions → `ui/`
- `openForm` / `openPay` / `openSlip` / `confirmDlg` → `dialogs.js`

Then replace `save()` / `publish()` / `storeSlip()` with calls to `store.*`.

### `.env.example`
```bash
# local | firebase | sheets
VITE_BACKEND=firebase

# Firebase (Project settings → Your apps → Web app → SDK config)
VITE_FB_API_KEY=
VITE_FB_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FB_PROJECT_ID=your-project
VITE_FB_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FB_APP_ID=
VITE_SLIP_MODE=firestore          # firestore (Spark) | storage (Blaze)

# Google Sheets
VITE_SHEETS_API_URL=https://script.google.com/macros/s/XXXX/exec
VITE_GOOGLE_CLIENT_ID=XXXX.apps.googleusercontent.com
```

None of these values are secrets: they end up in the browser bundle either way. Security comes from Firebase rules or the Apps Script email allowlist. Still, keep `.env` out of git and commit `.env.example`.

---

## A. Firebase Hosting + Firestore (recommended)

### A.1 Create the project
1. Go to <https://console.firebase.google.com> → **Add project** → name it, e.g. `installment-wallet`. Analytics is optional.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.** Set the support email.
3. **Build → Firestore Database → Create database.** Choose **Standard edition**, **Production mode**, and a location such as `asia-southeast1` (Singapore), the closest region to Thailand. *The location cannot be changed later.*
4. *(Slips via Cloud Storage only.)* **Upgrade to Blaze**, then **Build → Storage → Get started.** First create a **budget alert** in Google Cloud Billing (e.g. ฿100/month). As of 3 Feb 2026 Cloud Storage for Firebase always requires Blaze, even within its no-cost quota. If you'd rather stay on Spark, use `VITE_SLIP_MODE=firestore` and skip this step.
5. **Project settings → General → Your apps → Web (`</>`)** → register the app → copy the config into `.env`.

### A.2 CLI setup
```bash
npm i -g firebase-tools
firebase login
firebase init
#  ✔ Firestore   (uses firestore.rules)
#  ✔ Hosting     public dir: dist · single-page app: Yes · GitHub deploys: optional (see A.5)
#  ✔ Storage     only if VITE_SLIP_MODE=storage
```
Then paste the rules from `BACKEND.md` §B.3 / §B.4 into `firestore.rules` / `storage.rules`.

### A.3 `firebase.json`
```json
{
  "firestore": { "rules": "firestore.rules" },
  "storage":   { "rules": "storage.rules" },
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      { "source": "/assets/**", "headers": [{ "key": "Cache-Control", "value": "public,max-age=31536000,immutable" }] },
      { "source": "/index.html", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "**", "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]}
    ]
  }
}
```
Drop the `storage` key if you don't use Cloud Storage.

### A.4 Build and deploy
```bash
npm run test              # calc.js acceptance cases
npm run build             # → dist/
firebase deploy --only firestore:rules,hosting            # add ,storage if used
# → https://installment-wallet.web.app
```

**Preview channels** give you a throwaway URL to try a change before it goes live:
```bash
firebase hosting:channel:deploy preview --expires 7d
```

### A.5 CI/CD with GitHub Actions (optional)
`firebase init hosting:github` creates a service account and two workflows: one that deploys a preview for each PR and one that deploys live on merge to `main`. Add the build step and the env vars as repository **Variables** (they aren't secrets):

```yaml
# .github/workflows/firebase-hosting-merge.yml (excerpt)
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with: { node-version: 22 }
- run: npm ci && npm test && npm run build
  env:
    VITE_BACKEND: firebase
    VITE_FB_API_KEY: ${{ vars.VITE_FB_API_KEY }}
    VITE_FB_AUTH_DOMAIN: ${{ vars.VITE_FB_AUTH_DOMAIN }}
    VITE_FB_PROJECT_ID: ${{ vars.VITE_FB_PROJECT_ID }}
    VITE_FB_STORAGE_BUCKET: ${{ vars.VITE_FB_STORAGE_BUCKET }}
    VITE_FB_APP_ID: ${{ vars.VITE_FB_APP_ID }}
    VITE_SLIP_MODE: firestore
- uses: FirebaseExtended/action-hosting-deploy@v0
  with:
    repoToken: ${{ secrets.GITHUB_TOKEN }}
    firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_INSTALLMENT_WALLET }}
    channelId: live
    projectId: installment-wallet
```

### A.6 Custom domain
1. **Hosting → Add custom domain**, e.g. `pon.yourdomain.com`.
2. Add the TXT and A records it shows at your DNS provider. SSL is issued automatically.
3. **Authentication → Settings → Authorized domains → add the custom domain.** Without this, Google sign-in fails with `auth/unauthorized-domain`.

### A.7 Hardening before sharing the URL
- [ ] Rules deployed. Test them in the **Rules Playground**: another uid can't read `users/{you}`.
- [ ] **App Check** (reCAPTCHA Enterprise) set to enforce for Firestore (and Storage).
- [ ] Budget alert set if on Blaze.
- [ ] Authorised domains list trimmed to production + `localhost`.

---

## B. Google Sheets + Apps Script backend

The frontend is still a static site (host it with §A Hosting-only, Vercel or GitHub Pages; see §C). The backend is an Apps Script **Web App** bound to a spreadsheet.

### B.1 Create the backend
1. Create a Google Sheet named `installment-wallet-db` and copy its ID from the URL.
2. Create a Drive folder `installment-wallet-slips` and copy its ID. Leave it private.
3. In the Sheet: **Extensions → Apps Script**. Paste `Code.gs` from `BACKEND.md` §A.3.
4. **Project Settings → Script properties:** add `SHEET_ID`, `SLIP_FOLDER_ID`, `CLIENT_ID` (from B.2) and `ALLOWED_EMAILS`.
5. Select `setup` in the editor toolbar → **Run**. Approve the permissions (Sheets, Drive, external requests). This creates the `items` and `payments` sheets with plain-text columns.

### B.2 Google Sign-In client ID
1. Go to <https://console.cloud.google.com> → choose the Apps Script's Cloud project (or any project).
2. **APIs & Services → OAuth consent screen:** External, app name กระเป๋าผ่อน, add yourself as a test user. While the app stays in Testing, only listed test users can sign in, which is exactly what you want for a personal app.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
   - **Authorized JavaScript origins:** `http://localhost:5173` and your production origin, e.g. `https://installment-wallet.web.app`.
   - No redirect URIs are needed (ID-token flow).
4. Put the client ID in both `VITE_GOOGLE_CLIENT_ID` (frontend) and the `CLIENT_ID` script property.

### B.3 Deploy the Web App
1. **Deploy → New deployment → Select type: Web app.**
   - **Execute as:** *Me*. The script reads your Sheet and Drive.
   - **Who has access:** *Anyone*. Browsers can't send Google cookies cross-origin, so access control is done by the ID-token check plus `ALLOWED_EMAILS` inside the script.
2. Copy the `/exec` URL into `VITE_SHEETS_API_URL`.
3. Check it: open the URL in a browser and you should get `{"ok":true,"service":"installment-wallet",…}`.

**Updating the script:** go to **Deploy → Manage deployments → ✎ Edit → Version: New version → Deploy.** This keeps the same `/exec` URL. A brand-new deployment gets a new URL.

Optionally, manage the script from git with [clasp](https://github.com/google/clasp):
```bash
npm i -g @google/clasp && clasp login
clasp clone <scriptId> --rootDir apps-script
clasp push && clasp deploy -i <deploymentId> -d "v1.4"
```

### B.4 Frontend for Sheets mode
`index.html` must load Google Identity Services and provide a button slot:
```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
<div id="gsi-button" hidden></div>
```
Then build and host the frontend as in §C with `VITE_BACKEND=sheets`.

### B.5 Operations
- **Backups:** the Sheet has version history (**File → Version history**). For a periodic copy, add a time-driven trigger running `DriveApp.getFileById(SHEET_ID).makeCopy('backup-' + date)` weekly.
- **Manual edits** in the Sheet are allowed. Keep `id` and `itemId` intact, numbers as plain numbers, and dates as `YYYY-MM-DD` text.
- **Troubleshooting:**
  - A CORS error almost always means the script threw before returning JSON, or the deployment wasn't updated to a new version. Check **Executions** in the Apps Script sidebar.
  - `forbidden` means the email isn't in `ALLOWED_EMAILS`.
  - `wrong_audience` means the `CLIENT_ID` doesn't match.

---

## C. Static hosting options (frontend only)

| Host | Free tier | Deploy | Good with |
|---|---|---|---|
| **Firebase Hosting** | 10 GB stored, 360 MB/day transfer | `firebase deploy --only hosting` | Firebase backend (same project, auth domain built in) |
| **Vercel** | Hobby plan (personal, non-commercial) | `npx vercel --prod`, or import the GitHub repo | Either backend. Preview URL per PR |
| **GitHub Pages** | Free for public repos | `actions/deploy-pages` workflow, `base` set in `vite.config.js` | Sheets backend. Simplest |
| **Netlify / Cloudflare Pages** | Generous free tiers | Git import | Either |

**Vercel specifics:**
- Framework preset **Vite**, build `npm run build`, output `dist`.
- Add the `VITE_*` env vars under **Project → Settings → Environment Variables**.
- No rewrites are needed because routing is hash-based.

**GitHub Pages specifics:**
- In `vite.config.js` set `base: "/installment-wallet/"` for a project page.
- With the Sheets backend, add `https://<user>.github.io` to the OAuth client's authorised origins.

Whichever host you choose, add its production origin to:
- (Firebase) **Auth → Authorized domains**, or
- (Sheets) **OAuth client → Authorized JavaScript origins**.

---

## D. PWA (install on the phone)

Add `public/manifest.webmanifest`:
```json
{
  "name": "กระเป๋าผ่อน",
  "short_name": "กระเป๋าผ่อน",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#101114",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```
Link it from `index.html` together with `<meta name="theme-color" content="#101114">`.

For an offline app shell, add `vite-plugin-pwa` (`registerType: "autoUpdate"`). Firestore's persistent cache already covers offline data. The Sheets backend has no offline mode.

---

## E. Cost summary (single user, ~10 plans, ~300 payments/year)

| Setup | Monthly cost | Notes |
|---|---|---|
| Firebase Spark: Auth + Firestore + Hosting, slips in Firestore | **฿0** | Each app open ≈ 10 reads, far below 50k/day |
| Firebase Blaze + Cloud Storage slips | **≈ ฿0** | ~300 slips × 300 KB ≈ 90 MB, within the no-cost tier. A card is required; set a budget alert |
| Sheets + Apps Script + any free static host | **฿0** | Uses your Google account's Drive storage for slips |

Pricing and quotas change. Check <https://firebase.google.com/pricing> before you upgrade.

---

## F. Go-live checklist

- [ ] `npm test` passes the SPEC §9 acceptance cases
- [ ] `.env` filled in for the chosen backend; `.env` is git-ignored
- [ ] **Firebase:** rules deployed, Google provider on, authorised domains set, App Check enforced, Firestore region `asia-southeast1`
- [ ] **Sheets:** `setup()` run, script properties set, deployed as *Execute as Me / Anyone*, new version published after the last edit
- [ ] Production origin added to Auth domains / OAuth origins
- [ ] Data imported from the artifact (`BACKEND.md` §3); sample items removed
- [ ] Opened on the phone, added to the home screen, a test payment with a slip recorded and deleted
- [ ] Budget alert set (Blaze only)
- [ ] Backup plan: Sheet version history and weekly copy, or Firestore export (Blaze) or the in-app JSON export

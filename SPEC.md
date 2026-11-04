# กระเป๋าผ่อน: Product Spec

**Status:** v1.3 (built and running as a claude.ai artifact)
**Last updated:** 4 Nov 2026
**Companion docs:** `DESIGN_SYSTEM.md` · `BACKEND.md` · `DEPLOYMENT.md`

---

## 1. Summary

กระเป๋าผ่อน ("installment wallet") is a personal tracker for buy-now-pay-later and card installment plans (ผ่อน 0%, ผ่อนกับไฟแนนซ์, ผ่อนผ่านบัตรเครดิต).

Each plan is shown as a credit-card-shaped tile. Tapping a card opens its detail page, which has the payment schedule and payment history.

Payments are recorded as amounts the user types in. The app does not just tick installments off, so partial payments, overpayments and early payoff all work. Payments are applied to the oldest unpaid installment first.

**Primary user:** one person in Thailand tracking 2–15 concurrent plans across several cards or lenders.
**Language:** Thai UI. Buddhist-era dates (พ.ศ.), Thai baht (฿).

### Goals
1. Never miss a due date: see what's due, when, and what's overdue at a glance.
2. Know the true balance: what's paid, what's left, and how much interest is included.
3. Plan cash flow: see how the monthly burden changes as plans finish.
4. Keep proof: attach a transfer slip to each payment.

### Non-goals (v1)
- Multi-user or household sharing
- Bank or card API sync and automatic payment detection
- Reducing-balance (ลดต้นลดดอก) interest. Only flat rate is supported (see §6.1)
- Push notifications from the app itself (see §10)

---

## 2. Views and routes

Routing uses the URL hash, ASCII only.

| Hash | View | Purpose |
|---|---|---|
| `#` (empty) | **บัตรของฉัน** (Wallet) | Summary tiles, filter, grid of cards, add-card tile |
| `#calendar` | **ปฏิทิน** (Calendar) | Month grid of due installments, month summary, list of that month's dues |
| `#forecast` | **ภาระผ่อนล่วงหน้า** (Forecast) | Stacked monthly-burden chart, "when it gets lighter" list, table view |
| `#card-{id}` | **Detail** | Big card, stats, schedule table, payment history |

- The wallet, calendar and forecast views share a header with the title, the **+ เพิ่มรายการผ่อน** button and three tab pills.
- Detail has a back button that returns to the last non-detail view.
- Dialogs (add/edit item, record payment, confirm delete, slip viewer) are overlays and do not change the hash. `Esc` or a click on the scrim closes them.

---

## 3. Features

### 3.1 Wallet (`#`)
- **Summary tiles (4):**
  1. ต้องจ่ายงวดถัดไปรวม: the sum of `owe` across active plans
  2. ยอดคงเหลือทั้งหมด: the sum of `remain`, interest included
  3. ใกล้ครบกำหนด (7 วัน): the count of active plans whose next due date is 0–7 days away
  4. เลยกำหนด: the count of active plans whose next due date has passed
- **Filter pills:** กำลังผ่อน (default) / ผ่อนครบแล้ว / ทั้งหมด
- **Sort:** active plans by next due date ascending, then finished plans.
- **Card content:** status pill, provider, name, `งวด 05/10 · ต้องจ่าย ฿4,890`, `● คงเหลือ ฿24,450 · 50%`, and a progress bar on the bottom edge.
- **Add tile:** a dashed card at the end of the grid (hidden under the ผ่อนครบแล้ว filter).
- **Sample data banner:** shown while `state.sample === true`, with a **ล้างตัวอย่าง** action (confirm first).

### 3.2 Detail (`#card-{id}`)
- Big card (same component, not clickable)
- Stats: ยอดผ่อนรวม, ดอกเบี้ยรวม (or "0%"), ชำระแล้ว, คงเหลือ
- Progress bar with "จ่ายแล้ว n จาก N งวด" and a percent
- Primary action **+ บันทึกการชำระ**, plus a hint line "ต้องจ่ายอีก ฿x เพื่อปิดงวดที่ n (ครบ date)"
- Metadata: provider, price, rate, start month, due day, last due date, note
- **Schedule table:** งวด · กำหนดชำระ · ยอดงวด · ชำระแล้ว · สถานะ · action. The next unpaid row is highlighted and has a **จ่ายงวดนี้** button.
- **Payment history:** newest first. Columns: date, amount, slip thumbnail, note, แก้ไข/ลบ. Ends with a total row.
- Header actions: **แก้ไข** (edit item) and **ลบ** (delete item, confirm first)

### 3.3 Record payment dialog
| Field | Rule |
|---|---|
| ยอดที่จ่าย | Required, > 0, ≤ remaining balance (when editing, the payment's own amount is added back) |
| Quick amounts | ยอดงวดนี้ (`owe`), จ่าย 2 งวด (`owe + per`, capped), ปิดยอดทั้งหมด (`remain`) |
| วันที่จ่าย | Required, `YYYY-MM-DD`, default today |
| หมายเหตุ | Optional, ≤ 80 chars |
| รูปสลิป | Optional image. Resized client-side to max 1600 px (1000 px when stored inline), JPEG q0.82 (0.7 inline) |

- **Live preview:** "หลังบันทึก: คงเหลือ ฿x · ชำระครบแล้ว n จาก N งวด · งวดที่ k ค้างอีก ฿y", or "ปิดยอดครบทุกงวด". It shows a red warning when the amount exceeds the balance.
- **Edit mode:** amount, date, note and slip can be changed, and the slip can be replaced or removed. A replaced or removed slip is deleted from storage.
- **Delete payment:** asks for confirmation and deletes the slip too.

### 3.4 Add / edit plan dialog
| Field | Rule | Error copy |
|---|---|---|
| ชื่อสินค้า / รายการ | Required, ≤ 60 | ใส่ชื่อรายการก่อนบันทึก |
| ผ่อนผ่านบัตร / ไฟแนนซ์ | Optional, ≤ 40 | — |
| ราคาสินค้า (บาท) | > 0, 2 dp | ราคาสินค้าต้องมากกว่า 0 |
| จำนวนงวด (เดือน) | Integer 1–120 | จำนวนงวดต้องอยู่ระหว่าง 1–120 |
| ดอกเบี้ย % ต่อเดือน | ≥ 0, ≤ 10, 2 dp (0 = ผ่อน 0%) | ดอกเบี้ยต้องไม่ติดลบ |
| ครบกำหนดทุกวันที่ | Integer 1–31 | วันครบกำหนดต้องอยู่ระหว่าง 1–31 |
| เดือนที่เริ่มผ่อนงวดแรก | `YYYY-MM` | เลือกเดือนที่เริ่มผ่อน |
| สีบัตร | One of 6 palette keys (see design system) | — |
| หมายเหตุ | Optional, ≤ 200 | — |

A live calculation line shows "ผ่อนงวดละ ฿x × N งวด · รวม ฿y (ดอกเบี้ย ฿z)".

Editing a plan keeps its payments. Allocation is recalculated against the new schedule.

### 3.5 Calendar (`#calendar`)
- Month header in Thai with พ.ศ. year, ‹ › buttons and **เดือนนี้** (shown only when away from the current month).
- **Summary tiles:** ครบกำหนดเดือนนี้ (sum of installment amounts due this month), จ่ายแล้ว (covered amounts), ยังต้องจ่าย, เลยกำหนดในเดือนนี้ (count).
- **Grid:** Sunday-first (อา จ อ พ พฤ ศ ส) with today outlined. Each due installment is an event chip in the card's colour. The chip state:
  - paid: 40% opacity and strikethrough
  - partial: amber ring
  - overdue: red ring
- On screens ≤ 640 px, chips collapse to 6 px colour bars and the list below becomes the main reading surface.
- **List:** date, colour swatch and name, provider · งวด n/N · status, amount. The row for the plan's next installment has **บันทึกการชำระ**.

### 3.6 Forecast (`#forecast`)
- **Tiles:** เดือนนี้ต้องจ่าย (includes overdue, with a note giving the overdue amount), เดือนหน้า, เดือนที่หนักที่สุด, ผ่อนหมดทุกรายการ (month, plus "อีก n เดือน").
- **Stacked bar chart:** one bar per month from the current month to the last due month.
  - Segments are per plan, in the card colour. The longest-running plan is at the bottom.
  - Hovering or tapping a bar shows a tooltip with the per-plan breakdown and the total.
  - Labels are selective: the current month always, and the peak month if it is more than 2% above the current month and far enough away to avoid collision.
- **ภาระจะลดลงเมื่อไร:** plans ordered by last due month, with "−฿per/เดือน".
- **ดูเป็นตาราง:** a collapsible table of month × plan amounts. This is the accessible alternative to the chart.

### 3.7 Slips
- Stored in the platform asset store when available. Otherwise stored inline as a data URL (fallback for offline or local use).
- Thumbnails (38 px) in payment history. A click opens a viewer showing the image, plan name, Thai long date and amount.
- HEIC may fail to decode outside Safari. The error copy tells the user to try a JPG or PNG.

---

## 4. Data model

```ts
type ColorKey = "carbon" | "mist" | "electric" | "violet" | "lime" | "steel";

interface AppState {
  updatedAt: number;        // epoch ms, last local change
  sample: boolean;          // true while demo data is present
  items: Item[];
}

interface Item {
  id: string;               // "s1" for samples, "i<base36 time><rand>" for user plans
  name: string;
  provider: string;         // card or lender, free text
  total: number;            // product price (principal), THB
  months: number;           // 1..120
  rate: number;             // flat % per month, 0 = interest-free
  start: string;            // "YYYY-MM", month of 1st installment
  dueDay: number;           // 1..31, clamped to month length
  color: ColorKey;
  note: string;
  payments: Payment[];
}

interface Payment {
  id: string;               // "p<base36 time><rand>"
  date: string;             // "YYYY-MM-DD"
  amount: number;           // THB, 2 dp
  note: string;
  slip?: Slip;
}

type Slip =
  | { id: string; url: string }   // uploaded asset (artifact store / Firebase / Drive)
  | { data: string };             // inline data URL fallback
```

**Legacy migration** runs on load:
- `item.paid: string[]` (one date per paid installment) becomes `payments[]`, each with the scheduled amount. Any existing `payments` are appended.
- Old gradient colour keys map to the new palette: obsidian→carbon, ocean→electric, rose→violet, emerald→lime, gold→steel, sunset→lime. Anything unknown becomes electric.

---

## 5. Derived values (never stored)

All money is rounded to 2 dp with `r2(n) = round(n × 100) / 100`. The tolerance is `EPS = 0.005`.

| Name | Definition |
|---|---|
| `interest` | `total × rate/100 × months` |
| `grand` | `r2(total + interest)` |
| `per` | `floor(grand / months × 100) / 100` (rounded down) |
| `last` | `r2(grand − per × (months − 1))`. The last installment absorbs rounding |
| `rows[i].due` | Month `start + i`, day `min(dueDay, daysInMonth)` |
| `rows[i].cumDue` | Running sum of installment amounts |
| `paidAmt` | `r2(Σ payments.amount)` |
| `rows[i].covered` | `clamp(paidAmt − cumDue[i−1], 0, amount)` |
| `rows[i].full` | `covered ≥ amount − EPS` |
| `rows[i].paidAt` | Date of the payment, in date order, that pushed the running total to `≥ cumDue[i] − EPS` |
| `paidN` | Count of `full` rows |
| `next` | First row that is not `full`, or null |
| `owe` | `r2(next.cumDue − paidAmt)`, the amount needed to clear `next` |
| `remain` | `max(0, r2(grand − paidAmt))` |
| `pct` | `min(100, paidAmt / grand × 100)` |
| `done` | `next == null` |

## 6. Business rules

### 6.1 Interest
Only flat-rate interest (ดอกเบี้ยคงที่) is supported: interest is charged on the full principal for every month of the plan. This matches Thai retail and card installment quotes such as "0.69% ต่อเดือน".

### 6.2 Allocation
Payments are pooled and applied to installments in schedule order, regardless of which installment the user "meant" to pay:
- An overpayment rolls forward.
- An underpayment leaves the current installment partially covered.

### 6.3 Status
Status is computed against the local date (`todayStr()`, device timezone).

| Condition (on `next`) | Card pill | Class |
|---|---|---|
| `done` | ผ่อนครบแล้ว | good (outline) |
| due < today | เลยกำหนด n วัน | bad (solid red) |
| due = today | ครบกำหนดวันนี้ | warn (solid inverse) |
| due within 1–7 days | อีก n วัน | warn |
| otherwise | ครบ {d MMM yy} | info (outline) |

| Row status | Rule | Copy |
|---|---|---|
| paid | `full` | ชำระครบ {paidAt} |
| part | `covered > 0` | จ่ายแล้ว ฿x · ค้าง ฿y. Shown in red (over) if past due |
| over | not covered, past due | เลยกำหนด |
| soon | is `next`, due within 7 days | ใกล้ครบกำหนด |
| wait | otherwise | รอชำระ |

### 6.4 Forecast bucketing
For each active plan, each unpaid row adds `amount − covered` to the bucket for its due month. Rows from past months are moved into the current month.

---

## 7. Persistence (current build)

The app currently runs as a claude.ai artifact:

1. State is embedded in the page as `<script type="application/json" id="state">`.
2. On change, `localStorage` is written immediately. A debounced (1.5 s) call to `artifact.publish(html)` then re-serialises the whole page with the new state. Open views reload to the new version, and a `conflict` from a concurrent publish is ignored.
3. Slips use the `assets` capability. If that is unavailable they are stored inline.
4. Read-only viewers receive `not_granted`/`not_writer`. A toast tells them their edits stay on that device only.

The standalone build replaces this with a `Store` adapter (`BACKEND.md` §2).

---

## 8. Accessibility
- Every interactive element is a real `<button>` or `<a>`, with a visible `:focus-visible` ring.
- Status is never colour-only. Every pill and status dot carries text.
- The chart has `role="img"` and an `aria-label`, plus a full table under **ดูเป็นตาราง**.
- Dialogs use `role="dialog"`/`alertdialog` with `aria-modal`, initial focus on the first field or primary action, and `Esc` to close.
- `prefers-reduced-motion` disables transitions.
- Contrast targets and known exceptions are in `DESIGN_SYSTEM.md` §2.4.

## 9. Acceptance criteria (key paths)
- [ ] Adding a plan of 10,000 / 3 months / 0% gives a schedule of 3,333.33 · 3,333.33 · 3,333.34.
- [ ] Paying 5,000 on that plan marks installment 1 full, makes installment 2 partial (1,666.67 covered), and sets `owe` to 1,666.66.
- [ ] Deleting that payment returns every row to unpaid, and the slip (if any) is deleted from storage.
- [ ] Paying more than `remain` is blocked with "ยอดเกินที่ค้างอยู่ ใส่ได้ไม่เกิน ฿x".
- [ ] A plan with `dueDay` 31 starting in February is due on 28 (or 29) Feb.
- [ ] A plan whose next due date is yesterday shows "เลยกำหนด 1 วัน" and is counted in เลยกำหนด.
- [ ] The forecast total for the current month equals the sum of `owe`-to-date across plans, including overdue amounts.
- [ ] The calendar shows every installment in its month, and paid installments are struck through.
- [ ] At 390 px wide there is no horizontal page scroll. Tables scroll inside their own container.

## 10. Roadmap candidates
1. Payoff calculator (ปิดยอดก่อนกำหนด): savings versus continuing, for flat-rate plans with a lender-specific rebate rule
2. Monthly budget cap with a warning when the forecast exceeds it
3. Reducing-balance interest mode
4. Group by card or provider
5. Export to Excel/CSV, and JSON backup/restore
6. Due-date reminders via a scheduled job (Cloud Function cron or Apps Script time trigger, sending LINE/email/FCM)

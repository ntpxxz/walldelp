# กระเป๋าผ่อน: Design System

**Direction:** "Swatch sheet". Flat solid colour blocks, outlined capsule badges, big bold labels, monospace figures. There are no gradients, glows or drop shadows on cards.
**Source:** the user's palette sheet (Carbon / Mist / Electric / Violet / Lime / Steel), extended for the app.
**Themes:** light (default) and dark. Card colours are identical in both themes. Only surfaces, ink and chart tints change.

---

## 1. Principles
1. **The block is the component.** Information sits on colour, not inside boxes on top of colour.
2. **One badge shape.** Every label-like thing (status, tile caption, tab, filter) is the same outlined capsule.
3. **Big name, small code.** The display name is large and bold. Supporting figures are monospace, like a hex code.
4. **Dot = meta.** A leading 8 px dot marks a secondary fact line, as in "● 5.8:1 with Mist".
5. **Status is text first.** Colour reinforces state but never carries it alone.

---

## 2. Colour

### 2.1 Brand palette (card and tile fills)

| Token | Hex | Text on it | Contrast | Use |
|---|---|---|---|---|
| `--carbon` | `#101114` | Mist `#EEF0F2` | 16.5 : 1 (AAA) | Card, summary tile 2, primary ink |
| `--mist` | `#EEF0F2` | Carbon | 16.5 : 1 (AAA) | Card (needs a 1 px `#C9CDD2` border), summary tile 4 |
| `--electric` | `#2547E8` | White | 6.7 : 1 (AA) | Card, summary tile 1, **accent** (light theme) |
| `--violet` | `#5F31C4` | White | 7.7 : 1 (AAA) | Card |
| `--lime` | `#C6F04A` | Carbon | 14.4 : 1 (AAA) | Card, summary tile 3 |
| `--steel` | `#55606D` | White | 6.4 : 1 (AA) | Card, muted ink (light) |

Rule: **Lime and Mist take Carbon text. Everything else takes white or Mist text.** In code these are the `LIGHT_CARD = {mist, lime}` keys.

### 2.2 Theme tokens

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#0B0C0E` | Page, dialog |
| `--surface` | `#F6F7F8` | `#16181C` | Panels, calendar days, inputs' summary box |
| `--surface-2` | `#EEF0F2` | `#1F2227` | Hover fill, progress track |
| `--line` | `#D5D9DE` | `#2C3037` | Borders, table rules |
| `--ink` | `#101114` | `#EEF0F2` | Primary text, active pill fill |
| `--muted` | `#55606D` | `#9AA3AE` | Secondary text |
| `--accent` | `#2547E8` | `#5B78FF` | Primary button, focus ring, progress |
| `--carbon-edge` | `#101114` | `#33373F` | Border for Carbon blocks so they don't vanish on the dark bg |

### 2.3 Semantic (status) colours
These are separate from the palette and never used as a card colour.

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--good` | `#17804F` | `#5FD39A` | Paid, savings |
| `--warn` | `#9A6200` | `#F2C14E` | Due soon, partial |
| `--bad` | `#D0312D` | `#FF6B6B` | Overdue, destructive |
| Overdue pill fill | `#E5484D` + white text | same | Card status "เลยกำหนด" |

### 2.4 Chart / small-mark tints (`--k-*`)
Marks in the calendar and chart (bars, chips, legend swatches) use tints adjusted per theme so every colour stays visible on that theme's background.

| Key | Light | Dark |
|---|---|---|
| carbon | `#101114` | `#8E95A1` |
| mist | `#B9BFC7` | `#EEF0F2` |
| electric | `#2547E8` | `#5B78FF` |
| violet | `#5F31C4` | `#8C63F0` |
| lime | `#A9D82B` | `#C6F04A` |
| steel | `#55606D` | `#7D8896` |

**Known contrast exceptions (to fix):**
- The overdue pill (white on `#E5484D`) is **3.9 : 1**. That passes only as large or bold text, and the pill is 11.5 px bold. Switch the fill to `#D0312D` (5.05 : 1).
- `--bad` red on the Mist summary tile is 4.4 : 1. It is acceptable because the value is 28 px display text (large-text AA ≥ 3 : 1).
- Users pick card colours, so two plans can share a colour and the colours are not CVD-optimised. Identity is always carried by the name too: legend, tooltip, list and table.

---

## 3. Typography

| Role | Family | Weight | Size / line-height |
|---|---|---|---|
| Display (h1, card name, tile value, dialog title) | **Prompt** → IBM Plex Sans Thai → system-ui | 600–700 | h1 30/1.2 · card name 24/1.2 (21 on ≤ 420 px) · tile value 28/1.15 (22) · section 18 · dialog 22 |
| Body | **IBM Plex Sans Thai** | 400–600 | 15/1.55. Small text 13–13.5 |
| Figures (money on cards, table numbers, dates in lists, hex codes) | **IBM Plex Mono** → IBM Plex Sans Thai | 500–600 | 14 on cards, inherits elsewhere |
| Badge | Body | 700 | 11.5, letter-spacing 0.02em |
| Provider label | Body | 600 | 11.5, uppercase, letter-spacing 0.08em |

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&family=Prompt:wght@500;600;700&display=swap">
```

- `font-variant-numeric: tabular-nums` applies wherever numbers stack.
- Headings use `text-wrap: balance`.
- Thai has no letter case. Uppercase applies only to Latin provider names.

---

## 4. Space, shape, elevation

| Token | Value | Notes |
|---|---|---|
| `--r` | 10 px | Cards, tiles, panels |
| Small radius | 8 px (buttons, inputs, calendar days), 5–7 px (chips, small buttons) | |
| Capsule | 99 px | Badges, tabs, filter pills |
| Grid gap | 12 px (cards), 10 px (tiles), 6 px (calendar) | |
| Page | max-width 1120, padding 28/20 (20/16 on ≤ 420) | Gutter is always ≥ 16 px |
| Section gap | 22 px | |
| Elevation | **None** on cards. Dialog has a 1 px line. Tooltip has a soft shadow `0 10px 30px -12px rgba(16,17,20,.35)` | Flat is the identity |
| Borders | 1 px structural, **1.5 px** interactive (buttons, badges, inputs) | |

**Breakpoints:** 820 (summary 4 → 2 columns, detail stacks) · 640 (calendar chips become bars, list rows wrap) · 420 (form becomes 1 column, type steps down).

---

## 5. Components

### 5.1 Badge (`.pill`)
An outlined capsule using `currentColor`, so it adapts to whatever block it sits on.

| Variant | Look | Use |
|---|---|---|
| default / info / good | 1.5 px outline, transparent | Normal status, tile captions |
| `warn` | Solid `currentColor` fill, text in `--card-bg` (inverse) | Due today, due in ≤ 7 days |
| `bad` | Solid `#E5484D` (→ `#D0312D`), white text | Overdue |

Markup: `<span class="pill warn"><span>อีก 1 วัน</span></span>`. The inner span exists so the inverse variant can recolour the text.

### 5.2 Wallet card (`.cc.c-{color}`)
- Credit-card ratio `aspect-ratio: 1.586`, radius 10, padding 16/18, solid fill, no shadow.
- **Top row:** badge (left) and provider (right, uppercase, 0.8 opacity, ellipsis).
- **Bottom block:**
  - Name (display 24, clamp 2 lines)
  - `.num` mono line: `งวด 05/10 · ต้องจ่าย ฿4,890`
  - `.dot` meta line: `● คงเหลือ ฿24,450 · 50%`
- **Progress:** a 4 px bar flush to the bottom edge. Fill is `currentColor` and the track is 18% `currentColor`.
- **Hover:** `translateY(-3px)` and nothing else. The card is a `<button>` in the grid and a `<div>` in the detail view.
- The Mist card gets a 1 px `#C9CDD2` border. The Carbon card gets `--carbon-edge`.

### 5.3 Summary tile (`.tile`)
- Min-height 150, radius 10. Badge caption at the top, big display value at the bottom, `.s` dot meta line under it.
- Fixed colour order by position: **1 Electric · 2 Carbon · 3 Lime · 4 Mist**. Tiles 1–3 force the value colour to inherit. Tile 4 may show `--bad` for a non-zero overdue count.

### 5.4 Buttons (`.btn`)
| Variant | Fill | Border | Text | Hover |
|---|---|---|---|---|
| default | transparent | 1.5 px ink | ink | `--surface-2` |
| `primary` | accent | accent | white | inverts to ink fill and bg text |
| `danger` | transparent | bad | bad | `--surface-2` |
| `ghost` | transparent | none | muted | ink text, `--surface-2` |
| `sm` | — | — | 13 px, padding 5/12, radius 7 | — |

### 5.5 Tabs and filters
Both are capsules, 1.5 px `--line` outline and muted text. Active is a solid ink fill with bg-coloured text. Tabs are `<a href="#…" aria-current="page">`. Filters are `<button aria-pressed>`.

### 5.6 Colour picker (`.swatches`)
A 3 × 2 grid of 58 px blocks. Each shows the colour name in display weight and the hex code in mono 10.5 px, which is a mini version of the source swatch sheet. The selected swatch gets a 2.5 px ink outline (offset 2) and a ✓.

### 5.7 Panel, table, status dot
- **Panel:** `--surface`, 1 px line, radius 10, padding 18/20.
- **Table:** 1 px row rules, muted 13 px headers, numbers right-aligned in mono. The "next" row is tinted with 7% accent.
- **Status dot (`.st`):** an 8 px dot plus a 13 px semibold label, coloured with the semantic tokens.

### 5.8 Calendar
- **Day cell:** `--surface`, radius 8, min-height 96 (54 on mobile), mono date number. Today has a 1.5 px ink border.
- **Event chip (`.ev`):** solid `--k-{color}` fill and the card's text colour.
  - paid: 0.4 opacity and strikethrough
  - partial: 2 px `--warn` ring
  - overdue: 2 px `--bad` ring
- Mobile: chips collapse to 6 px bars.

### 5.9 Chart (forecast)
- Stacked bars. Width is `min(40, slot × 0.64)`, with a **2 px gap** between segments and a 4 px rounded top on the top segment.
- Grid: dashed 1 px `--line` with a solid baseline. Axis labels are muted 11.5 mono (k-abbreviated).
- Direct labels: the current month, plus the peak month if it differs and won't collide.
- Hover or tap shows a column highlight (ink at 6%) and a tooltip with the breakdown and a bold total.
- The chart is rendered at the container's real pixel width, so text never scales down. It re-renders on resize.
- The legend under the chart is always shown. The table alternative lives under **ดูเป็นตาราง**.

### 5.10 Dialog, toast
- **Dialog:** bg colour, 1 px line, radius 14, padding 22, `rgba(16,17,20,.55)` scrim. Title in display 22.
- **Inputs:** 1.5 px line, radius 8, padding 9/11. Focus turns the border ink with no glow.
- **Toast:** an ink capsule with bg-coloured text, bottom-centre, shown for 2.6 s, with `role="status"`.

---

## 6. Voice and copy (Thai)
- Speak from the user's side, with short verbs: **บันทึกการชำระ**, **จ่ายงวดนี้**, **ปิดยอดทั้งหมด**, **ล้างตัวอย่าง**.
- Every error says what's wrong and the limit: "ยอดเกินที่ค้างอยู่ ใส่ได้ไม่เกิน ฿12,995.02".
- Dates:
  - `d MMM yy` พ.ศ. in tables and pills (`15 พ.ย. 69`)
  - long form in the viewer and metadata (`25 มกราคม 2570`)
  - Use `toLocaleDateString("th-TH", …)`.
- Money: `฿` prefix, `th-TH` grouping, 0–2 dp (`฿4,890`, `฿3,871.01`).
- Destructive confirmations name the thing and its consequence: "ลบ “iPhone…”? ข้อมูลการผ่อนและประวัติการจ่ายของรายการนี้จะหายไปทั้งหมด".

---

## 7. CSS token block (drop-in)

```css
:root{
  --carbon:#101114; --mist:#EEF0F2; --electric:#2547E8; --violet:#5F31C4; --lime:#C6F04A; --steel:#55606D;
  --bg:#FFFFFF; --surface:#F6F7F8; --surface-2:#EEF0F2; --line:#D5D9DE;
  --ink:#101114; --muted:#55606D; --accent:#2547E8; --on-accent:#FFFFFF;
  --good:#17804F; --warn:#9A6200; --bad:#D0312D;
  --k-carbon:#101114; --k-mist:#B9BFC7; --k-electric:#2547E8; --k-violet:#5F31C4; --k-lime:#A9D82B; --k-steel:#55606D;
  --carbon-edge:#101114;
  --f-display:"Prompt","IBM Plex Sans Thai",system-ui,sans-serif;
  --f-body:"IBM Plex Sans Thai",system-ui,sans-serif;
  --f-num:"IBM Plex Mono","IBM Plex Sans Thai",ui-monospace,monospace;
  --r:10px;
  color-scheme:light;
}
/* dark: apply under @media (prefers-color-scheme:dark) :root:not([data-theme="light"]) AND :root[data-theme="dark"] */
:root[data-theme="dark"]{
  --bg:#0B0C0E; --surface:#16181C; --surface-2:#1F2227; --line:#2C3037;
  --ink:#EEF0F2; --muted:#9AA3AE; --accent:#5B78FF;
  --good:#5FD39A; --warn:#F2C14E; --bad:#FF6B6B;
  --k-carbon:#8E95A1; --k-mist:#EEF0F2; --k-electric:#5B78FF; --k-violet:#8C63F0; --k-lime:#C6F04A; --k-steel:#7D8896;
  --carbon-edge:#33373F;
  color-scheme:dark;
}
```

```js
// JS tokens used by components
export const CARD_COLORS = [
  ["carbon","Carbon","#101114"], ["mist","Mist","#EEF0F2"], ["electric","Electric","#2547E8"],
  ["violet","Violet","#5F31C4"], ["lime","Lime","#C6F04A"], ["steel","Steel","#55606D"],
];
export const LIGHT_CARD = { mist: true, lime: true };          // take Carbon text
export const MARK = k => `var(--k-${k})`;                        // chart/calendar tint
```

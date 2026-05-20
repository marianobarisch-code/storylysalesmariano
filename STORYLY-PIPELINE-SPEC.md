# Storyly Sales Pipeline App — Full Specification

## Overview

A personal sales pipeline management app for a Storyly sales rep covering LATAM enterprise SaaS deals. The app tracks active opportunities, calculates deal probability using a weighted 6-component model (HAI framework), manages parallel process tracks per deal, and tracks quota achievement.

**Stack:** Vite + React, deployed to Vercel via GitHub. localStorage for persistence with JSON export/import as backup. The storage layer is abstracted so it can be swapped for Supabase or another backend later.

**GitHub repo:** Already created. Vercel account already created. Connect the repo to Vercel for auto-deploy.

---

## App Structure

Three tabs in the main navigation:

1. **Home** — Placeholder for now. Will become a dashboard later.
2. **Pipeline Management** — The core tab (build this fully).
3. **Prospecting** — Placeholder for now.

---

## Pipeline Management — Features

### Summary Metrics Bar (top of page)

Four cards displayed in a row:

| Card | What it shows |
|------|---------------|
| **Total Pipeline** | Sum of ARR of all OPEN deals. Shows count of active deals below. |
| **Weighted Pipeline** | Sum of (ARR × probability/100) for all OPEN deals. Subtitle: "Expected new ARR". |
| **Closed Won** | Sum of ARR of all CLOSED WON deals. Shows count below. |
| **Quota** | Clickable card. Shows quarter name, achievement %, gap to target, and a mini progress bar. Clicking opens a modal to set the quota target and quarter name. If no target is set, shows "Click to set target". |

### Deal Status

Every deal has a `deal_status` field:
- `open` — Active deal in pipeline
- `closed_won` — Deal won
- `closed_lost` — Deal lost

Status can be changed from the deal detail panel via "Won", "Lost", or "Reopen" buttons.

### Status Filter

A segmented control in the toolbar with four options:
- **All** (count) — Shows all deals
- **Open** (count) — Shows only open deals (default view)
- **Won** (count) — Shows only closed won deals
- **Lost** (count) — Shows only closed lost deals

### Column Visibility Toggle

A "Columns" dropdown button in the toolbar. Clicking opens a dropdown with checkboxes for each column. User can show/hide any column. Columns available:

| Column Key | Label | Visible by default |
|------------|-------|--------------------|
| account_name | Account | Yes |
| new_arr | ARR | Yes |
| type | Type | Yes |
| country | Country | Yes |
| probability | Probability | Yes |
| status | Status | Yes |
| tracks | Tracks | Yes |
| flowla | Flowla | Yes |
| last_update | Last Update | Yes |
| service_order | Service Order | No |
| contact | Contact | No |
| created | Created | No |

### Pipeline Table

Sortable table with all visible columns. Clicking any row opens the Deal Detail panel. Table features:
- Click column headers to sort (toggle asc/desc)
- Hover highlight on rows
- Track status shown as 4 small colored squares (one per track)
- Type shown as a badge (blue "New" or yellow "Upsell")
- Status shown as a colored badge
- Probability shown in color (green ≥75, yellow ≥50, orange ≥25, red <25)
- Empty state: "No deals match the current filter. Click + New Deal to add an opportunity."

### New Deal / Edit Deal Modal

A form modal with the following fields in a 2-column grid:

| Field | Type | Required | Default |
|-------|------|----------|---------|
| Account Name | text | Yes | — |
| Contact Name | text | No | — |
| New ARR (USD) | number | No | 0 |
| Type | select: New Business / Upsell | No | New Business |
| Country | select (see country list below) | No | — |
| Deal Status | select: Open / Closed Won / Closed Lost | No | Open |
| Last Meeting | date | No | — |
| Last Update Date | date | No | — |
| Last Update / Message | text (full width) | No | — |
| Service Order | select (see options below) | No | N/A |
| Flowla Engagement | select: None / Low / High | No | None |
| Flowla URL | text (full width) | No | — |
| Notes | textarea (full width) | No | — |

**Country options:** Argentina, Brazil, Chile, Colombia, Mexico, Peru, Ecuador, Uruguay, Paraguay, Bolivia, Venezuela, Costa Rica, Panama, Dominican Republic, Guatemala, USA, Canada, Spain, Other.

**Service Order options:** N/A, Pending Review, Under Review, Approved, Rejected.

### Deal Detail Panel

A modal that opens when clicking a deal row. Contains:

**Header:**
- Account name + status badge
- Contact name and country subtitle
- Action buttons: Won / Lost (if open), Reopen (if closed), Edit, Delete, Close (✕)

**Metrics row (4 cards):**
- ARR
- Probability (clickable — opens Probability Scorer)
- Type (New Biz / Upsell)
- Forecast category (Pipeline / Best Case / Commit / Closed)

**Activity section:**
- Last Meeting date + "(Xd ago)" — red if >14 days
- Last Update date + "(Xd ago)" — yellow if >7 days
- Last Message/Update text

**Status fields (3 cards):**
- Service Order status
- Flowla engagement + link to open Flowla URL
- Time in Pipeline (days since created)

**Process Tracks (visual — THIS IS IMPORTANT):**
This is NOT a global Kanban board. It is a visualization INSIDE each deal showing the 4 parallel sub-processes. Each track shows:
- Track name (colored)
- Current status badge
- A clickable progress bar with 4 segments (Not Started → In Progress → Blocked → Done)
- Click any segment to update that track's status
- Labels below each segment

The 4 tracks are:
1. **Tech Review** (purple #6366f1)
2. **Legal Review** (amber #f59e0b)
3. **Business Case** (green #10b981)
4. **Pricing Negotiation** (red #ef4444)

Each track has 4 possible statuses:
- `not_started` (gray #94a3b8)
- `in_progress` (blue #3b82f6)
- `blocked` (red #ef4444)
- `done` (green #22c55e)

The tracks are PARALLEL — they are not sequential stages. A deal can have Tech Review done, Legal in progress, Business Case not started, and Pricing blocked — all at the same time.

**Notes section** (if notes exist).

### Delete Confirmation Modal

Simple confirmation dialog: "Are you sure you want to delete [Account Name]? This cannot be undone." with Cancel and Delete buttons.

### Quota Settings Modal

Opens when clicking the Quota card. Fields:
- Quarter (text, e.g. "Q2 2026")
- Quota Target (USD, number)

---

## Probability Model — HAI 6-Component Framework

This is the scoring system for deal probability. Each deal has 6 components scored 0-100 via sliders, with weights that sum to 100%.

| Component | Weight | What it measures |
|-----------|--------|-----------------|
| ICP & Use Case Fit | 20% | Mobile app-centric brand, multi-use case need, CDP in stack, enterprise budget ($30K+ ARR), industry match (retail, fintech, media, telco) |
| Champion & Power Access | 20% | Internal advocate + access to economic buyer. #1 predictor of deal closure. |
| Pain & Compelling Event | 15% | Documented business pain + date-driven urgency (app relaunch, competitor churn, CMO mandate) |
| Budget & Economic Buyer | 15% | Budget allocated, EB confirmed amount, next cycle planned |
| Decision Process & Timeline | 15% | Mutual close plan, procurement engaged, legal/security review started |
| Competitive Position | 15% | POC won, recommended vendor, no major objections |

**Formula:** `Probability = Σ (component_score × weight)`

**Probability Scorer Modal:**
- Opens from the Deal Detail panel (click on probability %)
- Shows all 6 components with:
  - Label + weight percentage
  - Description of what to score
  - Slider (0-100, step 5)
  - Current value in color
- Footer shows calculated probability as a large number + forecast category badge
- Save/Cancel buttons

**Forecast category mapping:**

| Range | Label |
|-------|-------|
| 0-25% | Pipeline |
| 26-50% | Best Case |
| 51-75% | Commit |
| 76-90% | Commit |
| 91-100% | Closed |

**Color coding for probability:**
- ≥75%: green (#22c55e)
- ≥50%: yellow (#f59e0b)
- ≥25%: orange (#f97316)
- <25%: red (#ef4444)

---

## Data Model

### In-Memory / localStorage Structure

```json
{
  "deals": [...],
  "scores": { "deal_id": { "icp_fit": 0, "champion_power": 0, ... } },
  "tracks": [...],
  "settings": { "quota_target": 0, "quota_quarter": "Q2 2026" }
}
```

### Deal Object

```json
{
  "id": "uuid",
  "account_name": "string (required)",
  "contact_name": "string",
  "new_arr": "number",
  "type": "new_business | upsell",
  "country": "string",
  "deal_status": "open | closed_won | closed_lost",
  "probability": "number (0-100, auto-calculated)",
  "last_meeting_date": "date string",
  "last_update_note": "string",
  "last_update_date": "date string",
  "service_order_status": "not_applicable | pending_review | under_review | approved | rejected",
  "flowla_engagement": "none | low | high",
  "flowla_url": "string",
  "notes": "string",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

### Probability Scores (keyed by deal ID)

```json
{
  "icp_fit": 0,
  "champion_power": 0,
  "pain_urgency": 0,
  "budget_eb": 0,
  "decision_process": 0,
  "competitive_pos": 0
}
```

### Track Status Object

```json
{
  "id": "uuid",
  "opportunity_id": "deal uuid",
  "track_name": "tech_review | legal_review | business_case | pricing",
  "status": "not_started | in_progress | blocked | done",
  "updated_at": "ISO timestamp"
}
```

When a new deal is created, automatically create 4 track status rows (one per track, all `not_started`) and a default probability scores entry (all zeros).

---

## Storage Layer

Abstract all data persistence into a separate module (`storage.js`) with these functions:

- `loadData()` → returns the full data object
- `saveData(data)` → persists the full data object
- `exportToFile(data)` → downloads as JSON file
- `importFromFile(file)` → reads a JSON file and returns parsed data

Current implementation uses localStorage. The app auto-saves on every state change (debounced). This abstraction makes it easy to swap for Supabase API calls later — only `storage.js` changes, the rest of the app stays the same.

---

## UI / Design

- **Font:** system-ui, -apple-system, sans-serif
- **Primary color:** Indigo (#6366f1) — used for brand, active tabs, primary buttons
- **Background:** #f8fafc
- **Cards/modals:** white with #e2e8f0 borders, rounded corners (8-12px)
- **No external CSS framework** — all inline styles
- **Modals:** Overlay with backdrop blur/dim, centered, max-width varies, scroll if tall
- **Responsive:** max-width 1200px centered container

---

## Project Structure

```
storyly-pipeline/
├── package.json          (Vite + React)
├── vite.config.js
├── index.html
├── .gitignore            (node_modules, dist, .vercel, .DS_Store)
└── src/
    ├── main.jsx          (React entry point)
    ├── App.jsx           (Full app component)
    └── storage.js        (localStorage abstraction)
```

---

## Deployment

- **GitHub:** Repo already created
- **Vercel:** Account already created. Connect the GitHub repo → Vercel auto-detects Vite and deploys. Every push to main auto-deploys.
- **Framework preset:** Vite
- **Build command:** `vite build`
- **Output directory:** `dist`

---

## Future Considerations (not for v1)

- Swap localStorage for Supabase (when a free project slot opens) — only change `storage.js`
- Home tab: dashboard with pipeline analytics, charts, trends
- Prospecting tab: lead research and tracking
- LATAM-specific probability adjustments from HAI framework:
  - Procurement risk discount (multiply final score by 0.85 if procurement not mentioned)
  - Regional reference boost (+10-15 points on competitive position if 2+ LATAM logos in same vertical)
  - Cap any deal without EB access at 75% max probability

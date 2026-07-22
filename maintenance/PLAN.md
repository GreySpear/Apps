# Home Maintenance Log — Plan

A phone-first home maintenance log. Track what you've done to the house
(with receipts), what needs doing on a schedule, and the appliances/equipment
it all attaches to — synced to a Google Sheet in your Drive.

## Decisions (agreed 2026-07-16)

| Decision | Choice |
|---|---|
| Reminders | **Dashboard only** — an overdue / due-soon list when you open the app. No emails, no triggers. |
| Home inventory | **Yes in v1** — appliances/equipment with brand, model, serial, install date, warranty expiry; tasks and log entries can link to an item. |
| Seeded tasks | **Yes** — a curated starter checklist of common home tasks you can toggle on/off before adding. |
| Photos/receipts | **Yes** — attach photos (receipts, nameplates, before/after) to log entries and items, stored in a folder in your Google Drive via the backend. |
| Cost tracking | Deferred (a plain cost field exists on log entries, but no spend summaries yet). |
| Multiple properties | Deferred. |
| Sync backend | Google Apps Script + Google Sheet, same pattern as Recipes / Grocery List. |
| Hosting | GitHub Pages from this repo: `https://greyspear.github.io/Apps/maintenance/` |

## Architecture

Two pieces, mirroring the Recipes app:

1. **`maintenance/index.html`** — the entire app in one file (HTML/CSS/JS).
   Works offline from `localStorage`; syncs (debounced full-replace push,
   pull on load) when a backend URL is configured in Settings.
2. **`maintenance/backend.gs`** — Apps Script bound to a private Google
   Sheet. Read/save for three sheets, plus photo upload/read/delete against
   a Drive folder it creates ("Home Maintenance Photos").

## Data model

Three sheets, one per concept. Column order is the contract between app and
backend — keep them in sync with `HEADERS_*` in `backend.gs`.

### `items` — the home inventory
`id, name, category, brand, model, serial, location, installDate,
warrantyExpiry, notes, photos, createdAt, updatedAt`

- `photos` is a JSON array of Drive file IDs.
- `category` is one of the shared category keys below.

### `tasks` — recurring maintenance schedule
`id, name, itemId, category, intervalValue, intervalUnit, lastDone, notes,
createdAt, updatedAt`

- `intervalUnit` ∈ `days | weeks | months | years`; due date =
  `lastDone + interval`, computed client-side.
- `lastDone` empty = never logged → shown as "not started" with a prompt
  to either mark it done or backdate when it was last done.
- `itemId` optionally links the task to an inventory item.

### `log` — what actually happened
`id, date, title, itemId, taskId, category, cost, doneBy, notes, photos,
createdAt, updatedAt`

- `doneBy`: free text — "DIY" or a contractor/company name.
- `taskId` set when the entry came from "Mark done" on a recurring task
  (that's also what resets the task's clock: the task's `lastDone` is
  updated to the entry's date).
- `photos`: JSON array of Drive file IDs (receipts etc.).

### Categories (shared by items, tasks, log)
`hvac 🌬️ · plumbing 🚿 · electrical ⚡ · appliances 🧺 · exterior 🏠 ·
interior 🛋️ · safety 🧯 · yard 🌳 · other 🔩`

## Due-status logic (dashboard)

For each task with an interval:
- `dueDate = lastDone + interval`
- **Overdue** — past due date.
- **Due soon** — within the "soon window": 15% of the interval, clamped to
  7–30 days.
- **OK** — everything else.
- **Not started** — no `lastDone` yet; shown in its own group so new
  (e.g. seeded) tasks don't scream "overdue" on day one.

The dashboard sorts overdue first (most overdue at top), then due soon,
then not started, then OK (soonest first).

## Photos

- Client downscales to ≤1600px JPEG before upload (same approach as the
  recipes OCR upload) → `POST {action:'uploadPhoto', image, mimeType, name}`
  → backend saves into the "Home Maintenance Photos" Drive folder, returns
  the file ID. Only the ID is stored in the sheet.
- Display: `GET ?action=photo&id=…` returns base64 + mime; the app renders a
  data URI and caches it in memory for the session.
- Removing an attachment calls `{action:'deletePhoto', id}` which trashes
  the Drive file (recoverable from Drive's trash).
- Uses plain `DriveApp` — no advanced Drive service needed, unlike the
  recipes OCR feature.

## Seeded starter checklist

First run (and any time from Settings) offers ~16 common tasks — HVAC filter,
gutter cleaning, smoke detector tests, water heater flush, dryer vent, etc. —
each with a sensible default interval. Presented as a checked list; uncheck
what doesn't apply, tap Add. Seeds arrive with no `lastDone` ("not started").

## Backend API summary

- `GET ?action=read` → `{items:[[…]], tasks:[[…]], log:[[…]]}`
- `GET ?action=photo&id=…` → `{ok, data:<base64>, mimeType}`
- `POST {action:'save', items, tasks, log}` → full-replace all three sheets
- `POST {action:'uploadPhoto', image, mimeType, name}` → `{ok, id}`
- `POST {action:'deletePhoto', id}` → `{ok}`

## Later / ideas

- Cost totals per year / category.
- Multiple properties (a `property` column on all three sheets).
- Email digest of due tasks (time-based Apps Script trigger) if dashboard-only
  turns out to be too passive.
- Warranty-expiry surfacing on the dashboard.
- Attach PDFs (manuals) to items, not just images.

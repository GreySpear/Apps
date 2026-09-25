# Waypoint

An **offline-first travel PWA**. A trip is authored as a single `trip.json` file (Claude generates these), imported into the app, and then fully readable on your phone with **zero network** — which is exactly when you need it: landing at an airport, driving Big Sur with no signal.

Lives alongside the `kitchen` app: same repo, static, no backend, no build step. Just HTML + CSS + vanilla JS.

## The core promise

1. Import one `trip.json` → see the whole trip.
2. Works with no signal.
3. Share the trip to another person as a single file; they import and have everything.

## The share round-trip

```
Claude generates trip.json
        │
        ▼
You import it into Waypoint  ──►  Share (share sheet / save file)  ──►  Spouse imports into their installed app
```

- **Author:** Claude writes a `trip.json` (schema below). See **[Authoring trips with Claude](#authoring-trips-with-claude)** for a reusable Project setup.
- **Import:** Trips home → **Import trip** → **choose a `.json` file** *or* **paste** the JSON Claude gave you. It's parsed, validated, and stored in IndexedDB. (Paste is the easy path on a phone.)
- **Share:** a trip's **Share** action exports the **plan only** (`trip.json`) via the native share sheet (`navigator.share` with a file) where supported, or falls back to downloading / copying the file. Your personal docs and typed-in confirmation numbers stay on your device by default — sharing offers to include confirmations, but never docs.
- **Re-import = merge:** importing a trip you already have refreshes the plan content but **keeps** your checklist ticks, typed confirmation numbers, custom checklist items, and docs (they're keyed to the trip id and stored separately).

## Screens

- **Itinerary** — day-by-day: big day number, label, title, the timed beats, and the `fuel` coffee/rest note. Color-coded by `segment`. Two-pane (day list + detail) on a wide/unfolded screen (≥ ~800px); single column on a phone, with a sticky row of day chips to jump between days.
- **Today** — during a trip the itinerary opens on today's day, with a "Day 3 of 9" banner, progress bar, and what's next. Before a trip it shows a countdown, which also appears on the trip card. Opening the app with no link mid-trip goes straight to that trip. Add `?today=YYYY-MM-DD` to the URL to preview any date.
- **Reservations** (the offline vault) — grouped by type. Each card shows name, date/time, a large **tap-to-copy** confirmation number, address with **Open in Google Maps**, tap-to-call, and any **attached docs** (📎 Attach adds a boarding pass or voucher straight to the card). Confirmation and notes are **editable inline** and persist locally (survive re-import).
- **Checklists** — tick items (state saved locally); add/remove your own items.
- **Docs** — add photos/PDFs (boarding passes, confirmations) from the phone. Stored as blobs in IndexedDB, viewable **fully offline**. The viewer can link a doc to a reservation or delete it. On-device only; never shared.

## Data model

The shared file is `trip.json`. A complete example ships as [`trips/california-2027.json`](trips/california-2027.json).

```jsonc
{
  "schemaVersion": 1,
  "trip": {
    "id": "stable-slug",          // required — IndexedDB key
    "title": "string",            // required
    "subtitle": "string",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "dateLabel": "Early–mid October 2026",
    "party": "2 adults",
    "homeBases": [ { "city": "…", "area": "…", "nights": 4 } ],
    "notes": "string"
  },
  "days": [
    { "n": 1, "date": "YYYY-MM-DD", "segment": "LA|DRIVE|SF|…",
      "label": "short tag", "title": "headline",
      "beats": [ { "time": "Morning", "text": "…" } ],
      "fuel": "the coffee/rest-stop note (may be empty)" }
  ],
  "reservations": [
    { "type": "flight|hotel|tour|car|restaurant|other",
      "name": "…", "confirmation": "", "datetime": "free-form or a range",
      "address": "…", "phone": "…", "notes": "…",
      "id": "optional stable id — recommended so your typed confirmations survive a rename" }
  ],
  "checklists": [ { "name": "…", "items": [ "string", "…" ] } ]
}
```

Parser notes:
- Everything is optional except `trip.id` and `trip.title`; whatever is present renders.
- `schemaVersion` gates migrations. A file newer than the app knows is rejected with a clear message; unknown top-level keys are ignored.
- `segment` is an open string used for color-coding — colors are assigned by first-seen segment, with `LA`/`DRIVE`/`SF` seeded to the brand palette.
- **Local edits keying:** typed confirmations and checklist ticks are keyed by an explicit `id` when present, otherwise by a hash of the content (`type|name` for reservations, `list|text` for checklist items). Add `id`s in the plan if you expect to rename items between versions.

## Authoring trips with Claude

Plan every future trip in a Claude **Project** that outputs a file Waypoint imports directly. The one-time setup and paste-in prompt live in **[`authoring/`](authoring/)**:

- **`authoring/PROJECT_INSTRUCTIONS.md`** — paste into your Project's custom instructions.
- **`authoring/trip.schema.json`** — the formal schema (Claude validates against it).
- **`authoring/TEMPLATE.trip.json`** — an annotated skeleton.

Then: plan the trip in that Project → say *"make the Waypoint file"* → copy the JSON → **Import trip → paste** in the app. Reuse the same `trip.id` when revising a trip so your local edits survive. Full walkthrough in [`authoring/README.md`](authoring/README.md).

## Bundled trips

Trips can also ship with the app: drop the file in `trips/`, add `{ "id", "file" }` to `trips/index.json`, and add it to `SHELL` in `sw.js` (so it's cached offline). On launch the app imports any listed trip it hasn't seen before on that device. That's how a trip committed to the repo reaches phones without a manual import (it may take one extra launch while the service worker updates).

- Each id is imported **once per device**. Delete it in the app and it stays deleted.
- A trip that's already on the device (e.g. you pasted a newer version) is **never overwritten**. To push a revision to a trip that's already on a phone, share or import the file as usual.

## Install

Tap the **?** button in the app for platform-aware install steps, or:

- **Android (Chrome):** menu → *Add to Home screen* / *Install app*.
- **iPhone (Safari only):** Share → *Add to Home Screen*. (Chrome and other iOS browsers can't install PWAs.) The app shows this hint automatically on iOS.

Once installed, open it once online; after that it works in airplane mode.

## Offline

- The app shell (HTML/CSS/JS, icons, fonts, and the bundled trips) is precached by `sw.js` (cache-first, versioned, currently `v2`). Bump `VERSION` in `sw.js` to roll caches on a new release.
- Trip data, docs, and your local edits live in IndexedDB — no network needed to read a trip.
- **Storage note (iOS):** Safari may evict an unused PWA's storage after a few weeks. Nothing is irreplaceable — re-import the plan, re-add docs. Keep original boarding passes elsewhere too.

## Files

```
waypoint/
  index.html      # shell
  app.js          # views, hash routing, IndexedDB, import/export/share
  styles.css      # palette (light + dark), responsive / two-pane Fold layout
  sw.js           # service worker: precache shell, versioned cache
  manifest.json   # PWA manifest (standalone, maskable icons)
  icons/          # 192, 512, maskable-512 (+ make_icons.py that generates them)
  trips/
    index.json                # which trips ship with the app (see "Bundled trips")
    portland-maine-2026.json
    philadelphia-2026.json
    california-2027.json
  authoring/      # the Claude Project kit: PROJECT_INSTRUCTIONS, schema, template
```

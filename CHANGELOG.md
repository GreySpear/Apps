# Changelog

A running history of changes to the apps in this repo (Kitchen + Recipes +
Groceries + Home Maintenance Log). Newest first.

## 2026-07-29

### Kitchen — Serving-size scaling on the recipe detail view
- **Servings stepper** in the Ingredients header (shown when a recipe has a
  numeric servings count). Tapping **−/+** rescales every ingredient line live —
  `2 cups` → `4 cups`, `1 cup` → `½ cup`, `½ cup` → `1 cup` — with a **Reset**
  that appears once you've changed it. Whole-serving recipes step by 1;
  fractional bases step by ½.
- Only a **leading quantity** is scaled and re-formatted (via the existing
  `parseQty` + `fmtQty`); the rest of the line is untouched, so package sizes in
  parens (`1 (14 oz) can`) and qty-less lines (`salt to taste`) stay correct.
  Checked-off ingredients keep their state across a rescale.
- **"To grocery list"** from a scaled recipe sends the **scaled** quantities and
  notes the target servings in the review modal.
- Pure `scaleIngredientLine` added to the tested engine block; 10 new assertions
  in `kitchen/test/engine.test.js` (now 50).

### Kitchen — Instagram reels import (caption + link-following)
- **Paste an Instagram reel link.** A pasted `instagram.com/reel|reels|p|tv|
  share/…` URL is detected and routed to a reel-specific path: the backend
  fetches it with a browser user-agent and the app lifts the caption out of the
  `og:` preview tags, then runs it through the caption path. Button labels the
  flow ("Reading reel…"). Best-effort by nature — when Instagram serves a login
  wall, it falls back to a clear "open the reel, copy the caption, paste it
  here" message instead of failing silently.
- **Caption paste now follows links (the reliable win).** When a pasted caption
  is thin on ingredients but carries a link to a **real recipe page**, the app
  follows that link through the backend fetcher and parses the full recipe
  (JSON-LD) from there. Covers both "recipe in caption" and "recipe linked
  out." A **link-in-bio aggregator** (linktr.ee, beacons, bio.link, …) is never
  auto-followed — it's saved on the recipe as a link for you to tap.
- **Refactor:** the single-URL import split into `handleRecipeUrl` /
  `handleInstagramUrl` / `handleCaptionText`, sharing one `fetchAndParseRecipe`
  helper. New pure, node-tested helper block (`KITCHEN-IMPORT-START/-END`):
  `extractUrls`, `classifyLink`, `isInstagramUrl`, `instagramKind`,
  `extractInstagramCaption`, `usableCaptionFromOg`.
- Tests: `kitchen/test/import.test.js` (35 assertions) runs against the shipped
  helpers; scenarios and manual-test guidance in `kitchen/test/IMPORT-notes.md`.
  No backend change — reuses the existing `{action:'fetch'}` endpoint.

## 2026-07-28

### Kitchen — Meal planner + smart grocery aggregation
- **New Plan tab** (third top-level mode: 🍳 Recipes · 📅 Plan · 🧺 Groceries).
  A Monday-start weekly view with prev/next nav; assign recipes to any day
  (from the Plan tab's per-day **+ Add** picker, or from a recipe's new
  **📅 Add to plan**). No meal slots — a day just holds recipes, matching the
  cook-dinner/leftovers-for-lunch workflow.
- **One-tap "Build grocery list"** turns the planned week into a shopping list,
  scaling each recipe's ingredients by its plan-entry servings.
- **Smart aggregation engine** (`kitchen/index.html`, pure + node-tested):
  parses free-text ingredient lines (quantities as integers/decimals/fractions/
  unicode/ranges, leading *or* trailing units), canonicalizes names (strips prep
  descriptors, keeps identity words, light de-pluralize), **merges duplicates**
  across recipes, **skips staples** (pre-unchecked, not hidden), and **groups by
  aisle** (Produce · Meat & Seafood · Dairy & Eggs · Bakery · Frozen · Pantry &
  Dry · Spices). Merges into existing grocery items instead of duplicating.
- **Shared review modal:** the single-recipe "To grocery list" now runs through
  the same engine (dedupe, staples-aware, aisle-grouped) as the week builder.
- **Backend:** one new `plan` tab (`id | date | recipeId | servings |
  createdAt`); `GET ?action=read` now returns `plan` too; saved via the existing
  `POST {sheet:'plan'}` full-replace path. Same one-deployment setup.
- Tests: `kitchen/test/engine.test.js` (40 assertions) runs against the shipped
  engine by extracting it from `index.html`. Spec in `kitchen/PLAN-mealplanner.md`.

### Kitchen — Recipes + Groceries consolidated into one app
- **New `kitchen/` app** merges the Recipes and Grocery List apps into a single
  phone-first web app, with a top-level **🍳 Recipes / 🧺 Groceries** switch.
  Same design language, one install, one home-screen icon.
- **One backend, one Sheet, one URL.** `kitchen/backend.gs` folds both old
  backends together: `GET ?action=read` now returns `{recipes, items, staples}`
  in a single call, and `doPost` dispatches recipe ops by `action`
  (`save`/`fetch`/`ocr`) and grocery ops by `sheet` (`items`/`staples`). The
  Sheet auto-creates three tabs (`recipes`, `items`, `staples`). Replaces the
  old two-deployment, two-URL setup.
- **"To grocery list" is now in-app and instant.** Sending a recipe's
  ingredients to the grocery list appends to the shared in-app list (with a
  "View" jump) instead of making a cross-deployment HTTP round-trip — no
  separate Grocery List URL to configure.
- **Migration-friendly.** Reuses the same `localStorage` cache keys, and the
  sync URL falls back to the old Recipes/Grocery URLs, so existing data and
  connection carry over on the same device. The old `recipes/` and `groceries/`
  apps are left intact.
- Setup consolidated into `kitchen/SETUP.md` (one deployment; Drive/OCR opt-in
  step preserved). Parser, categorizer, and row round-trips verified with a
  node harness.

## 2026-07-16

### Home Maintenance Log — new
- **Planned and built the Home Log** (`maintenance/index.html`) — a
  phone-first, single-file web app in the same style as Recipes/Groceries,
  with three tabs:
  - **Due** — recurring tasks (HVAC filter, gutters, smoke detectors…) with
    intervals; the dashboard groups them into *Overdue / Due soon / Not
    started / On schedule*. Tapping **Done** logs the work and resets the
    task's clock. Reminders are dashboard-only by design (no emails).
  - **History** — the maintenance log: what was done, when, cost, DIY vs.
    contractor, notes, and **photo/receipt attachments** stored in a
    "Home Maintenance Photos" folder in your Drive. Searchable, grouped by
    month.
  - **Home** — an inventory of appliances/equipment (brand, model, serial,
    location, install date, warranty expiry, photos). Tasks and log entries
    can attach to an item; the item page shows its specs, linked tasks, and
    full history.
- **Starter checklist**: ~16 common home tasks with sensible default
  intervals, offered on first run (and from Settings) as a toggle list.
- **Sync**: offline `localStorage` cache syncing to a private Google Sheet
  (three tabs: `items`, `tasks`, `log`), same pattern as the other apps.
- **Backend** (`maintenance/backend.gs`) + setup guide
  (`maintenance/SETUP.md`): read/save plus photo upload/read/delete via
  standard DriveApp — no advanced services to enable.
- Decisions and data model recorded in `maintenance/PLAN.md`. Deferred for
  later: cost summaries, multiple properties, email digests.

## 2026-07-15

### Recipes app — photo import (OCR)
- **New "Photo" tab** on the Add Recipe screen: take a picture of a written
  or printed recipe (cookbook page, recipe card) and it's converted to text
  and parsed into a recipe, using **Google Drive's free built-in OCR** via the
  Apps Script backend — no API keys, no cost. Photos are downscaled on the
  phone before upload, OCR'd via a temporary Google Doc that is deleted
  immediately, and the text runs through the same parser + auto-categorizer
  as caption paste.
- Backend: new `{action:'ocr'}` endpoint in `recipes/backend.gs` (requires
  enabling the Drive API service — one checkbox, documented in
  `recipes/SETUP.md`). Works whether or not it's enabled; the app shows a
  pointer to the setup step if it isn't.
- **Parser fix** caught while testing: numbered lines like "1. Brown the
  beef" were being classified as ingredients when the text had no
  "Ingredients:" heading (common in OCR'd text). Steps now win; quantity
  lines like "1.5 cups cream" are unaffected.

## 2026-07-14

### Recipes app — new
- **Planned and built the Recipe Box** (`recipes/index.html`) — a phone-first,
  single-file web app in the same style as the Grocery List.
- **Paste-to-import**: one box auto-detects a URL vs. pasted text.
  - URL → fetched server-side and parsed from the page's schema.org recipe
    data (title, ingredients, steps, photo, servings, times).
  - Text (e.g. an Instagram caption) → heuristic parser pulls out the
    ingredients and steps.
  - Always lands on an editable preview before saving.
- **Auto-categorization** into 8 categories (poultry, seafood, pork, beef,
  vegetables, soup, dessert, others), with one-tap manual override.
- **Features**: search over titles + ingredients, category chips with counts,
  favorites, an "I cooked this" log with least-recently-cooked sorting,
  full-screen **cooking mode** that keeps the screen awake, and
  **Send to grocery list**.
- **Sync**: offline `localStorage` cache that syncs to a private Google Sheet.
- **Installable**: add-to-home-screen support (standalone display, theme color).
- **Backend** (`recipes/backend.gs`) + setup guide (`recipes/SETUP.md`):
  Google Apps Script that reads/writes the recipe sheet and fetches recipe
  webpages server-side (avoiding the phone browser's cross-site restrictions).
- Hosted on **GitHub Pages**.

### Groceries app — new + fixes
- **Added a deployable backend** (`groceries/backend.gs`) + setup/linking guide
  (`groceries/SETUP.md`). The app previously had only its HTML with no backend
  script in the repo; this implements the read/save contract it already speaks.
- **Linked Recipes → Groceries**: "Send to grocery list" appends a recipe's
  chosen ingredients straight into the grocery `items` sheet.
- **Fixed mobile horizontal overflow**: the add-item row was wider than the
  screen (~433px on a 390px phone), pushing the **+** button off the right
  edge. Added `min-width:0` to the flex inputs (plus an `overflow-x:hidden`
  guard) so the row fits; long item names now truncate cleanly.

### Recipes app — fixes
- **Fixed the recipe editor being invisible**: tapping *Edit* opened the edit
  screen but left the detail screen on top of it (same stacking level, later in
  the DOM), so editing appeared to do nothing. `openEditor` now closes the
  detail screen too.

### Housekeeping
- Added this changelog and `TODO.md`.

### Notes
- The Grocery List app was reorganized from `Grocery List/grocery-list.html`
  to `groceries/groceries.html`.
- Live URLs (GitHub Pages):
  - Recipes: `https://greyspear.github.io/Apps/recipes/`
  - Groceries: `https://greyspear.github.io/Apps/groceries/groceries.html`

# Changelog

A running history of changes to the apps in this repo (Recipes + Groceries).
Newest first.

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

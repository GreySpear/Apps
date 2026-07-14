# Recipes App — Plan

A phone-first recipe box. Paste a recipe from anywhere (webpage URL or Instagram
caption text), it gets parsed, auto-categorized, and saved — synced to a Google
Sheet in your Drive.

## Decisions (agreed 2026-07-14)

| Decision | Choice |
|---|---|
| Parsing | Free heuristic parser (no API keys). URL import via schema.org JSON-LD; caption paste via built-in text parser. |
| Sync backend | Google Apps Script + Google Sheet, same pattern as Grocery List. |
| Hosting | GitHub Pages from this repo. |
| V1 extras | Search + photos, Cooking mode, Send to Grocery List, Favorites + "cooked it" log. |

## Architecture

Two pieces, mirroring the Grocery List app:

1. **`recipes/index.html`** — the entire app in one file (HTML/CSS/JS).
   Recipes cached in `localStorage` so the app works offline; syncs to the
   backend when online. Installable via "Add to Home Screen" (inline web app
   manifest, standalone display, theme color).

2. **`recipes/backend.gs`** — a Google Apps Script the user pastes into
   script.google.com once and deploys as a web app (same 5-minute setup as the
   Grocery List). It serves two jobs:
   - **Database**: reads/writes recipe rows in a Google Sheet
     (`GET ?action=read`, `POST {action:'save', rows}` — full-replace,
     last-write-wins, same model as Grocery List).
   - **Fetcher**: `POST {action:'fetch', url}` — fetches a recipe webpage
     server-side with `UrlFetchApp` (no CORS problem), extracts just the
     `<script type="application/ld+json">` blocks and `og:` meta tags, and
     returns those (small payload). The client parses the Recipe object out.

## Importing a recipe

Single "Add recipe" flow with one paste box that auto-detects what was pasted:

- **URL** → send to backend fetcher → parse schema.org `Recipe` JSON-LD
  (title, ingredients, instructions, image, servings, times). Falls back to
  `og:title` / `og:image` + manual entry if the site has no structured data.
- **Text (Instagram caption etc.)** → heuristic parser:
  - Find the ingredients block: lines starting with quantities/fractions/units
    or bullet markers, or following an "Ingredients" heading (with emoji/case
    tolerance).
  - Find steps: numbered lines, or lines after "Instructions/Directions/Method",
    or remaining sentence-like lines.
  - First non-list line becomes the title.
- **Always show a preview/edit screen before saving** — user can fix anything
  the parser got wrong, including category. Manual from-scratch entry uses the
  same screen.

## Auto-categorization

Categories: `poultry, seafood, pork, beef, vegetables, soup, dessert, others`.

Keyword scorer over title (weighted higher) + ingredients:
- **dessert**: cake, cookie, brownie, pie, ice cream, custard, pudding, tart, mochi, cheesecake, frosting…
- **soup**: soup, stew, chowder, bisque, pho, ramen (brothy), congee, hot pot…
- **seafood**: shrimp, salmon, fish, cod, tuna, crab, lobster, scallop, clam, mussel, squid, tilapia…
- **poultry**: chicken, turkey, duck, quail, wings, thigh, drumstick…
- **pork**: pork, bacon, ham, sausage, prosciutto, chorizo, ribs (pork), belly…
- **beef**: beef, steak, brisket, ground beef, short rib, oxtail, veal…
- **vegetables**: no meat keywords matched and produce/tofu/beans/eggs dominate.
- **others**: nothing matched confidently.

Precedence when multiple match: dessert and soup (dish-type) beat protein
categories; among proteins, highest score wins. Category is always editable
with one tap — the guess just has to be right most of the time.

## Data model

One recipe per Sheet row; JSON in the client:

```
id, title, category, sourceUrl, imageUrl,
ingredients[]            (strings, one per line)
steps[]                  (strings)
servings, prepTime, cookTime, notes,
favorite (bool), cookedDates[] (ISO dates),
createdAt, updatedAt
```

Sheet columns mirror these; `ingredients`, `steps`, `cookedDates` stored
JSON-encoded in their cells.

## V1 features

- **Home**: category tabs/chips (with counts) + search box (matches title and
  ingredients). Recipe cards show photo, title, category color, favorite star.
- **Recipe view**: photo, ingredients with tap-to-check, steps, source link,
  notes, "I cooked this" button (appends today to `cookedDates`).
- **Cooking mode**: full-screen one-step-at-a-time view, big text, prev/next,
  screen kept awake via the Wake Lock API (with fallback).
- **Send to Grocery List**: settings holds the Grocery List's Apps Script URL.
  In a recipe, tap-select ingredients → app pulls current grocery `items`
  (`GET ?action=read`), appends rows `[id, name, 1, '', '0']`, and POSTs the
  items sheet back — exactly the format grocery-list.html uses.
- **Favorites + cooked log**: star filter; sort by "least recently cooked".
- **Sync status dot** + manual sync button, same UX as Grocery List.

## Hosting & install

- Enable GitHub Pages on this repo (main branch, root). App URL becomes
  `https://greyspear.github.io/Apps/recipes/`.
  - Note: repo must be public for free Pages. Also consider a redirect page or
    linking the Grocery List from the recipe app's settings later.
- Open the URL on the phone → "Add to Home Screen" → standalone full-screen app.

## Build phases (subagent work)

1. **Backend** — `recipes/backend.gs` + `recipes/SETUP.md` (step-by-step
   phone-friendly setup instructions with screenshots-level detail).
2. **App** — `recipes/index.html`: UI shell, storage/sync, import parsers,
   categorizer, all V1 features. Visual style: match Grocery List's design
   language (same fonts, card style, palette family) so they feel like siblings.
3. **Polish & verify** — test the parser against 4–5 real recipe pages' JSON-LD
   and 2–3 sample Instagram-style captions (fixtures committed under
   `recipes/test/`), enable Pages, end-to-end walkthrough.

Suggested agents: one Opus agent for phase 2 (the big design+logic file), a
Sonnet agent for phase 1 (small, well-specified), phase 3 done in the main
session. Phases 1 and 2 can run in parallel — the API contract between them is
fully specified above.

## Out of scope for V1 (future ideas)

- AI-assisted caption parsing (optional API key) — plan option already discussed.
- Serving-size scaling of ingredient quantities.
- Import from photos/screenshots (OCR).
- Meal planning calendar.

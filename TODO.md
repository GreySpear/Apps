# TODO

Ideas and planned work, roughly in priority order.

## Next up

### Instagram Reels import — shipped (2026-07-29)
Goal: paste a reel and get the recipe, covering both cases you described —
some reels have the recipe **in the caption**, some **link out** to a full
recipe elsewhere.

Reality check first: Instagram actively blocks automated fetching, and it
tends to block datacenter servers (like Google Apps Script) hardest. So the
plan is built around what's reliable, with best-effort on the rest.

Confirmed UX preference: the paste box accepts **either** a pasted caption
**or** a reel share link and does the right thing automatically — both are
used equally often.

- [x] **Caption paste + link-following (reliable — the main win).**
      When you paste caption text, it scans for a URL. If there's a link to a
      real recipe page, it follows it through the backend fetcher and parses
      the full recipe (JSON-LD) from there. If there's no link, it
      heuristic-parses the caption as before.
      - Handles "recipe in caption" *and* "recipe linked."
      - Link *aggregators* (linktr.ee, beacons, a bio "link in bio") aren't
        recipe pages, so they're surfaced as a saved link for you to tap
        rather than auto-parsed.
- [x] **Paste a reel URL directly (best-effort).**
      Backend fetches the reel URL with a browser user-agent; the app lifts
      the caption out of the `og:`/meta tags, then runs it through the same
      caption + link-following path.
      - When Instagram shows a login wall instead, it falls back to a clear
        "open the reel, copy the caption, and paste it here" message.
- [x] Detect `instagram.com/reel|reels|p|tv|share/...` URLs specifically and
      label the import ("Reading reel…") so the flow is obvious.
- [x] Unit tests for URL extraction, link classification, reel detection, and
      og-caption extraction (`kitchen/test/import.test.js`, 35 assertions);
      scenarios documented in `kitchen/test/IMPORT-notes.md`.

Stretch (only if the free path proves too flaky):
- [ ] Optional AI-assisted caption parsing via an Anthropic API key in
      settings — handles messy, emoji-heavy captions far better. Off by
      default, costs a fraction of a cent per import.

## Setup / operational
- [ ] Deploy the **grocery backend** to its own Google Sheet and paste its URL
      into both the Grocery app and the Recipes app's *Grocery List URL* field
      (see `groceries/SETUP.md`), so "Send to grocery list" is live.

## Home Maintenance Log — later ideas
- [ ] Cost totals per year / per category on the History tab.
- [ ] Multiple properties (a `property` field on items/tasks/log).
- [ ] Optional weekly email digest of due tasks (time-based Apps Script
      trigger) if dashboard-only turns out to be too passive.
- [ ] Surface warranty expiries on the Due dashboard.
- [ ] Attach PDFs (manuals) to items, not just images.

## Nice-to-haves
- [ ] Cleaner grocery URL: rename `groceries/groceries.html` → `index.html` so
      it lives at `.../Apps/groceries/`.
- [ ] True offline support via a service worker (so the app shell loads with no
      connection, not just cached data).
- [ ] Serving-size scaling — adjust ingredient quantities when you change
      servings.
- [x] ~~Import a recipe from a photo (OCR)~~ — done: Photo tab on the import
      screen, using Google Drive's free OCR via the backend. (A possible later
      upgrade: AI vision via an API key, which handles messy handwriting
      better.)
- [ ] Simple meal-planning / weekly calendar view.

## Done
See `CHANGELOG.md`.

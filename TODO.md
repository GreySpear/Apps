# TODO

Ideas and planned work, roughly in priority order.

## Next up

### Instagram Reels import
Goal: paste a reel and get the recipe, covering both cases you described —
some reels have the recipe **in the caption**, some **link out** to a full
recipe elsewhere.

Reality check first: Instagram actively blocks automated fetching, and it
tends to block datacenter servers (like Google Apps Script) hardest. So the
plan is built around what's reliable, with best-effort on the rest.

Confirmed UX preference: the paste box should accept **either** a pasted
caption **or** a reel share link and do the right thing automatically — both
are used equally often.

- [ ] **Caption paste + link-following (reliable — the main win).**
      When you paste caption text, scan it for a URL. If there's a link to a
      real recipe page, follow it through the backend fetcher and parse the
      full recipe (JSON-LD) from there. If there's no link, heuristic-parse
      the caption as we do today.
      - Handles "recipe in caption" (already works) *and* "recipe linked."
      - Caveat: link *aggregators* (linktr.ee, beacons, a bio "link in bio")
        aren't recipe pages, so those can't be auto-parsed — we'd surface the
        link for you to tap.
- [ ] **Paste a reel URL directly (best-effort).**
      Backend fetches the reel URL with a browser user-agent and tries to pull
      the caption out of the `og:`/meta tags, then runs it through the same
      caption + link-following path.
      - Works when Instagram serves the preview tags; when it shows a login
        wall instead, fall back to a clear "paste the caption text instead"
        message.
- [ ] Detect `instagram.com/reel|p|share/...` URLs specifically and label the
      import so the flow is obvious.
- [ ] Test against several real reels (caption-recipe, linked-recipe,
      login-walled) and document results in `recipes/test/`.

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

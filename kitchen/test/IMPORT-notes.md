# Import — Instagram reels & link-following

How the Paste tab decides what to do, and how to test it.

## Routing (in `doParse`)

The paste box takes a single URL **or** free-text caption:

1. **A bare Instagram URL** (`instagram.com/reel|reels|p|tv|share/…`)
   → `handleInstagramUrl`. Backend fetches it with a browser user-agent; we
   lift the caption from the `og:description` preview tag and hand it to the
   caption path. If Instagram serves a login wall (no usable caption), we ask
   you to paste the caption text instead.
2. **Any other bare URL** → `handleRecipeUrl` (the original server-side
   JSON-LD fetch).
3. **Caption text** → `handleCaptionText`, which:
   - heuristic-parses the caption, and
   - if the caption is *thin* (< 2 ingredients) but contains a **real recipe
     link**, follows that link through the backend and uses the full parsed
     recipe instead (source = the followed link).
   - a **link-in-bio aggregator** (linktr.ee, beacons, bio.link, …) is never
     followed — it's saved to the recipe's source/notes for you to tap.

## The three scenarios (from the plan)

| Scenario | Input | Result |
|---|---|---|
| **Recipe in caption** | Caption with `Ingredients:` / steps | Parsed locally, no network. |
| **Recipe linked out** | Caption with a blog/allrecipes link | Link followed, full JSON-LD recipe. |
| **Aggregator only** | Caption whose only link is `linktr.ee/…` | Caption parsed; aggregator link saved for a tap. |
| **Login-walled reel** | A reel URL Instagram won't preview | Clear "paste the caption text instead" message. |

## Unit tests

`node kitchen/test/import.test.js` — runs against the real shipped helpers
(extracted from the `KITCHEN-IMPORT-START/-END` block in `index.html`), so the
tests can't drift from what ships. Covers `extractUrls`, `urlHost`,
`classifyLink`, `isInstagramUrl`, `instagramKind`, `extractInstagramCaption`,
and `usableCaptionFromOg`.

## Manual / live testing

The pure logic is unit-tested above. The **live** Instagram fetch can only be
verified from a real deployment, because Instagram blocks datacenter IPs (incl.
Apps Script) unpredictably — that's exactly why the direct-reel path is
best-effort and the caption + link-following path is the reliable primary. To
spot-check live:

1. Deploy the latest `kitchen/backend.gs` (New version) and set the sync URL.
2. Try a reel whose recipe is **in the caption** → should fill locally.
3. Try a reel that **links out** (caption or bio link to a recipe blog) →
   should follow the link and fill from JSON-LD.
4. Try a reel Instagram **login-walls** → should show the "paste the caption"
   fallback, not a silent failure.

Record anything surprising here.

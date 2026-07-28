# Kitchen — Sync Setup

The **Kitchen** app is the Recipes app and the Grocery List app merged into
one. It has a top switch — **🍳 Recipes** and **🧺 Groceries** — and both share
a single Google Sheet, a single Apps Script deployment, and a single sync URL.

This replaces the old two-app setup (two sheets, two deployments, two URLs, and
a separate "Grocery List URL" field). Now there's just **one** URL to paste,
and "To grocery list" from a recipe drops straight into your in-app list — no
second backend to reach.

Takes about 5 minutes, once. You can do the whole thing from your phone.

## Steps

1. **Create a sheet.** Go to [sheets.google.com](https://sheets.google.com)
   and create a new blank spreadsheet. Name it e.g. **Kitchen** (the name
   doesn't matter — the app doesn't check it).

2. **Open the script editor.** **Extensions → Apps Script**. This opens a new
   tab with a blank code editor.

3. **Paste the backend code.** Delete the default stub (`function
   myFunction() {}`), and paste in the entire contents of
   [`backend.gs`](./backend.gs) from this folder. Save (Ctrl/Cmd+S).

4. **Deploy as a web app.**
   - Click **Deploy → New deployment**.
   - Click the gear icon next to "Select type" and choose **Web app**.
   - **Execute as:** `Me` (your account).
   - **Who has access:** `Anyone`.
   - Click **Deploy**.

5. **Authorize it.** The first time, Google asks you to authorize the script —
   this is expected, it needs permission to read/write your sheet and fetch
   web pages. Click **Authorize access**, pick your account, and when you see
   *"Google hasn't verified this app"*, click **Advanced → Go to (your project)
   (unsafe)**, then **Allow**. That warning is normal for a personal script you
   pasted yourself.

6. **Copy the Web App URL** (ends in `/exec`):
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

7. **Paste it into the app.** Open Kitchen → the **⚙ Settings** button (top
   right) → paste into the **Sync URL** field → **Save**. It should say
   **Synced** within a couple seconds.

That's it. The script auto-creates three tabs in the sheet the first time it
runs:

```
recipes:  id | title | category | sourceUrl | imageUrl | ingredients | steps |
          servings | prepTime | cookTime | notes | favorite | cookedDates |
          createdAt | updatedAt
items:    id | name | qty | unit | checked
staples:  id | name | qty | unit
```

Reuse the same URL on any device (phone, laptop, tablet) — or share it with
whoever you split groceries with — to see the same recipes and list everywhere.

> Tip: deploy into a **fresh** sheet. The script treats row 1 of each tab as a
> header row.

## Enable photo import (OCR) — one extra checkbox

The recipe **Photo** tab (snap a picture of a written/printed recipe) uses
Google Drive's built-in text recognition. It needs one extra service enabled:

1. In the Apps Script editor, in the left sidebar next to **Services**, click
   the **+**.
2. Pick **Drive API** and click **Add** (the default version is fine).
3. Publish a new version: **Deploy → Manage deployments** → pencil icon →
   **Version: New version** → **Deploy**.
4. **Re-authorize — easy to miss.** The deployed web app keeps running on the
   permissions you granted originally and will NOT prompt you on its own; photo
   imports fail with a *"You do not have permission to call
   drive.files.create"* error until you do this. In the editor, select
   **`authorizeOnce`** in the toolbar's function dropdown (next to Run) and
   click **Run** — the authorization dialog appears, now including Google Drive.
   Walk through it the same way as before. No redeploy needed afterwards.

How it works: your photo is briefly converted to a temporary Google Doc in your
own Drive (that's what extracts the text), the text is read out, and the temp
doc is deleted immediately. Nothing is kept.

If you skip this section, everything else still works — the Photo tab just shows
a message pointing you here.

## Coming from the old two-app setup?

If you previously ran the separate **Recipes** and **Grocery List** apps:

- **Your data is safe.** Kitchen reads the same local cache keys, so on the
  same browser/device your existing recipes and grocery list appear
  automatically. Your saved sync URL is picked up too (Kitchen falls back to
  the old Recipes URL, then the old Grocery URL, if it doesn't have its own yet).
- **To fully consolidate onto one sheet**, do the setup above with **one** new
  sheet and paste that single URL into Kitchen's Settings. On first connect the
  app pushes your current recipes, items, and staples up to the new sheet's
  three tabs.
- The old `recipes/` and `groceries/` apps still work unchanged if you're not
  ready to switch — Kitchen is additive.

## Troubleshooting

- **"Sync error"** — confirm the deployment's **Who has access** is `Anyone`,
  and that you copied the full URL ending in `/exec` (not `/dev`). Check you're
  not on a network/VPN that blocks Google Apps Script.

- **"I edited `backend.gs` but nothing changed."** Apps Script deployments are
  frozen snapshots. Redeploy a new version: **Deploy → Manage deployments** →
  pencil → **Version: New version** → **Deploy**. The URL stays the same.

- **"Importing a recipe from a URL isn't working."** Some sites block automated
  requests or don't publish structured recipe data (`schema.org` JSON-LD) — the
  app falls back to the page's title/image/description and you fill in the rest.
  Most major recipe blogs work fine.

- **"Photo import says: You do not have permission to call drive.files.create."**
  The script gained the Drive permission after you first authorized it, and the
  web app never re-prompts on its own. Fix: in the editor select
  **`authorizeOnce`** and click **Run**, then grant the prompt (it now lists
  Drive). No redeploy needed.

- **"Sharing with someone else."** Just share the same Web App URL — anyone with
  it can read and write the sheet (there's no per-user login). For a fresh empty
  start instead, create a new sheet and repeat steps 2–7.

# Grocery List — Sync Setup & Linking to Recipes

This connects the Grocery List app to its own private Google Sheet (so your
list syncs across devices), and links it to the Recipes app so you can send a
recipe's ingredients straight to your shopping list.

The Grocery List uses its **own** sheet and its **own** Apps Script
deployment, separate from the Recipes one. Each app has its own sync URL.

## Part 1 — Deploy the grocery backend (~5 min, once)

Same procedure as the Recipes setup:

1. **Create a sheet.** Go to [sheets.google.com](https://sheets.google.com)
   and make a new blank spreadsheet. Name it e.g. **Grocery List**.
2. **Open the script editor:** **Extensions → Apps Script**.
3. **Paste the code.** Delete the default stub and paste the entire contents
   of [`backend.gs`](./backend.gs) from this folder. Save (Ctrl/Cmd+S).
4. **Deploy:** **Deploy → New deployment** → gear icon → **Web app**. Set
   **Execute as:** `Me`, **Who has access:** `Anyone`. Click **Deploy**.
5. **Authorize** when prompted (Advanced → Go to project (unsafe) → Allow —
   this is normal for a personal script you pasted yourself).
6. **Copy the Web App URL** (ends in `/exec`).
7. **Paste it into the Grocery List app:** open the app → the sync button near
   the top → paste into the URL field → save. It should say **Synced**.

The script auto-creates two tabs, `items` and `staples`, with header rows:
```
items:   id | name | qty | unit | checked
staples: id | name | qty | unit
```

> Tip: deploy into a **fresh** sheet. The script treats row 1 of each tab as a
> header, so if you point it at an old sheet whose row 1 is real data, that
> first item would be hidden.

## Part 2 — Link Recipes → Grocery List

1. Copy the Grocery List's Web App URL (the same `/exec` URL from step 6).
2. Open the **Recipes** app → **Settings**.
3. Paste it into the **Grocery List URL** field (this is separate from the
   Recipes sync URL) and save.

Now, in any recipe, tap **To grocery list** → check the ingredients you need →
confirm. They're appended to your grocery `items` sheet and show up in the
Grocery List app on your next sync. (Staples you already keep on hand are easy
to uncheck before sending.)

## Troubleshooting

- **"Sync error" in either app** — confirm the deployment's **Who has access**
  is `Anyone`, and that you copied the full URL ending in `/exec` (not `/dev`).
- **Edited `backend.gs` but nothing changed** — Apps Script deployments are
  frozen snapshots. Redeploy a **New version**: **Deploy → Manage deployments**
  → edit (pencil) → **Version: New version** → **Deploy**. The URL stays the same.
- **"To grocery list" does nothing** — make sure the Grocery List URL is set in
  the Recipes app's Settings (Part 2), not just the Recipes sync URL.
- **Two different URLs, don't mix them up** — the Recipes app has two URL
  fields in Settings: its own sync URL (the Recipes deployment) and the Grocery
  List URL (the Grocery deployment). They point at different sheets.

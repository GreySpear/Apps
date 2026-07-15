# Recipes — Sync Setup

This connects the Recipes app to your own private Google Sheet, so your
recipes are backed up and sync across your devices. Nobody but you (and
anyone you deliberately share the sheet with) can see it. Takes about 5
minutes, and you only have to do it once.

You can do this whole thing from your phone — it's just a few taps in
Google Sheets and a copy-paste.

## Steps

1. **Create a sheet.** Go to [sheets.google.com](https://sheets.google.com)
   and create a new blank spreadsheet. Name it something like **Recipes**
   (the name doesn't actually matter, the app doesn't check it).

2. **Open the script editor.** Tap the menu (three lines, or **Extensions**
   on desktop) → **Extensions → Apps Script**. This opens a new tab with a
   blank code editor.

3. **Paste the backend code.** Delete whatever's in the default
   `Code.gs` file (usually a stub `function myFunction() {}`), and paste in
   the entire contents of [`backend.gs`](./backend.gs) from this repo. Save
   it (the disk icon, or Ctrl/Cmd+S). You can rename the project at the top
   (e.g. "Recipes Backend") if you like — also cosmetic.

4. **Deploy as a web app.**
   - Click **Deploy → New deployment**.
   - Click the gear icon next to "Select type" and choose **Web app**.
   - Fill in:
     - **Execute as:** `Me` (your account)
     - **Who has access:** `Anyone`
   - Click **Deploy**.

5. **Authorize it.** The first time you deploy, Google will ask you to
   authorize the script. This is expected — it's just Google being careful
   because the script needs permission to read/write your sheet and fetch
   web pages. Click **Authorize access**, pick your Google account, and
   when you see a screen that says *"Google hasn't verified this app"*,
   click **Advanced** → **Go to (your project name) (unsafe)**. That
   scary-looking warning is normal for personal scripts you wrote/pasted
   yourself — Google shows it because the script hasn't been through their
   app review process, not because anything is actually wrong. Then click
   **Allow**.

6. **Copy the Web App URL.** After deploying, you'll see a URL that looks
   like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```
   Copy that whole thing.

7. **Paste it into the app.** Open the Recipes app, go to **Settings**
   (the sync button near the top), paste the URL into the **Web App URL**
   field, and save. It should say **Synced** within a couple seconds.

That's it — recipes you add will now be saved to your Google Sheet, and
you can reuse the same URL on any other device (phone, laptop, tablet) to
see the same recipes everywhere.

## Enable photo import (OCR) — one extra checkbox

The **Photo** tab (snap a picture of a written/printed recipe) uses Google
Drive's built-in text recognition. It needs one extra thing enabled in your
script project:

1. Open your script (the Google Sheet → **Extensions → Apps Script**).
2. In the left sidebar, next to **Services**, click the **+**.
3. Pick **Drive API** from the list and click **Add**. (The default version
   is fine.)
4. Make sure the code is the latest `backend.gs` from this repo, then
   publish a new version: **Deploy → Manage deployments** → pencil icon →
   **Version: New version** → **Deploy**.
5. The first photo you import may trigger a re-authorization prompt (the
   script now needs Drive/Docs permission to do the text recognition) —
   walk through it the same way as the first time.

How it works: your photo is briefly converted to a temporary Google Doc in
your own Drive (that's what does the text extraction), the text is read out,
and the temp doc is deleted immediately. Nothing is kept.

If you skip this section, everything else still works — the Photo tab will
just show a message pointing you here.

## What the sheet will look like

The script creates a tab named `recipes` automatically (if it's not
already there) with this header row:

```
id | title | category | sourceUrl | imageUrl | ingredients | steps | servings | prepTime | cookTime | notes | favorite | cookedDates | createdAt | updatedAt
```

You generally don't need to touch this sheet directly — the app manages
it — but it's a normal Google Sheet, so it's easy to peek at, back up, or
export from Google Sheets any time.

## Troubleshooting

**"I edited backend.gs, but the app doesn't seem to see the change."**
Apps Script deployments are frozen snapshots — editing the code in the
script editor does *not* automatically update the live web app. You need
to make a new version:
- **Deploy → Manage deployments** → click the pencil/edit icon on your
  existing deployment → under **Version**, choose **New version** →
  **Deploy**.
- The URL stays the same, so you don't need to update it in the app again.

**"It's asking me to sign in / authorize again and again."**
That usually means the deployment's **Execute as** got set to something
other than `Me`, or a new version needs re-authorization after a
permissions change (e.g. you added the URL-fetching code later). Re-check
the deployment settings in step 4, or just walk through the authorization
prompt again — it's harmless.

**"Sync says error."**
Double-check:
- The **Who has access** setting on the deployment is `Anyone` (not
  "Anyone with Google account" or "Only myself") — the app calls the
  script anonymously, so it needs to be open to anyone who has the secret
  URL.
- You copied the full URL, ending in `/exec` (not `/dev`).
- You're not on a restrictive network/VPN that blocks Google Apps Script.

**"Importing a recipe from a URL isn't working."**
Some recipe sites block automated requests, or don't include structured
recipe data (`schema.org` JSON-LD) at all — in that case the app falls
back to the page's title/image/description, and you fill in the rest by
hand. That's expected for a handful of sites; most major recipe blogs work
fine.

**"I want to start over / share this with someone else."**
Just share the same Web App URL — anyone with it can read and write the
sheet (there's no per-user login, same as the Grocery List app). If you
want a fresh, empty sheet instead, create a new Google Sheet and repeat
steps 2–7.

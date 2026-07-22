# Home Maintenance Log — Sync Setup

This connects the Home Log app to your own private Google Sheet, so your
maintenance history is backed up and syncs across your devices — and it's
also what lets you attach **photos and receipts** (they're stored in a
folder in your Google Drive). Nobody but you can see any of it. Takes
about 5 minutes, and you only have to do it once.

You can do this whole thing from your phone — it's just a few taps in
Google Sheets and a copy-paste.

## Steps

1. **Create a sheet.** Go to [sheets.google.com](https://sheets.google.com)
   and create a new blank spreadsheet. Name it something like
   **Home Maintenance** (the name doesn't actually matter, the app doesn't
   check it).

2. **Open the script editor.** Tap the menu (three lines, or **Extensions**
   on desktop) → **Extensions → Apps Script**. This opens a new tab with a
   blank code editor.

3. **Paste the backend code.** Delete whatever's in the default
   `Code.gs` file (usually a stub `function myFunction() {}`), and paste in
   the entire contents of [`backend.gs`](./backend.gs) from this repo. Save
   it (the disk icon, or Ctrl/Cmd+S). You can rename the project at the top
   (e.g. "Home Log Backend") if you like — cosmetic.

4. **Deploy as a web app.**
   - Click **Deploy → New deployment**.
   - Click the gear icon next to "Select type" and choose **Web app**.
   - Fill in:
     - **Execute as:** `Me` (your account)
     - **Who has access:** `Anyone`
   - Click **Deploy**.

5. **Authorize it.** The first time you deploy, Google will ask you to
   authorize the script. This is expected — the script needs permission to
   read/write your sheet and to save photos into your Drive. Click
   **Authorize access**, pick your Google account, and when you see a
   screen that says *"Google hasn't verified this app"*, click
   **Advanced** → **Go to (your project name) (unsafe)**. That
   scary-looking warning is normal for personal scripts you pasted in
   yourself — Google shows it because the script hasn't been through their
   app review process, not because anything is actually wrong. Then click
   **Allow**.

6. **Copy the Web App URL.** After deploying, you'll see a URL that looks
   like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```
   Copy that whole thing.

7. **Paste it into the app.** Open the Home Log app, tap the sync button
   near the top (or Settings), paste the URL into the
   **Maintenance Apps Script URL** field, and save. It should say
   **Synced** within a couple seconds.

That's it. The backend creates three tabs in your sheet (`items`, `tasks`,
`log`) on first sync, and a **"Home Maintenance Photos"** folder appears in
your Drive the first time you attach a photo. The same URL works on any
other device (phone, laptop, tablet) to see the same data everywhere.

## Notes

- **No Drive API checkbox needed.** Unlike the Recipes app's photo-OCR
  feature, this backend uses only standard services — pasting and deploying
  is the whole setup.
- **Removing a photo** in the app moves the file to your Drive's trash
  (recoverable for 30 days). Deleting a log entry does *not* delete its
  photos.
- **Updating the backend later:** paste the new `backend.gs` over the old
  code, then **Deploy → Manage deployments → ✏️ Edit → Version: New
  version → Deploy**. The URL stays the same.

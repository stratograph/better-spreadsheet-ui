# Sheet Cell Editor

A single-page, no-backend editor for entering data into a Google Sheet
cell by cell. Pick a row and column from two dropdowns, and edit that
cell's contents in one of two text boxes — changes save straight to
the sheet.

Live at: https://stratograph.io/better-spreadsheet-ui/

## How it works

- **Row** dropdown is built from column A of the "Value" tab (the row labels). Its label is taken from the tab's corner cell (row 1, column A), falling back to "Row" if that's blank.
- **Field** dropdown is built from row 1 of the "Value" tab (the column headers), prefixed with the actual column letter.
- The **Value** and **Justification** text boxes read/write the selected row+field cell in two separate, identically-shaped sheet tabs.
- Cells containing a formula are shown (with their computed, formatted value) but disabled for editing.
- A third **Metadata** tab (header row `Column name,Description,Field type,Possible values`) supplies per-field info: an accordion under the Field dropdown shows that field's Description (its open/closed state persists as you change rows/fields), and if a field has no matching metadata row, that's called out under the dropdown.
- **Field type** in the metadata drives the Value control: blank or `text` behaves as a normal text box; anything else (e.g. `single-select`) renders Value as a dropdown populated from the newline-separated **Possible values**, plus a blank option. Matching the sheet's current value against that list is case-/whitespace-insensitive; a current value that doesn't match any listed option is shown as an extra, ephemeral entry (not saved back into the metadata's possible-values list).
- Everything Google-specific (OAuth Client ID, Spreadsheet ID, tab names) is entered by the user in the app's Settings panel and stored only in that browser's `localStorage` — nothing sensitive is committed to this repo or embedded in the page.

## First-time setup

Each person who wants to use this app needs a Google OAuth Client ID
(one Client ID can be shared and reused by multiple people — see
below), and the target spreadsheet must be a **native Google Sheet**
(not an unconverted `.xlsx` file in Drive — the Sheets API can't write
to those).

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (or use an existing one) and enable the **Google Sheets API**.
2. Configure the **OAuth consent screen**:
   - User type: External
   - Publishing status: leave as **Testing** for a small/internal tool — avoids Google's verification review
   - Add each person who should be able to sign in as a **Test user** (by email, up to 100)
3. Create an **OAuth Client ID** of type **Web application**.
4. Add this page's origin as an **Authorized JavaScript origin**:
   ```
   https://stratograph.io
   ```
   (no trailing slash, no path — just the scheme + host). Add `http://localhost:PORT` too if you want to test changes locally before deploying.
5. Leave **Authorized redirect URIs** blank — this app uses the popup-based token flow, not a redirect flow.
6. Open the app, click **Settings**, and fill in:
   - **Google OAuth Client ID** — from step 3
   - **Spreadsheet ID** — the long ID in the sheet's URL (`.../spreadsheets/d/<ID>/edit`)
   - **Value tab name** / **Justification tab name** — the two sheet tabs to read/write, sharing the same row/column layout
   - **Metadata tab name** — the sheet tab with the `Column name,Description,Field type,Possible values` header row describing each field
7. Sign in with Google. As a test user, you'll see a "Google hasn't verified this app" warning — click **Advanced → Go to stratograph.io (unsafe)** to proceed. This is expected for an unverified, internal-use app.

### Sharing with others

The OAuth Client ID itself can be reused by anyone — you don't need a
separate Client ID per person. To let someone else sign in:

1. Add their Google account email as a **Test user** in the OAuth consent screen (Cloud Console → APIs & Services → OAuth consent screen → Test users).
2. Make sure they have edit access to the target spreadsheet via normal Google Sheets sharing — the OAuth token only lets the app act within whatever that signed-in account already has permission to do.
3. Send them the app URL. They fill in the same Settings values (Client ID, Spreadsheet ID, tab names) and sign in with their own account.

## Local development

No build step — it's a single static HTML file.

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`, having added that origin to the
OAuth Client ID's Authorized JavaScript origins.

## Deployment

This repo is served via GitHub Pages from the `main` branch root, at
the custom domain `stratograph.io/better-spreadsheet-ui/`. Pushing to
`main` deploys automatically.

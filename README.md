# Sheet Cell Editor

A single-page, no-backend editor for entering data into a Google Sheet
cell by cell. Pick a row and column from two dropdowns, and edit that
cell's contents in one of two text boxes — changes save straight to
the sheet.

Live at: https://stratograph.io/better-spreadsheet-ui/

## How it works

- **Row** dropdown is built from column A of the "Value" tab (the row labels). Its label is taken from the tab's corner cell (row 1, column A), falling back to "Row" if that's blank.
- **Field** dropdown is built from row 1 of the "Value" tab (the column headers), prefixed with the actual column letter. **‹**/**›** buttons flank it to step to the previous/next field in order, disabled at the first/last field, for filling out a row's fields in sequence without hunting through the dropdown.
- The **Value** and **Justification** text boxes read/write the selected row+field cell in two separate, identically-shaped sheet tabs.
- Cells containing a formula are shown (with their computed, formatted value) but disabled for editing.
- Switching rows/fields quickly (e.g. mashing the Next/Prev buttons) is race-safe: each cell load is tagged with a generation token, so if an earlier, slower request resolves after a later one, its stale result is discarded instead of overwriting what's currently shown.
- A third **Metadata** tab (header row `Column name,Description,Field type,Possible values`) supplies per-field info: an accordion under the Field dropdown shows that field's Description (its open/closed state persists as you change rows/fields), and if a field has no matching metadata row, that's called out under the dropdown.
- **Field type** in the metadata drives the Value control: blank or `text` behaves as a normal text box; anything else (e.g. `single-select`) renders Value as a dropdown populated from the newline-separated **Possible values**, plus a blank option. Matching the sheet's current value against that list is case-/whitespace-insensitive; a current value that doesn't match any listed option is shown as an extra, ephemeral entry (not saved back into the metadata's possible-values list).
- The **initiative panel** (Row dropdown) shows two small progress bars — one for **Value**, one for **Justification** — each with an "X / Y fields completed" count for the selected row, based on how many of that row's fields are non-empty in the respective tab. Both update live after each successful save, no reload needed.
- Optional **Extra change logging** (off by default, in Settings): when enabled, leaving a cell whose Value or Justification actually changed (comparing what was loaded against the last successfully saved value — not every keystroke) appends a row to a hidden **history tab** with columns `Row name, Column name, Value or Justification, Old value, New value, Edit timestamp`. The tab is created automatically (hidden, so it won't clutter the visible sheet tabs) the first time it's needed. This is separate from Google Sheets' own built-in version history — it's a human-readable, per-field audit trail. Logging is best-effort: a failed log write is reported to the console but never blocks editing or triggers the save-error UI.
  - A change is also flushed after **60 seconds of no activity** on the fields (e.g. the computer went to sleep, or the tab was left open and abandoned) without waiting for an explicit row/field change — again only if something was actually changed. This becomes the new checkpoint, so later edits or an eventual navigation log correctly from that point rather than re-reporting the same change or the original value.
- Everything Google-specific (OAuth Client ID, Spreadsheet ID, tab names) is entered by the user in the app's Settings panel and stored only in that browser's `localStorage` — nothing sensitive is committed to this repo or embedded in the page.
- Google's access tokens for this flow expire after about an hour, and the browser-only token client never receives a refresh token (Google reserves those for server-side flows). To avoid frequent re-auth prompts, the app proactively renews the token silently (a background, no-UI request) about 5 minutes before it expires, and again reactively if any API call ever comes back unauthorized. The visible "Sign in with Google" button also no longer forces Google's consent screen (`prompt: 'consent'`) — it requests silently first and only falls back to visible UI when Google actually requires it (first-time auth, revoked access, etc.).
- On page load, once Settings are filled in, the app also attempts a silent sign-in automatically (same no-UI mechanism) — if there's still a valid Google session and prior consent, you land signed in without clicking anything. If that's not possible, it fails quietly and the normal "Sign in with Google" button just sits there as usual.
- The last row and field you were viewing are remembered (by name, not position, so they survive the sheet's rows/columns being reordered) and restored automatically the next time the sheet loads — including right after the automatic silent sign-in above.
- Unexpected API errors (anything other than the specific "session expired" case, which has its own recovery flow) show a **Copy error** button alongside the "See console for details" message. It copies the error message, HTTP status/response body if any, when the error happened, and when the auth token last successfully refreshed — useful context to paste into a bug report without having to dig through devtools.

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

## Testing

The deployed app has no build step, but the test suite is a normal npm
project (dev-only — nothing here is shipped to the site):

```
npm install
npx playwright install chromium   # first time only

npm test              # unit tests (Vitest) — pure logic modules, no browser
npm run test:e2e      # e2e tests (Playwright) — real browser, mocked Google/Sheets API
npm run test:all      # both
```

`tests/e2e/fixtures/mockGoogle.js` mocks both Google Identity Services
and the Sheets API (via `page.route`), so e2e tests never hit a real
Google account or network. Both suites run in CI on every push/PR to
`main` (`.github/workflows/test.yml`). New features and bug fixes
should come with tests — see `CLAUDE.md` for more detail on what goes
where.

## Deployment

This repo is served via GitHub Pages from the `main` branch root, at
the custom domain `stratograph.io/better-spreadsheet-ui/`. Pushing to
`main` deploys automatically.

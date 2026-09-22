// Shared Playwright fixture that mocks both Google Identity Services (the
// sign-in popup/token client) and the Google Sheets API, so e2e tests never
// touch the real network or a real Google account.
//
// Two things make this reliable in a way that hand-injecting mocks via
// devtools/console never was:
//   1. page.addInitScript() runs before ANY page script, every navigation -
//      our fake `window.google` always wins, no race against the real
//      accounts.google.com script loading first.
//   2. We also block the real GSI <script> tag outright via page.route(),
//      so it can never load later and clobber our mock mid-test.
import { test as base, expect } from "@playwright/test";

// --- In-memory "Google Sheets" backing store ---------------------------

function colLetterToIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1; // 0-based
}

function parseA1(a1) {
  const m = a1.match(/^([A-Z]+)(\d+)$/);
  if (!m) throw new Error(`Unrecognized A1 ref: ${a1}`);
  return { col: colLetterToIndex(m[1]), row: parseInt(m[2], 10) - 1 };
}

export class SheetsApiMock {
  /**
   * @param {Record<string, string[][]>} sheets - sheetName -> full grid
   *   (row 0 is the header row), e.g. { Value: [["Item","Status"],["A","Active"]] }
   */
  constructor(sheets) {
    this.sheets = sheets;
    this.hiddenTabs = new Set();
    this.appendedRows = {}; // sheetName -> string[][]
    this.putCalls = [];
    this.batchUpdateCalls = [];
    this.tokenCalls = [];
    this.failNextSheetLoad = false; // fail the next whole-tab (structure) fetch, once
    this.failNextCellGet = false; // fail the next individual cell fetch, once
    this.failAllPuts = false; // simulate a save failure (e.g. expired token)
  }

  cell(sheetName, a1) {
    const { col, row } = parseA1(a1);
    const grid = this.sheets[sheetName] || [];
    return (grid[row] && grid[row][col]) || "";
  }

  setCell(sheetName, a1, value) {
    const { col, row } = parseA1(a1);
    if (!this.sheets[sheetName]) this.sheets[sheetName] = [];
    if (!this.sheets[sheetName][row]) this.sheets[sheetName][row] = [];
    this.sheets[sheetName][row][col] = value;
  }

  allTabTitles() {
    return [
      ...Object.keys(this.sheets).map((title) => ({ title, hidden: this.hiddenTabs.has(title) })),
    ];
  }
}

async function installGoogleIdentityMock(page) {
  // Never let the real script load and overwrite our mock later.
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "/* mocked in tests */" })
  );

  await page.addInitScript(() => {
    window.__mockAuthMode = "success"; // "success" | "fail"
    window.__mockTokenCalls = [];
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (cfg) => ({
            requestAccessToken: (override) => {
              window.__mockTokenCalls.push(override || {});
              const respond = () => {
                if (window.__mockAuthMode === "fail") {
                  cfg.callback({ error: "interaction_required" });
                } else {
                  cfg.callback({ access_token: "test-access-token", expires_in: 3600 });
                }
              };
              // Configurable delay so tests can create a real window during
              // which multiple concurrent callers must share one attempt,
              // rather than each resolving near-instantly and never
              // overlapping in practice.
              if (window.__mockTokenDelayMs) {
                setTimeout(respond, window.__mockTokenDelayMs);
              } else {
                respond();
              }
            },
          }),
          revoke: (_token, cb) => cb && cb(),
        },
      },
    };
  });
}

async function installSheetsApiMock(page, mock) {
  await page.route("https://sheets.googleapis.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;

    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    // GET .../spreadsheets/{id}?fields=... (tab titles, no /values/ segment)
    if (method === "GET" && !path.includes("/values/") && !path.endsWith(":batchUpdate")) {
      return json({ sheets: mock.allTabTitles().map((t) => ({ properties: t })) });
    }

    // POST .../spreadsheets/{id}:batchUpdate (addSheet)
    if (path.endsWith(":batchUpdate")) {
      const body = JSON.parse(request.postData() || "{}");
      mock.batchUpdateCalls.push(body);
      const props = body.requests[0].addSheet.properties;
      mock.sheets[props.title] = mock.sheets[props.title] || [];
      if (props.hidden) mock.hiddenTabs.add(props.title);
      return json({ replies: [{ addSheet: { properties: { sheetId: 999, ...props } } }] });
    }

    const afterValues = path.split("/values/")[1];

    // POST .../values/{range}:append
    if (method === "POST" && afterValues && afterValues.includes(":append")) {
      const sheetName = decodeURIComponent(afterValues.split(":append")[0]);
      const body = JSON.parse(request.postData() || "{}");
      mock.appendedRows[sheetName] = mock.appendedRows[sheetName] || [];
      mock.appendedRows[sheetName].push(...body.values);
      return json({});
    }

    const range = decodeURIComponent(afterValues);

    // PUT .../values/{range}?valueInputOption=...
    if (method === "PUT") {
      mock.putCalls.push({ range, body: JSON.parse(request.postData() || "{}") });
      if (mock.failAllPuts) return json({ error: { message: "simulated auth failure" } }, 401);
      const m = range.match(/^(.+)!([A-Z]+\d+)$/);
      if (m) mock.setCell(m[1], m[2], JSON.parse(request.postData()).values[0][0]);
      return json({});
    }

    // GET a whole tab: .../values/{sheetName}
    const cellMatch = range.match(/^(.+)!([A-Z]+\d+)$/);
    if (!cellMatch) {
      if (mock.failNextSheetLoad) {
        mock.failNextSheetLoad = false;
        return json({ error: { message: "simulated transient error" } }, 500);
      }
      return json({ values: mock.sheets[range] || [] });
    }

    // GET a single cell: .../values/{sheetName}!{a1}?valueRenderOption=...
    if (mock.failNextCellGet) {
      mock.failNextCellGet = false;
      return json({ error: { message: "simulated transient error" } }, 500);
    }
    const [, sheetName, a1] = cellMatch;
    const value = mock.cell(sheetName, a1);
    return json({ values: value === "" ? undefined : [[value]] });
  });
}

export const test = base.extend({
  sheetsMock: async ({ page }, use) => {
    const mock = new SheetsApiMock({
      Value: [["Item"]],
      Justification: [["Item"]],
      Metadata: [["Column name", "Description", "Field type", "Possible values"]],
    });
    await installGoogleIdentityMock(page);
    await installSheetsApiMock(page, mock);
    await use(mock);
  },
});

export { expect };

/** Fills in Settings and clicks Save, using sensible test defaults. */
export async function configureSettings(page, overrides = {}) {
  const values = {
    clientId: "test-client-id",
    sheetId: "test-sheet-id",
    valueSheetName: "Value",
    justSheetName: "Justification",
    metadataSheetName: "Metadata",
    ...overrides,
  };
  await page.locator("#settingsDetails").evaluate((el) => el.setAttribute("open", ""));
  await page.fill("#clientId", values.clientId);
  await page.fill("#sheetId", values.sheetId);
  await page.fill("#valueSheetName", values.valueSheetName);
  await page.fill("#justSheetName", values.justSheetName);
  await page.fill("#metadataSheetName", values.metadataSheetName);
  if (overrides.extraChangeLogging) await page.check("#extraChangeLogging");
  await page.click("#saveSettingsBtn");
}

/** Configures Settings and signs in, waiting for the sheet to load. */
export async function signIn(page, overrides = {}) {
  await configureSettings(page, overrides);
  await page.click("#signInBtn");
  await expect(page.locator("#authStatus")).toHaveText("Signed in");
  await expect(page.locator("#initiativeCard")).toBeVisible();
}

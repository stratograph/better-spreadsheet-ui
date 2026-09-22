// Regression test for a real bug: rapidly navigating fields (Next/Prev)
// could let an earlier, slower cell-load response resolve *after* a later
// one and overwrite the display with stale data. Fixed with a generation
// token in loadCellValues() - see js/main.js. This test controls response
// resolution order directly (no reliance on real timing/delays) to
// deterministically exercise the worst case: the oldest request resolves
// last.
import { test, expect, signIn } from "./fixtures/mockGoogle.js";

test("a stale cell-load response arriving after a newer one does not override the display", async ({
  page,
  sheetsMock,
}) => {
  sheetsMock.sheets.Value = [
    ["Item", "Field1", "Field2", "Field3"],
    ["Widget A", "VAL1", "VAL2", "VAL3"],
  ];
  sheetsMock.sheets.Justification = [
    ["Item", "Field1", "Field2", "Field3"],
    ["Widget A justification", "JUST1", "JUST2", "JUST3"],
  ];

  await page.goto("/index.html");
  await signIn(page);
  await expect(page.locator("#valueBox")).toHaveValue("VAL1");

  // Layer a more specific route on top of the fixture's, for individual
  // cell fetches only, that we control the resolution of by hand.
  const pending = [];
  await page.route(/\/values\/[^/]+!\w+\d+/, async (route) => {
    const url = new URL(route.request().url());
    const range = decodeURIComponent(url.pathname.split("/values/")[1]);
    const m = range.match(/^(.+)!([A-Z]+)(\d+)$/);
    if (!m) return route.fallback();
    const [, sheetName, colLetter, rowStr] = m;
    await new Promise((resolveWait) => {
      pending.push({
        colLetter,
        resolveNow: async () => {
          const value = sheetsMock.cell(sheetName, colLetter + rowStr);
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ values: value ? [[value]] : undefined }),
          });
          resolveWait();
        },
      });
    });
  });

  // Field1 -> Field2 (colC), then Field2 -> Field3 (colD), both before
  // either's requests are resolved - both are genuinely in flight at once.
  await page.click("#nextFieldBtn");
  await expect.poll(() => pending.filter((p) => p.colLetter === "C").length).toBe(4);
  await page.click("#nextFieldBtn");
  await expect.poll(() => pending.filter((p) => p.colLetter === "D").length).toBe(4);

  // Resolve the CURRENT field's (colD) requests first.
  await Promise.all(pending.filter((p) => p.colLetter === "D").map((p) => p.resolveNow()));
  await expect(page.locator("#valueBox")).toHaveValue("VAL3");
  await expect(page.locator("#justBox")).toHaveValue("JUST3");

  // Now resolve the STALE field's (colC) requests, arriving last. They must
  // NOT overwrite the already-correct display for field3.
  await Promise.all(pending.filter((p) => p.colLetter === "C").map((p) => p.resolveNow()));
  await page.waitForTimeout(200);
  await expect(page.locator("#colSelect")).toHaveValue("4"); // still on Field3
  await expect(page.locator("#valueBox")).toHaveValue("VAL3");
  await expect(page.locator("#justBox")).toHaveValue("JUST3");
});

test("three-way race: responses resolved in fully reversed order still end on the last click's field", async ({
  page,
  sheetsMock,
}) => {
  sheetsMock.sheets.Value = [
    ["Item", "Field1", "Field2", "Field3", "Field4"],
    ["Widget A", "VAL1", "VAL2", "VAL3", "VAL4"],
  ];
  sheetsMock.sheets.Justification = [
    ["Item", "Field1", "Field2", "Field3", "Field4"],
    ["Widget A justification", "JUST1", "JUST2", "JUST3", "JUST4"],
  ];

  await page.goto("/index.html");
  await signIn(page);

  const pending = [];
  await page.route(/\/values\/[^/]+!\w+\d+/, async (route) => {
    const url = new URL(route.request().url());
    const range = decodeURIComponent(url.pathname.split("/values/")[1]);
    const m = range.match(/^(.+)!([A-Z]+)(\d+)$/);
    if (!m) return route.fallback();
    const [, sheetName, colLetter, rowStr] = m;
    await new Promise((resolveWait) => {
      pending.push({
        colLetter,
        resolveNow: async () => {
          const value = sheetsMock.cell(sheetName, colLetter + rowStr);
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ values: value ? [[value]] : undefined }),
          });
          resolveWait();
        },
      });
    });
  });

  // Field1 -> 2 (C) -> 3 (D) -> 4 (E), all three in flight simultaneously.
  await page.click("#nextFieldBtn");
  await expect.poll(() => pending.filter((p) => p.colLetter === "C").length).toBe(4);
  await page.click("#nextFieldBtn");
  await expect.poll(() => pending.filter((p) => p.colLetter === "D").length).toBe(4);
  await page.click("#nextFieldBtn");
  await expect.poll(() => pending.filter((p) => p.colLetter === "E").length).toBe(4);

  // Resolve oldest-first (worst case): C, then D, then E.
  await Promise.all(pending.filter((p) => p.colLetter === "C").map((p) => p.resolveNow()));
  await Promise.all(pending.filter((p) => p.colLetter === "D").map((p) => p.resolveNow()));
  await expect(page.locator("#valueBox")).toHaveValue(""); // still legitimately loading Field4

  await Promise.all(pending.filter((p) => p.colLetter === "E").map((p) => p.resolveNow()));
  await expect(page.locator("#valueBox")).toHaveValue("VAL4");
  await expect(page.locator("#justBox")).toHaveValue("JUST4");
  await expect(page.locator("#valueBox")).toBeEnabled();
});

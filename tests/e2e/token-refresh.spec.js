import { test, expect, signIn } from "./fixtures/mockGoogle.js";

test("a 401 on save triggers a silent refresh and recovers without a full sign-out", async ({ page, sheetsMock }) => {
  sheetsMock.sheets.Value = [["Item", "Status"], ["Widget A", "Active"]];
  sheetsMock.sheets.Justification = [["Item", "Status"], ["Widget A justification", ""]];

  await page.goto("/index.html");
  await signIn(page);

  sheetsMock.failAllPuts = true;
  await page.fill("#valueBox", "Escalated");

  // The "refreshing sign-in..." message is transient (it can clear again
  // within milliseconds once the mock's near-instant refresh resolves), so
  // assert on the settled outcome rather than racing to catch it mid-flight.
  await expect(page.locator("#globalMessage")).toHaveText("", { timeout: 3000 });
  await expect(page.locator("#authStatus")).toHaveText("Signed in");

  const tokenCalls = await page.evaluate(() => window.__mockTokenCalls);
  expect(tokenCalls.length).toBeGreaterThanOrEqual(1);
  expect(tokenCalls.at(-1)).toMatchObject({ prompt: "" });
});

test("concurrent 401s (Value and Justification saving around the same time) share one refresh, not two", async ({
  page,
  sheetsMock,
}) => {
  sheetsMock.sheets.Value = [["Item", "Status"], ["Widget A", "Active"]];
  sheetsMock.sheets.Justification = [["Item", "Status"], ["Widget A justification", ""]];

  await page.goto("/index.html");
  await signIn(page);

  await page.evaluate(() => {
    window.__mockTokenCalls.length = 0;
    // Give both fields' 401s a real window to land before the refresh
    // resolves, so this test actually exercises the dedup path instead of
    // each save's refresh completing before the other even starts.
    window.__mockTokenDelayMs = 150;
  });
  sheetsMock.failAllPuts = true;

  await page.fill("#valueBox", "edited value");
  await page.fill("#justBox", "edited justification");

  await expect(page.locator("#valueStatus")).toHaveText("Not saved", { timeout: 3000 });
  await expect(page.locator("#justStatus")).toHaveText("Not saved", { timeout: 3000 });
  await expect(page.locator("#globalMessage")).toHaveText("", { timeout: 3000 });

  const tokenCallCount = await page.evaluate(() => window.__mockTokenCalls.length);
  expect(tokenCallCount).toBe(1);
});

test("when the silent refresh genuinely fails, falls back to the sign-in-again UI", async ({ page, sheetsMock }) => {
  sheetsMock.sheets.Value = [["Item", "Status"], ["Widget A", "Active"]];
  sheetsMock.sheets.Justification = [["Item", "Status"], ["Widget A justification", ""]];

  await page.goto("/index.html");
  await signIn(page);

  await page.evaluate(() => {
    window.__mockAuthMode = "fail";
  });
  sheetsMock.failAllPuts = true;
  await page.fill("#valueBox", "Escalated");

  await expect(page.locator("#globalMessage")).toHaveText("Session expired. Please sign in again.", {
    timeout: 3000,
  });
  await expect(page.locator("#authStatus")).toHaveText("Not signed in");
  await expect(page.locator("#signInBtn")).toBeVisible();
});

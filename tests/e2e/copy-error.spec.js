import { test, expect, signIn, configureSettings } from "./fixtures/mockGoogle.js";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("a generic load error shows a Copy error button that copies context, timestamp, and last token refresh", async ({
  page,
  sheetsMock,
}) => {
  sheetsMock.sheets.Value = [["Item", "Status"], ["Widget A", "Active"]];
  sheetsMock.sheets.Justification = [["Item", "Status"], ["Widget A justification", ""]];

  await page.goto("/index.html");
  const beforeSignIn = Date.now();
  await signIn(page);

  await expect(page.locator("#copyErrorBtn")).toBeHidden();

  sheetsMock.failNextCellGet = true;
  await page.click("#reloadBtn");

  await expect(page.locator("#globalMessage")).toContainText("Error loading cell values");
  await expect(page.locator("#copyErrorBtn")).toBeVisible();

  await page.click("#copyErrorBtn");
  await expect(page.locator("#copyErrorBtn")).toHaveText("Copied!");

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain("Context: loading cell values");
  expect(clipboardText).toMatch(/Error time: \d{4}-\d{2}-\d{2}T/);
  expect(clipboardText).toMatch(/Last successful auth token refresh: \d{4}-\d{2}-\d{2}T/);

  // The recorded refresh time should be close to (at/after) when we signed in.
  const match = clipboardText.match(/Last successful auth token refresh: (\S+)/);
  const refreshedAt = new Date(match[1]).getTime();
  expect(refreshedAt).toBeGreaterThanOrEqual(beforeSignIn);

  // Button label resets after the brief "Copied!" confirmation.
  await expect(page.locator("#copyErrorBtn")).toHaveText("Copy error", { timeout: 3000 });
});

test("the copy button is hidden for non-error / non-copyable messages", async ({ page, sheetsMock }) => {
  sheetsMock.sheets.Value = [["Item"]]; // triggers the "no rows/columns found" message
  sheetsMock.sheets.Justification = [["Item"]];

  await page.goto("/index.html");
  await configureSettings(page);
  await page.click("#signInBtn");

  await expect(page.locator("#globalMessage")).toContainText("no rows/columns found");
  await expect(page.locator("#copyErrorBtn")).toBeHidden();
});

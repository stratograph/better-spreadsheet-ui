import { test, expect, signIn } from "./fixtures/mockGoogle.js";

test("Previous/Next disable at the first/last field instead of wrapping around", async ({ page, sheetsMock }) => {
  sheetsMock.sheets.Value = [["Item", "Field1", "Field2"], ["Widget A", "V1", "V2"]];
  sheetsMock.sheets.Justification = [["Item", "Field1", "Field2"], ["Widget A justification", "", ""]];

  await page.goto("/index.html");
  await signIn(page);

  await expect(page.locator("#prevFieldBtn")).toBeDisabled();
  await expect(page.locator("#nextFieldBtn")).toBeEnabled();

  await page.click("#nextFieldBtn");
  await expect(page.locator("#colSelect")).toHaveValue("3");
  await expect(page.locator("#prevFieldBtn")).toBeEnabled();
  await expect(page.locator("#nextFieldBtn")).toBeDisabled();

  // Clicking Next again (already disabled/at the boundary) must not wrap.
  await page.click("#nextFieldBtn", { force: true });
  await expect(page.locator("#colSelect")).toHaveValue("3");

  await page.click("#prevFieldBtn");
  await expect(page.locator("#colSelect")).toHaveValue("2");
  await expect(page.locator("#prevFieldBtn")).toBeDisabled();
});

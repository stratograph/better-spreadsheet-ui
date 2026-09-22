import { test, expect, signIn } from "./fixtures/mockGoogle.js";

test.beforeEach(async ({ page, sheetsMock }) => {
  sheetsMock.sheets.Value = [
    ["Item", "Status"],
    ["Widget A", "  active  "], // deliberately mismatched case/whitespace
    ["Widget B", "Blocked"], // not in the possible-values list at all
  ];
  sheetsMock.sheets.Justification = [
    ["Item", "Status"],
    ["Widget A justification", ""],
    ["Widget B justification", ""],
  ];
  sheetsMock.sheets.Metadata = [
    ["Column name", "Description", "Field type", "Possible values"],
    ["Status", "Current status", "single-select", "Active\nPending\nDone"],
  ];
});

test("matches the sheet's value to a listed option case/whitespace-insensitively", async ({ page }) => {
  await page.goto("/index.html");
  await signIn(page);

  await expect(page.locator("#valueSelect")).toBeVisible();
  await expect(page.locator("#valueSelect")).toHaveValue("Active");
  const options = await page.locator("#valueSelect option").allTextContents();
  expect(options).toEqual(["(blank)", "Active", "Pending", "Done"]);
});

test("shows an ephemeral extra option for a value not in the list, without polluting the list for other rows", async ({
  page,
}) => {
  await page.goto("/index.html");
  await signIn(page);

  await page.selectOption("#rowSelect", { label: "Widget B" });
  await expect(page.locator("#valueSelect")).toHaveValue("Blocked");
  await expect(page.locator("#valueSelect option[value='Blocked']")).toHaveText("Blocked (not in list)");

  // Switching back to Widget A must not show "Blocked" as a normal option.
  await page.selectOption("#rowSelect", { label: "Widget A" });
  await expect(page.locator("#valueSelect")).toHaveValue("Active");
  const options = await page.locator("#valueSelect option").allTextContents();
  expect(options).toEqual(["(blank)", "Active", "Pending", "Done"]);
});

test("picking a new option saves it to the sheet", async ({ page, sheetsMock }) => {
  await page.goto("/index.html");
  await signIn(page);

  await page.selectOption("#valueSelect", "Pending");
  await expect(page.locator("#valueStatus")).toHaveText("Saved", { timeout: 3000 });
  expect(sheetsMock.putCalls.at(-1)).toMatchObject({
    range: "Value!B2",
    body: { values: [["Pending"]] },
  });
});

test('a field with no metadata (or field type "text") stays a plain text box', async ({ page, sheetsMock }) => {
  sheetsMock.sheets.Value[0].push("Notes");
  sheetsMock.sheets.Value[1].push("a note");
  sheetsMock.sheets.Value[2].push("");
  sheetsMock.sheets.Justification[0].push("Notes");
  sheetsMock.sheets.Justification[1].push("");
  sheetsMock.sheets.Justification[2].push("");

  await page.goto("/index.html");
  await signIn(page);
  await page.click("#nextFieldBtn"); // Status -> Notes (no metadata row for it)

  await expect(page.locator("#valueSelect")).toBeHidden();
  await expect(page.locator("#valueBox")).toBeVisible();
  await expect(page.locator("#valueBox")).toHaveValue("a note");
  await expect(page.locator("#metadataMissingNote")).toBeVisible();
});

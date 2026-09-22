import { test, expect, signIn } from "./fixtures/mockGoogle.js";

test("completion bars reflect how many fields are filled, independently for Value and Justification", async ({
  page,
  sheetsMock,
}) => {
  sheetsMock.sheets.Value = [
    ["Item", "Status", "Notes", "Owner"],
    ["Widget A", "Active", "", "Alice"],
  ];
  sheetsMock.sheets.Justification = [
    ["Item", "Status", "Notes", "Owner"],
    ["Widget A justification", "", "a note", ""],
  ];

  await page.goto("/index.html");
  await signIn(page);

  await expect(page.locator("#completionLabel")).toHaveText("2 / 3 fields completed");
  await expect(page.locator("#justCompletionLabel")).toHaveText("1 / 3 fields completed");

  // Fill in the empty Notes value; the Value bar should update live.
  await page.click("#nextFieldBtn"); // Status -> Notes
  await page.fill("#valueBox", "filled in");
  await expect(page.locator("#valueStatus")).toHaveText("Saved", { timeout: 3000 });
  await expect(page.locator("#completionLabel")).toHaveText("3 / 3 fields completed");
  await expect(page.locator("#justCompletionLabel")).toHaveText("1 / 3 fields completed"); // unaffected
});

test("description accordion shows metadata, defaults open, and possible values are hidden for select fields", async ({
  page,
  sheetsMock,
}) => {
  sheetsMock.sheets.Value = [
    ["Item", "Status", "Notes"],
    ["Widget A", "Active", "x"],
  ];
  sheetsMock.sheets.Justification = [
    ["Item", "Status", "Notes"],
    ["Widget A justification", "", ""],
  ];
  sheetsMock.sheets.Metadata = [
    ["Column name", "Description", "Field type", "Possible values"],
    ["Status", "Current status of the item", "single-select", "Active\nInactive"],
    ["Notes", "Freeform notes", "", "e.g. follow up needed"],
  ];

  await page.goto("/index.html");
  await signIn(page);

  await expect(page.locator("#metadataAccordion")).toBeVisible();
  await expect(page.locator("#metadataAccordion")).toHaveJSProperty("open", true);
  await expect(page.locator("#metadataDescription")).toHaveText("Current status of the item");

  await page.click("#nextFieldBtn"); // Status -> Notes (non-select, has possible values)
  await expect(page.locator("#metadataDescription")).toHaveText(
    "Freeform notes\n\nPossible values:\n - e.g. follow up needed"
  );
});

test('a field with no matching metadata row shows the "no metadata" note instead of the accordion', async ({
  page,
  sheetsMock,
}) => {
  sheetsMock.sheets.Value = [["Item", "Status"], ["Widget A", "Active"]];
  sheetsMock.sheets.Justification = [["Item", "Status"], ["Widget A justification", ""]];
  sheetsMock.sheets.Metadata = [["Column name", "Description", "Field type", "Possible values"]];

  await page.goto("/index.html");
  await signIn(page);

  await expect(page.locator("#metadataMissingNote")).toBeVisible();
  await expect(page.locator("#metadataAccordion")).toBeHidden();
});

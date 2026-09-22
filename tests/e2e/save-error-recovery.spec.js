import { test, expect, signIn } from "./fixtures/mockGoogle.js";

test("a failed save is unmistakable but keeps the field editable", async ({ page, sheetsMock }) => {
  sheetsMock.sheets.Value = [["Item", "Status"], ["Widget A", "Active"]];
  sheetsMock.sheets.Justification = [["Item", "Status"], ["Widget A justification", ""]];

  await page.goto("/index.html");
  await signIn(page);

  sheetsMock.failAllPuts = true;
  await page.fill("#valueBox", "New value");

  await expect(page.locator("#valueStatus")).toHaveText("Not saved", { timeout: 3000 });
  await expect(page.locator("#valueSaveError")).toBeVisible();
  await expect(page.locator("#valueBox")).toBeEditable();

  // Recovers once saves succeed again, without needing a page reload.
  sheetsMock.failAllPuts = false;
  await page.fill("#valueBox", "Recovered value");
  await expect(page.locator("#valueStatus")).toHaveText("Saved", { timeout: 3000 });
  await expect(page.locator("#valueSaveError")).toBeHidden();
});

test("navigating away with an unsaved failed change prompts, and Cancel keeps you on the cell", async ({
  page,
  sheetsMock,
}) => {
  sheetsMock.sheets.Value = [
    ["Item", "Status"],
    ["Widget A", "Active"],
    ["Widget B", "Pending"],
  ];
  sheetsMock.sheets.Justification = [
    ["Item", "Status"],
    ["Widget A justification", ""],
    ["Widget B justification", ""],
  ];

  await page.goto("/index.html");
  await signIn(page);

  sheetsMock.failAllPuts = true;
  await page.fill("#valueBox", "unsaved edit");
  await expect(page.locator("#valueStatus")).toHaveText("Not saved", { timeout: 3000 });

  let dialogMessage = "";
  page.once("dialog", async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.dismiss(); // Cancel
  });
  await page.selectOption("#rowSelect", { label: "Widget B" });

  expect(dialogMessage).toContain("UNSAVED CHANGE WILL BE LOST");
  await expect(page.locator("#rowSelect")).toHaveValue("2"); // still Widget A
  await expect(page.locator("#valueBox")).toHaveValue("unsaved edit");
});

test("confirming the data-loss prompt discards the change and navigates", async ({ page, sheetsMock }) => {
  sheetsMock.sheets.Value = [
    ["Item", "Status"],
    ["Widget A", "Active"],
    ["Widget B", "Pending"],
  ];
  sheetsMock.sheets.Justification = [
    ["Item", "Status"],
    ["Widget A justification", ""],
    ["Widget B justification", ""],
  ];

  await page.goto("/index.html");
  await signIn(page);

  sheetsMock.failAllPuts = true;
  await page.fill("#valueBox", "unsaved edit");
  await expect(page.locator("#valueStatus")).toHaveText("Not saved", { timeout: 3000 });

  page.once("dialog", (dialog) => dialog.accept());
  await page.selectOption("#rowSelect", { label: "Widget B" });

  await expect(page.locator("#rowSelect")).toHaveValue("3");
  await expect(page.locator("#valueBox")).toHaveValue("Pending");
});

import { test, expect, signIn, configureSettings } from "./fixtures/mockGoogle.js";

test("signs in, loads the sheet, and shows the first row/field", async ({ page, sheetsMock }) => {
  sheetsMock.sheets.Value = [
    ["Item", "Status", "Notes"],
    ["Widget A", "Active", "hello"],
  ];
  sheetsMock.sheets.Justification = [
    ["Item", "Status", "Notes"],
    ["Widget A justification", "", "a note"],
  ];

  await page.goto("/index.html");
  await expect(page.locator("#authStatus")).toHaveText("Not signed in");

  await signIn(page);

  await expect(page.locator("#rowSelectLabel")).toHaveText("Item");
  await expect(page.locator("#rowSelect")).toHaveValue("2");
  await expect(page.locator("#colSelect")).toHaveValue("2");
  await expect(page.locator("#valueBox")).toHaveValue("Active");
  await expect(page.locator("#justBox")).toHaveValue("");
});

test("signing out returns to the signed-out state", async ({ page, sheetsMock }) => {
  sheetsMock.sheets.Value = [["Item", "Status"], ["Widget A", "Active"]];
  sheetsMock.sheets.Justification = [["Item", "Status"], ["Widget A justification", ""]];

  await page.goto("/index.html");
  await signIn(page);

  await page.click("#signOutBtn");

  await expect(page.locator("#authStatus")).toHaveText("Not signed in");
  await expect(page.locator("#initiativeCard")).toBeHidden();
  await expect(page.locator("#signInBtn")).toBeVisible();
});

test("shows a clear message when the target tab has no rows/columns", async ({ page, sheetsMock }) => {
  sheetsMock.sheets.Value = [["Item"]]; // header only, no data rows
  sheetsMock.sheets.Justification = [["Item"]];

  await page.goto("/index.html");
  await configureSettings(page);
  await page.click("#signInBtn");

  await expect(page.locator("#globalMessage")).toContainText("no rows/columns found");
  await expect(page.locator("#initiativeCard")).toBeHidden();
});

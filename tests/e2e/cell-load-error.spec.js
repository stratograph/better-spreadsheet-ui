// Regression test: a failed cell load used to leave the Value <select> (for
// select-type fields) stuck showing only "Loading...", re-enabled but
// effectively frozen - and a later fix that re-enabled both fields on error
// created its own problem (editing a box that doesn't reflect the cell's
// real, unknown content risks silently overwriting real data). Both fields
// must now stay disabled, with a clear error placeholder, until a load
// actually succeeds.
import { test, expect, signIn } from "./fixtures/mockGoogle.js";

test("a failed load on a select-type field leaves both fields disabled, not stuck on a broken dropdown", async ({
  page,
  sheetsMock,
}) => {
  sheetsMock.sheets.Value = [["Item", "Status"], ["Widget A", "Active"]];
  sheetsMock.sheets.Justification = [["Item", "Status"], ["Widget A justification", "a note"]];
  sheetsMock.sheets.Metadata = [
    ["Column name", "Description", "Field type", "Possible values"],
    ["Status", "current status", "single-select", "Active\nInactive"],
  ];

  await page.goto("/index.html");
  await signIn(page);
  await expect(page.locator("#valueSelect")).toHaveValue("Active");

  sheetsMock.failNextCellGet = true;
  await page.click("#reloadBtn");

  await expect(page.locator("#globalMessage")).toContainText("Error loading cell values");
  await expect(page.locator("#valueSelect")).toBeHidden();
  await expect(page.locator("#valueBox")).toBeVisible();
  await expect(page.locator("#valueBox")).toBeDisabled();
  await expect(page.locator("#valueBox")).toHaveAttribute("placeholder", "Error loading - try again");
  await expect(page.locator("#justBox")).toBeDisabled();
  await expect(page.locator("#justBox")).toHaveAttribute("placeholder", "Error loading - try again");
});

test("recovers cleanly on a later successful reload, no page refresh needed", async ({ page, sheetsMock }) => {
  sheetsMock.sheets.Value = [["Item", "Status"], ["Widget A", "Active"]];
  sheetsMock.sheets.Justification = [["Item", "Status"], ["Widget A justification", "a note"]];
  sheetsMock.sheets.Metadata = [
    ["Column name", "Description", "Field type", "Possible values"],
    ["Status", "current status", "single-select", "Active\nInactive"],
  ];

  await page.goto("/index.html");
  await signIn(page);

  sheetsMock.failNextCellGet = true;
  await page.click("#reloadBtn");
  await expect(page.locator("#valueBox")).toBeDisabled();

  await page.click("#reloadBtn");
  await expect(page.locator("#valueSelect")).toBeVisible();
  await expect(page.locator("#valueSelect")).toHaveValue("Active");
  await expect(page.locator("#valueSelect")).toBeEnabled();
  await expect(page.locator("#justBox")).toHaveValue("a note");
  await expect(page.locator("#justBox")).toBeEnabled();
});

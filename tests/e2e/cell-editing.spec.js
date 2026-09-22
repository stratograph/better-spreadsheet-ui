import { test, expect, signIn } from "./fixtures/mockGoogle.js";

test("editing Value debounce-saves and shows Saved status", async ({ page, sheetsMock }) => {
  sheetsMock.sheets.Value = [["Item", "Status"], ["Widget A", "Active"]];
  sheetsMock.sheets.Justification = [["Item", "Status"], ["Widget A justification", ""]];

  await page.goto("/index.html");
  await signIn(page);

  await page.fill("#valueBox", "Escalated");
  await expect(page.locator("#valueStatus")).toHaveText("Saved", { timeout: 3000 });

  expect(sheetsMock.putCalls.at(-1)).toMatchObject({
    range: "Value!B2",
    body: { values: [["Escalated"]] },
  });
});

test("editing Justification debounce-saves independently of Value", async ({ page, sheetsMock }) => {
  sheetsMock.sheets.Value = [["Item", "Status"], ["Widget A", "Active"]];
  sheetsMock.sheets.Justification = [["Item", "Status"], ["Widget A justification", ""]];

  await page.goto("/index.html");
  await signIn(page);

  await page.fill("#justBox", "Because reasons");
  await expect(page.locator("#justStatus")).toHaveText("Saved", { timeout: 3000 });

  expect(sheetsMock.putCalls.at(-1)).toMatchObject({
    range: "Justification!B2",
    body: { values: [["Because reasons"]] },
  });
});

test("a formula cell is shown (with its computed value) but disabled", async ({ page, sheetsMock }) => {
  sheetsMock.sheets.Value = [["Item", "Status"], ["Widget A", "=UPPER(\"active\")"]];
  sheetsMock.sheets.Justification = [["Item", "Status"], ["Widget A justification", ""]];
  // The mock's cell() just returns whatever's stored verbatim for both
  // FORMATTED_VALUE and FORMULA render modes, so make the raw text itself
  // look like a formula (starts with "=") to trigger isFormula detection.

  await page.goto("/index.html");
  await signIn(page);

  await expect(page.locator("#valueBox")).toBeDisabled();
  await expect(page.locator("#valueFormulaNote")).toBeVisible();
});

test("switching cells shows the new cell's own content, not the previous one's", async ({ page, sheetsMock }) => {
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
  await expect(page.locator("#valueBox")).toHaveValue("Active");

  await page.selectOption("#rowSelect", { label: "Widget B" });
  await expect(page.locator("#valueBox")).toHaveValue("Pending");
});

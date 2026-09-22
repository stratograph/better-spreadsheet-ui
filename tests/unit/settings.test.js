import { describe, it, expect } from "vitest";
import { loadSettings, saveSettings, isSettingsComplete } from "../../js/settings.js";

describe("loadSettings", () => {
  it("returns all-blank defaults with default tab names when nothing is stored", () => {
    const settings = loadSettings();
    expect(settings).toEqual({
      clientId: "",
      sheetId: "",
      valueSheetName: "Value",
      justSheetName: "Justification",
      metadataSheetName: "Metadata",
      extraChangeLogging: false,
      historySheetName: "Edit History",
    });
  });

  it("round-trips whatever was saved", () => {
    const settings = {
      clientId: "abc123",
      sheetId: "sheet-xyz",
      valueSheetName: "MyValues",
      justSheetName: "MyJust",
      metadataSheetName: "MyMeta",
      extraChangeLogging: true,
      historySheetName: "MyHistory",
    };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });

  it("falls back to defaults for individually missing fields", () => {
    localStorage.setItem("sheetCellEditor.settings.v1", JSON.stringify({ clientId: "only-this" }));
    const settings = loadSettings();
    expect(settings.clientId).toBe("only-this");
    expect(settings.valueSheetName).toBe("Value");
    expect(settings.justSheetName).toBe("Justification");
    expect(settings.metadataSheetName).toBe("Metadata");
    expect(settings.historySheetName).toBe("Edit History");
    expect(settings.extraChangeLogging).toBe(false);
  });

  it("coerces a truthy but non-boolean extraChangeLogging to a real boolean", () => {
    localStorage.setItem("sheetCellEditor.settings.v1", JSON.stringify({ extraChangeLogging: "yes" }));
    expect(loadSettings().extraChangeLogging).toBe(true);
  });

  it("recovers to defaults from corrupt JSON instead of throwing", () => {
    localStorage.setItem("sheetCellEditor.settings.v1", "{not valid json");
    expect(() => loadSettings()).not.toThrow();
    expect(loadSettings().valueSheetName).toBe("Value");
  });
});

describe("isSettingsComplete", () => {
  const complete = {
    clientId: "a",
    sheetId: "b",
    valueSheetName: "c",
    justSheetName: "d",
    metadataSheetName: "e",
    extraChangeLogging: false,
    historySheetName: "f",
  };

  it("is true when all required fields are present", () => {
    expect(isSettingsComplete(complete)).toBe(true);
  });

  it("does not require historySheetName or extraChangeLogging (optional feature)", () => {
    const { historySheetName, extraChangeLogging, ...rest } = complete;
    expect(isSettingsComplete(rest)).toBe(true);
  });

  for (const field of ["clientId", "sheetId", "valueSheetName", "justSheetName", "metadataSheetName"]) {
    it(`is false when ${field} is missing`, () => {
      expect(isSettingsComplete({ ...complete, [field]: "" })).toBe(false);
    });
  }
});

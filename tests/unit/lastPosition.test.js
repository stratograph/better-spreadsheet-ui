import { describe, it, expect, vi } from "vitest";
import { loadLastPosition, saveLastPosition } from "../../js/lastPosition.js";

describe("loadLastPosition / saveLastPosition", () => {
  it("returns null when nothing has been saved", () => {
    expect(loadLastPosition()).toBeNull();
  });

  it("round-trips a saved position", () => {
    const position = { sheetId: "s1", valueSheetName: "Value", rowName: "Widget A", colName: "Status" };
    saveLastPosition(position);
    expect(loadLastPosition()).toEqual(position);
  });

  it("returns null instead of throwing on corrupt stored JSON", () => {
    localStorage.setItem("sheetCellEditor.lastPosition.v1", "{not valid json");
    expect(() => loadLastPosition()).not.toThrow();
    expect(loadLastPosition()).toBeNull();
  });

  it("swallows a storage write failure (e.g. quota exceeded in private browsing)", () => {
    const original = localStorage.setItem;
    localStorage.setItem = vi.fn(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      expect(() => saveLastPosition({ sheetId: "s1" })).not.toThrow();
    } finally {
      localStorage.setItem = original;
    }
  });
});

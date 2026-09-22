import { describe, it, expect } from "vitest";
import {
  normalizeKey,
  buildMetadataMap,
  isSelectFieldType,
  buildMetadataDescriptionText,
} from "../../js/metadata.js";

describe("normalizeKey", () => {
  it("trims and lowercases", () => {
    expect(normalizeKey("  Status  ")).toBe("status");
  });
  it("treats null/undefined as empty string", () => {
    expect(normalizeKey(null)).toBe("");
    expect(normalizeKey(undefined)).toBe("");
  });
  it("coerces non-strings", () => {
    expect(normalizeKey(42)).toBe("42");
  });
});

describe("buildMetadataMap", () => {
  it("parses rows into a map keyed by normalized column name", () => {
    const values = [
      ["Column name", "Description", "Field type", "Possible values"],
      ["Status", "Current status", "single-select", "Active\nPending\nDone"],
      ["Notes", "Free text notes", "", ""],
    ];
    const map = buildMetadataMap(values);
    expect(map["status"]).toEqual({
      description: "Current status",
      fieldType: "single-select",
      possibleValues: ["Active", "Pending", "Done"],
    });
    expect(map["notes"]).toEqual({
      description: "Free text notes",
      fieldType: "",
      possibleValues: [],
    });
  });

  it("keys are trimmed and lowercased, so lookups are case/whitespace-insensitive", () => {
    const values = [
      ["Column name", "Description", "Field type", "Possible values"],
      ["  Owner  ", "desc", "", ""],
    ];
    const map = buildMetadataMap(values);
    expect(map["owner"]).toBeDefined();
  });

  it("skips rows with a blank column name", () => {
    const values = [
      ["Column name", "Description", "Field type", "Possible values"],
      ["", "orphan description", "", ""],
      ["Real", "real description", "", ""],
    ];
    const map = buildMetadataMap(values);
    expect(Object.keys(map)).toEqual(["real"]);
  });

  it("ignores blank lines and surrounding whitespace within possible values", () => {
    const values = [
      ["Column name", "Description", "Field type", "Possible values"],
      ["Field1", "", "single-select", "  Alpha  \n\nBeta\n"],
    ];
    const map = buildMetadataMap(values);
    expect(map["field1"].possibleValues).toEqual(["Alpha", "Beta"]);
  });

  it("returns an empty map for header-only input", () => {
    expect(buildMetadataMap([["Column name", "Description", "Field type", "Possible values"]])).toEqual({});
  });

  it("handles a completely empty sheet without throwing", () => {
    expect(buildMetadataMap([])).toEqual({});
  });

  it("tolerates short/ragged rows missing trailing columns", () => {
    const values = [
      ["Column name", "Description", "Field type", "Possible values"],
      ["Field1"],
    ];
    const map = buildMetadataMap(values);
    expect(map["field1"]).toEqual({ description: "", fieldType: "", possibleValues: [] });
  });
});

describe("isSelectFieldType", () => {
  it("is false for blank/empty field type", () => {
    expect(isSelectFieldType("")).toBe(false);
    expect(isSelectFieldType(undefined)).toBe(false);
  });
  it('is false for "text"', () => {
    expect(isSelectFieldType("text")).toBe(false);
  });
  it("is true for any other non-empty type", () => {
    expect(isSelectFieldType("single-select")).toBe(true);
    expect(isSelectFieldType("multi-select")).toBe(true);
    expect(isSelectFieldType("number")).toBe(true);
  });
});

describe("buildMetadataDescriptionText", () => {
  it("returns just the description when there are no possible values", () => {
    const meta = { description: "Just a description.", fieldType: "", possibleValues: [] };
    expect(buildMetadataDescriptionText(meta)).toBe("Just a description.");
  });

  it("lists possible values (bulleted) for a non-select field type", () => {
    const meta = { description: "", fieldType: "", possibleValues: ["Alpha", "Beta"] };
    expect(buildMetadataDescriptionText(meta)).toBe("Possible values:\n - Alpha\n - Beta");
  });

  it("combines description and possible values with a blank line for non-select types", () => {
    const meta = { description: "Pick a priority.", fieldType: "", possibleValues: ["Low", "High"] };
    expect(buildMetadataDescriptionText(meta)).toBe(
      "Pick a priority.\n\nPossible values:\n - Low\n - High"
    );
  });

  it("omits possible values for a select-type field (already shown via the dropdown)", () => {
    const meta = {
      description: "Should not repeat values here.",
      fieldType: "single-select",
      possibleValues: ["Yes", "No"],
    };
    expect(buildMetadataDescriptionText(meta)).toBe("Should not repeat values here.");
  });

  it("falls back to a placeholder when there is neither description nor possible values", () => {
    const meta = { description: "", fieldType: "", possibleValues: [] };
    expect(buildMetadataDescriptionText(meta)).toBe("(No description provided.)");
  });

  it("falls back to the placeholder for a select-type field with values but no description", () => {
    const meta = { description: "", fieldType: "single-select", possibleValues: ["A", "B"] };
    expect(buildMetadataDescriptionText(meta)).toBe("(No description provided.)");
  });
});

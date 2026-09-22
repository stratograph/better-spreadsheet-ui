import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { escapeHtml, debounce, countCompletedFields } from "../../js/utils.js";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;"
    );
  });
  it("leaves ordinary text untouched", () => {
    expect(escapeHtml("plain text 123")).toBe("plain text 123");
  });
  it("handles an empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("only invokes once after rapid repeated calls, with the last call's args", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced("first");
    debounced("second");
    debounced("third");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("third");
  });

  it("fires again for a separate call made after the delay has elapsed", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced("a");
    vi.advanceTimersByTime(100);
    debounced("b");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, "a");
    expect(fn).toHaveBeenNthCalledWith(2, "b");
  });

  it("does not fire before the delay elapses", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("countCompletedFields", () => {
  it("counts non-blank cells across columns 1..total, excluding column 0 (row label)", () => {
    // row: [rowLabel, col1, col2, col3]
    const grid = [["Item A", "x", "", "y"]];
    expect(countCompletedFields(grid, 0, 3)).toBe(2);
  });

  it("treats whitespace-only cells as not completed", () => {
    const grid = [["Item A", "   ", "y"]];
    expect(countCompletedFields(grid, 0, 2)).toBe(1);
  });

  it("returns 0 for a negative row index without throwing", () => {
    expect(countCompletedFields([["Item A", "x"]], -1, 1)).toBe(0);
  });

  it("treats a missing row (out of bounds) as fully empty", () => {
    expect(countCompletedFields([], 5, 3)).toBe(0);
  });

  it("treats a short/ragged row as having blanks for missing trailing columns", () => {
    const grid = [["Item A", "x"]]; // only 1 of 3 field columns present
    expect(countCompletedFields(grid, 0, 3)).toBe(1);
  });

  it("returns 0 when total is 0", () => {
    expect(countCompletedFields([["Item A", "x", "y"]], 0, 0)).toBe(0);
  });
});

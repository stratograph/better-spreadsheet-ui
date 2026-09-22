import { describe, it, expect, vi, afterEach } from "vitest";
import {
  colToLetter,
  getSheetValues,
  getCell,
  writeCell,
  getSheetTitles,
  addHiddenSheet,
  writeHeaderRow,
  appendRow,
  AuthError,
  HttpError,
} from "../../js/sheetsApi.js";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("colToLetter", () => {
  it.each([
    [1, "A"],
    [2, "B"],
    [26, "Z"],
    [27, "AA"],
    [28, "AB"],
    [52, "AZ"],
    [53, "BA"],
    [702, "ZZ"],
    [703, "AAA"],
  ])("colToLetter(%i) === %s", (n, expected) => {
    expect(colToLetter(n)).toBe(expected);
  });
});

describe("AuthError / HttpError", () => {
  it("AuthError is a real Error", () => {
    const err = new AuthError("nope");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("nope");
  });
  it("HttpError carries the response and body", () => {
    const res = { status: 500 };
    const err = new HttpError("failed", res, "body text");
    expect(err).toBeInstanceOf(Error);
    expect(err.res).toBe(res);
    expect(err.body).toBe("body text");
  });
});

describe("getSheetValues", () => {
  it("builds the correct URL and forwards the bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ values: [["a", "b"]] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSheetValues("sheet-1", "My Tab", "tok-123");

    expect(result).toEqual([["a", "b"]]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sheets.googleapis.com/v4/spreadsheets/sheet-1/values/My%20Tab");
    expect(options.headers.Authorization).toBe("Bearer tok-123");
  });

  it("returns [] when the sheet has no values", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    expect(await getSheetValues("s", "Tab", "t")).toEqual([]);
  });
});

describe("getCell", () => {
  it("fetches both FORMATTED_VALUE and FORMULA render modes", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("valueRenderOption=FORMULA")) {
        return jsonResponse({ values: [["=SUM(A1:A2)"]] });
      }
      return jsonResponse({ values: [["3"]] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const cell = await getCell("s", "Value", "B2", "tok");
    expect(cell).toEqual({ formatted: "3", isFormula: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("isFormula is false for a plain value", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ values: [["hello"]] })));
    const cell = await getCell("s", "Value", "B2", "tok");
    expect(cell).toEqual({ formatted: "hello", isFormula: false });
  });

  it("treats a leading-whitespace formula as a formula", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("FORMULA")) return jsonResponse({ values: [["  =A1"]] });
      return jsonResponse({ values: [["x"]] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const cell = await getCell("s", "Value", "B2", "tok");
    expect(cell.isFormula).toBe(true);
  });

  it("returns an empty string for a genuinely empty cell", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    const cell = await getCell("s", "Value", "B2", "tok");
    expect(cell).toEqual({ formatted: "", isFormula: false });
  });
});

describe("writeCell", () => {
  it("PUTs with valueInputOption=USER_ENTERED and the value wrapped as a single row/cell", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await writeCell("s", "Value", "B2", "hello world", "tok");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/s/values/Value!B2?valueInputOption=USER_ENTERED"
    );
    expect(options.method).toBe("PUT");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({ values: [["hello world"]] });
  });
});

describe("getSheetTitles", () => {
  it("maps the sheets response down to just properties", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          sheets: [{ properties: { title: "Value", hidden: false } }, { properties: { title: "History", hidden: true } }],
        })
      )
    );
    const titles = await getSheetTitles("s", "tok");
    expect(titles).toEqual([
      { title: "Value", hidden: false },
      { title: "History", hidden: true },
    ]);
  });

  it("returns [] when the response has no sheets", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    expect(await getSheetTitles("s", "tok")).toEqual([]);
  });
});

describe("addHiddenSheet", () => {
  it("POSTs a batchUpdate addSheet request with hidden:true and returns the new properties", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ replies: [{ addSheet: { properties: { sheetId: 42, title: "Edit History", hidden: true } } }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const props = await addHiddenSheet("s", "Edit History", "tok");

    expect(props).toEqual({ sheetId: 42, title: "Edit History", hidden: true });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sheets.googleapis.com/v4/spreadsheets/s:batchUpdate");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.requests[0].addSheet.properties).toEqual({ title: "Edit History", hidden: true });
  });
});

describe("writeHeaderRow", () => {
  it("PUTs the header values to <sheetName>!A1", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await writeHeaderRow("s", "Edit History", ["Row name", "Column name"], "tok");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/s/values/Edit%20History!A1?valueInputOption=USER_ENTERED"
    );
    expect(JSON.parse(options.body)).toEqual({ values: [["Row name", "Column name"]] });
  });
});

describe("appendRow", () => {
  it("POSTs to the :append endpoint with insertDataOption=INSERT_ROWS", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await appendRow("s", "Edit History", ["a", "b", "c"], "tok");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain(":append");
    expect(url).toContain("insertDataOption=INSERT_ROWS");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ values: [["a", "b", "c"]] });
  });
});

describe("error handling (shared apiFetch behavior)", () => {
  it("throws AuthError on a 401 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));
    await expect(getSheetValues("s", "Tab", "tok")).rejects.toBeInstanceOf(AuthError);
  });

  it("throws HttpError (with body) on any other non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, 500)));
    await expect(getSheetValues("s", "Tab", "tok")).rejects.toBeInstanceOf(HttpError);
  });
});

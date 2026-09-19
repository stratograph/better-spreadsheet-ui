export class AuthError extends Error {}

export class HttpError extends Error {
  constructor(message, res, body) {
    super(message);
    this.res = res;
    this.body = body;
  }
}

export function colToLetter(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function apiFetch(url, token, options) {
  options = options || {};
  options.headers = Object.assign({}, options.headers, {
    Authorization: "Bearer " + token,
  });
  const res = await fetch(url, options);
  if (res.status === 401) {
    throw new AuthError("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new HttpError("Sheets API request failed", res, body);
  }
  return res.json();
}

export async function getSheetValues(sheetId, sheetName, token) {
  const range = encodeURIComponent(sheetName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;
  const data = await apiFetch(url, token);
  return data.values || [];
}

async function getCellRendered(sheetId, sheetName, a1, token, valueRenderOption) {
  const range = encodeURIComponent(`${sheetName}!${a1}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueRenderOption=${valueRenderOption}`;
  const data = await apiFetch(url, token);
  return data.values && data.values[0] && data.values[0][0] !== undefined
    ? data.values[0][0]
    : "";
}

export async function getCell(sheetId, sheetName, a1, token) {
  const [formatted, formula] = await Promise.all([
    getCellRendered(sheetId, sheetName, a1, token, "FORMATTED_VALUE"),
    getCellRendered(sheetId, sheetName, a1, token, "FORMULA"),
  ]);
  return {
    formatted,
    isFormula: typeof formula === "string" && formula.trim().startsWith("="),
  };
}

export async function writeCell(sheetId, sheetName, a1, value, token) {
  const range = encodeURIComponent(`${sheetName}!${a1}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`;
  await apiFetch(url, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [[value]] }),
  });
}

export async function getSheetTitles(sheetId, token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=${encodeURIComponent(
    "sheets.properties(title,hidden)"
  )}`;
  const data = await apiFetch(url, token);
  return (data.sheets || []).map((s) => s.properties);
}

export async function addHiddenSheet(sheetId, title, token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`;
  const data = await apiFetch(url, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title, hidden: true } } }] }),
  });
  return data.replies[0].addSheet.properties;
}

export async function writeHeaderRow(sheetId, sheetName, headerValues, token) {
  const range = encodeURIComponent(`${sheetName}!A1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`;
  await apiFetch(url, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [headerValues] }),
  });
}

export async function appendRow(sheetId, sheetName, rowValues, token) {
  const range = encodeURIComponent(sheetName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await apiFetch(url, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [rowValues] }),
  });
}

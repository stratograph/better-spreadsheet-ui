import { loadSettings, saveSettings, isSettingsComplete } from "./settings.js";
import { colToLetter, getSheetValues, getCell, writeCell, AuthError } from "./sheetsApi.js";
import { createTokenClient, revokeToken } from "./auth.js";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

const el = (id) => document.getElementById(id);
const clientIdInput = el("clientId");
const sheetIdInput = el("sheetId");
const valueSheetNameInput = el("valueSheetName");
const justSheetNameInput = el("justSheetName");
const saveSettingsBtn = el("saveSettingsBtn");
const settingsDetails = el("settingsDetails");

const authStatus = el("authStatus");
const signInBtn = el("signInBtn");
const signOutBtn = el("signOutBtn");

const selectorCard = el("selectorCard");
const rowSelect = el("rowSelect");
const colSelect = el("colSelect");
const reloadBtn = el("reloadBtn");

const valueCard = el("valueCard");
const justCard = el("justCard");
const valueBox = el("valueBox");
const justBox = el("justBox");
const valueStatus = el("valueStatus");
const justStatus = el("justStatus");
const valueFormulaNote = el("valueFormulaNote");
const justFormulaNote = el("justFormulaNote");

const globalMessage = el("globalMessage");
const emptyHint = el("emptyHint");
const footerBar = el("footerBar");
const footerSpacer = el("footerSpacer");

function syncFooterSpacer() {
  footerSpacer.style.height = footerBar.offsetHeight + "px";
}
window.addEventListener("resize", syncFooterSpacer);
settingsDetails.addEventListener("toggle", syncFooterSpacer);

let settings = loadSettings();
let tokenClient = null;
let accessToken = null;
let rowLabels = [];
let colHeaders = [];
let suppressAutoSave = false;
let valueIsFormula = false;
let justIsFormula = false;

function populateSettingsForm() {
  clientIdInput.value = settings.clientId;
  sheetIdInput.value = settings.sheetId;
  valueSheetNameInput.value = settings.valueSheetName;
  justSheetNameInput.value = settings.justSheetName;
}

function showMessage(text, type) {
  if (!text) {
    globalMessage.className = "";
    globalMessage.textContent = "";
    return;
  }
  globalMessage.textContent = text;
  globalMessage.className = "show " + (type || "info");
}

populateSettingsForm();
if (!isSettingsComplete(settings)) {
  settingsDetails.setAttribute("open", "");
}

saveSettingsBtn.addEventListener("click", () => {
  settings = {
    clientId: clientIdInput.value.trim(),
    sheetId: sheetIdInput.value.trim(),
    valueSheetName: valueSheetNameInput.value.trim() || "Value",
    justSheetName: justSheetNameInput.value.trim() || "Justification",
  };
  saveSettings(settings);
  showMessage("Settings saved.", "info");
  tokenClient = null; // force re-init with new client id on next sign-in
  if (accessToken && isSettingsComplete(settings)) {
    loadSheetStructure();
  }
});

function ensureTokenClient() {
  if (!settings.clientId) {
    showMessage("Enter a Google OAuth Client ID in Settings first.", "error");
    return null;
  }
  if (!tokenClient) {
    tokenClient = createTokenClient(
      settings.clientId,
      SCOPE,
      (token) => {
        accessToken = token;
        onSignedIn();
      },
      (error) => showMessage("Sign-in failed: " + error, "error")
    );
  }
  return tokenClient;
}

signInBtn.addEventListener("click", () => {
  showMessage("", null);
  const client = ensureTokenClient();
  if (!client) return;
  client.requestAccessToken({ prompt: "consent" });
});

signOutBtn.addEventListener("click", () => {
  if (accessToken) {
    revokeToken(accessToken);
  }
  accessToken = null;
  updateSignedOutUI();
});

function updateSignedOutUI() {
  authStatus.textContent = "Not signed in";
  signInBtn.style.display = "";
  signOutBtn.style.display = "none";
  reloadBtn.style.display = "none";
  selectorCard.style.display = "none";
  valueCard.style.display = "none";
  justCard.style.display = "none";
  emptyHint.style.display = "";
  syncFooterSpacer();
}

function onSignedIn() {
  authStatus.textContent = "Signed in";
  signInBtn.style.display = "none";
  signOutBtn.style.display = "";
  showMessage("", null);
  if (!isSettingsComplete(settings)) {
    showMessage("Fill in all Settings fields, then Save Settings.", "error");
    settingsDetails.setAttribute("open", "");
    syncFooterSpacer();
    return;
  }
  reloadBtn.style.display = "";
  syncFooterSpacer();
  loadSheetStructure();
}

reloadBtn.addEventListener("click", () => {
  if (accessToken) loadSheetStructure();
});

function handleFetchError(err, context) {
  if (err instanceof AuthError) {
    showMessage("Session expired. Please sign in again.", "error");
    accessToken = null;
    updateSignedOutUI();
    return;
  }
  console.error(context, err);
  showMessage("Error " + context + ". See console for details.", "error");
}

async function loadSheetStructure() {
  showMessage("Loading sheet structure...", "info");
  try {
    const values = await getSheetValues(settings.sheetId, settings.valueSheetName, accessToken);
    const headerRow = values[0] || [];
    colHeaders = headerRow.slice(1);
    rowLabels = values.slice(1).map((r) => (r && r[0] !== undefined ? r[0] : ""));

    if (rowLabels.length === 0 || colHeaders.length === 0) {
      showMessage("Sheet loaded but no rows/columns found. Check tab name and layout.", "error");
      selectorCard.style.display = "none";
      valueCard.style.display = "none";
      justCard.style.display = "none";
      emptyHint.style.display = "";
      return;
    }

    rowSelect.innerHTML = rowLabels
      .map((label, i) => `<option value="${i + 2}">${escapeHtml(String(label))}</option>`)
      .join("");
    colSelect.innerHTML = colHeaders
      .map((label, i) => `<option value="${i + 2}">${colToLetter(i + 2)} - ${escapeHtml(String(label))}</option>`)
      .join("");

    selectorCard.style.display = "";
    valueCard.style.display = "";
    justCard.style.display = "";
    emptyHint.style.display = "none";
    showMessage("", null);
    await loadCellValues();
  } catch (err) {
    handleFetchError(err, "loading sheet structure");
  }
}

rowSelect.addEventListener("change", loadCellValues);
colSelect.addEventListener("change", loadCellValues);

function currentA1() {
  const row = rowSelect.value;
  const col = colSelect.value;
  if (!row || !col) return null;
  return colToLetter(Number(col)) + row;
}

function applyFieldState(box, noteEl, cell) {
  box.value = cell.formatted;
  box.disabled = cell.isFormula;
  noteEl.style.display = cell.isFormula ? "" : "none";
}

const VALUE_BOX_MAX_LINES = 15;

function autosizeValueBox() {
  valueBox.style.height = "auto";
  const style = getComputedStyle(valueBox);
  const verticalExtras =
    parseFloat(style.paddingTop) +
    parseFloat(style.paddingBottom) +
    parseFloat(style.borderTopWidth) +
    parseFloat(style.borderBottomWidth);
  const maxHeight = parseFloat(style.lineHeight) * VALUE_BOX_MAX_LINES + verticalExtras;
  const desiredHeight = Math.min(valueBox.scrollHeight, maxHeight);
  valueBox.style.height = desiredHeight + "px";
  valueBox.style.overflowY = valueBox.scrollHeight > maxHeight ? "auto" : "hidden";
}

async function loadCellValues() {
  const a1 = currentA1();
  if (!a1) return;
  suppressAutoSave = true;
  valueBox.value = "";
  justBox.value = "";
  autosizeValueBox();
  valueBox.disabled = true;
  justBox.disabled = true;
  valueBox.placeholder = "Loading...";
  justBox.placeholder = "Loading...";
  valueStatus.textContent = "";
  justStatus.textContent = "";
  valueFormulaNote.style.display = "none";
  justFormulaNote.style.display = "none";
  try {
    const [v, j] = await Promise.all([
      getCell(settings.sheetId, settings.valueSheetName, a1, accessToken),
      getCell(settings.sheetId, settings.justSheetName, a1, accessToken),
    ]);
    valueIsFormula = v.isFormula;
    justIsFormula = j.isFormula;
    applyFieldState(valueBox, valueFormulaNote, v);
    applyFieldState(justBox, justFormulaNote, j);
    autosizeValueBox();
  } catch (err) {
    valueBox.disabled = false;
    justBox.disabled = false;
    handleFetchError(err, "loading cell values");
  } finally {
    valueBox.placeholder = "Cell contents";
    justBox.placeholder = "Cell contents";
    suppressAutoSave = false;
  }
}

async function saveCell(sheetName, a1, value, statusEl) {
  statusEl.textContent = "Saving...";
  statusEl.className = "field-status";
  try {
    await writeCell(settings.sheetId, sheetName, a1, value, accessToken);
    statusEl.textContent = "Saved";
    statusEl.className = "field-status ok";
    setTimeout(() => {
      if (statusEl.textContent === "Saved") statusEl.textContent = "";
    }, 1500);
  } catch (err) {
    statusEl.textContent = "Error saving";
    statusEl.className = "field-status error";
    handleFetchError(err, "saving cell");
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const debouncedSaveValue = debounce(() => {
  const a1 = currentA1();
  if (!a1 || suppressAutoSave || valueIsFormula) return;
  saveCell(settings.valueSheetName, a1, valueBox.value, valueStatus);
}, 700);

const debouncedSaveJust = debounce(() => {
  const a1 = currentA1();
  if (!a1 || suppressAutoSave || justIsFormula) return;
  saveCell(settings.justSheetName, a1, justBox.value, justStatus);
}, 700);

valueBox.addEventListener("input", () => {
  autosizeValueBox();
  debouncedSaveValue();
});
justBox.addEventListener("input", debouncedSaveJust);

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

updateSignedOutUI();

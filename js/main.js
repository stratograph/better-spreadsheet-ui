import { loadSettings, saveSettings, isSettingsComplete } from "./settings.js";
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
} from "./sheetsApi.js";
import { createTokenClient, revokeToken } from "./auth.js";
import { normalizeKey, buildMetadataMap, isSelectFieldType } from "./metadata.js";

const HISTORY_HEADER = ["Row name", "Column name", "Value or Justification", "Old value", "New value", "Edit timestamp"];

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

const el = (id) => document.getElementById(id);
const clientIdInput = el("clientId");
const sheetIdInput = el("sheetId");
const valueSheetNameInput = el("valueSheetName");
const justSheetNameInput = el("justSheetName");
const metadataSheetNameInput = el("metadataSheetName");
const extraChangeLoggingInput = el("extraChangeLogging");
const historySheetNameInput = el("historySheetName");
const saveSettingsBtn = el("saveSettingsBtn");
const settingsDetails = el("settingsDetails");

const authStatus = el("authStatus");
const signInBtn = el("signInBtn");
const signOutBtn = el("signOutBtn");

const initiativeCard = el("initiativeCard");
const fieldCard = el("fieldCard");
const rowSelectLabel = el("rowSelectLabel");
const rowSelect = el("rowSelect");
const colSelect = el("colSelect");
const reloadBtn = el("reloadBtn");
const completionFill = el("completionFill");
const completionLabel = el("completionLabel");
const metadataMissingNote = el("metadataMissingNote");
const metadataAccordion = el("metadataAccordion");
const metadataDescription = el("metadataDescription");

const valueCard = el("valueCard");
const justCard = el("justCard");
const valueBox = el("valueBox");
const valueSelect = el("valueSelect");
const justBox = el("justBox");
const valueStatus = el("valueStatus");
const justStatus = el("justStatus");
const valueFormulaNote = el("valueFormulaNote");
const justFormulaNote = el("justFormulaNote");
const valueSaveError = el("valueSaveError");
const justSaveError = el("justSaveError");
const addClipboardBtn = el("addClipboardBtn");

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
let valueGrid = [];
let metadataByName = {};
let currentFieldMeta = null;
let suppressAutoSave = false;
let valueIsFormula = false;
let justIsFormula = false;
let committedRowValue = "";
let committedColValue = "";
let cellLoadSnapshot = null;
let valueLastSaved = "";
let justLastSaved = "";
let historySheetReady = false;

function populateSettingsForm() {
  clientIdInput.value = settings.clientId;
  sheetIdInput.value = settings.sheetId;
  valueSheetNameInput.value = settings.valueSheetName;
  justSheetNameInput.value = settings.justSheetName;
  metadataSheetNameInput.value = settings.metadataSheetName;
  extraChangeLoggingInput.checked = settings.extraChangeLogging;
  historySheetNameInput.value = settings.historySheetName;
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
    metadataSheetName: metadataSheetNameInput.value.trim() || "Metadata",
    extraChangeLogging: extraChangeLoggingInput.checked,
    historySheetName: historySheetNameInput.value.trim() || "Edit History",
  };
  saveSettings(settings);
  showMessage("Settings saved.", "info");
  tokenClient = null; // force re-init with new client id on next sign-in
  historySheetReady = false; // re-check/create in case logging or the tab name changed
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

signOutBtn.addEventListener("click", async () => {
  await flushHistoryForOutgoingCell();
  if (accessToken) {
    revokeToken(accessToken);
  }
  accessToken = null;
  cellLoadSnapshot = null;
  updateSignedOutUI();
});

function updateSignedOutUI() {
  authStatus.textContent = "Not signed in";
  signInBtn.style.display = "";
  signOutBtn.style.display = "none";
  reloadBtn.style.display = "none";
  initiativeCard.style.display = "none";
  fieldCard.style.display = "none";
  valueCard.style.display = "none";
  justCard.style.display = "none";
  emptyHint.style.display = "";
  rowSelectLabel.textContent = "Row";
  addClipboardBtn.style.display = "none";
  clearSaveError(valueSaveError, [valueBox, valueSelect]);
  clearSaveError(justSaveError, [justBox]);
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
    valueGrid = values.slice(1);
    rowLabels = valueGrid.map((r) => (r && r[0] !== undefined ? r[0] : ""));

    if (rowLabels.length === 0 || colHeaders.length === 0) {
      showMessage("Sheet loaded but no rows/columns found. Check tab name and layout.", "error");
      initiativeCard.style.display = "none";
      fieldCard.style.display = "none";
      valueCard.style.display = "none";
      justCard.style.display = "none";
      emptyHint.style.display = "";
      rowSelectLabel.textContent = "Row";
      return;
    }

    rowSelectLabel.textContent = headerRow[0] || "Row";

    rowSelect.innerHTML = rowLabels
      .map((label, i) => `<option value="${i + 2}">${escapeHtml(String(label))}</option>`)
      .join("");
    colSelect.innerHTML = colHeaders
      .map((label, i) => `<option value="${i + 2}">${colToLetter(i + 2)} - ${escapeHtml(String(label))}</option>`)
      .join("");
    committedRowValue = rowSelect.value;
    committedColValue = colSelect.value;

    try {
      const metaValues = await getSheetValues(settings.sheetId, settings.metadataSheetName, accessToken);
      metadataByName = buildMetadataMap(metaValues);
    } catch (metaErr) {
      metadataByName = {};
      console.error("loading field metadata", metaErr);
      showMessage("Sheet loaded, but field metadata failed to load. Check the metadata tab name.", "error");
    }

    initiativeCard.style.display = "";
    fieldCard.style.display = "";
    valueCard.style.display = "";
    justCard.style.display = "";
    emptyHint.style.display = "none";
    if (globalMessage.textContent === "Loading sheet structure...") {
      showMessage("", null);
    }
    await loadCellValues();
  } catch (err) {
    handleFetchError(err, "loading sheet structure");
  }
}

function hasUnsavedSaveError() {
  return valueSaveError.style.display !== "none" || justSaveError.style.display !== "none";
}

function handleSelectorChange() {
  if (hasUnsavedSaveError()) {
    const proceed = window.confirm(
      "⚠ UNSAVED CHANGE WILL BE LOST\n\n" +
        "A change on this row/field FAILED TO SAVE to the spreadsheet. " +
        "If you switch rows or fields now, that edit is gone for good — " +
        "there is no way to get it back.\n\n" +
        "Click Cancel to stay here and try saving again, or OK to permanently discard the unsaved change."
    );
    if (!proceed) {
      rowSelect.value = committedRowValue;
      colSelect.value = committedColValue;
      return;
    }
  }
  committedRowValue = rowSelect.value;
  committedColValue = colSelect.value;
  loadCellValues();
}

rowSelect.addEventListener("change", handleSelectorChange);
colSelect.addEventListener("change", handleSelectorChange);

function currentA1() {
  const row = rowSelect.value;
  const col = colSelect.value;
  if (!row || !col) return null;
  return colToLetter(Number(col)) + row;
}

function currentColumnName() {
  const idx = Number(colSelect.value) - 2;
  if (Number.isNaN(idx) || idx < 0 || idx >= colHeaders.length) return "";
  return String(colHeaders[idx] == null ? "" : colHeaders[idx]).trim();
}

function currentRowIndex() {
  const idx = Number(rowSelect.value) - 2;
  if (Number.isNaN(idx) || idx < 0 || idx >= valueGrid.length) return -1;
  return idx;
}

function updateCompletion() {
  const rowIdx = currentRowIndex();
  const total = colHeaders.length;
  let completed = 0;
  if (rowIdx >= 0) {
    const row = valueGrid[rowIdx] || [];
    for (let col = 1; col <= total; col++) {
      if (row[col] !== undefined && String(row[col]).trim() !== "") completed++;
    }
  }
  completionFill.style.width = (total > 0 ? (completed / total) * 100 : 0) + "%";
  completionLabel.textContent = `${completed} / ${total} fields completed`;
}

function updateFieldMetadata() {
  const key = normalizeKey(currentColumnName());
  currentFieldMeta = metadataByName[key] || null;

  if (currentFieldMeta) {
    metadataMissingNote.style.display = "none";
    metadataAccordion.style.display = "";
    metadataDescription.textContent = currentFieldMeta.description || "(No description provided.)";
  } else {
    metadataMissingNote.style.display = "";
    metadataAccordion.style.display = "none";
  }
}

function currentValueIsSelectType() {
  return isSelectFieldType(currentFieldMeta ? currentFieldMeta.fieldType : "");
}

function applyJustificationState(cell) {
  justBox.value = cell.formatted;
  justBox.disabled = cell.isFormula;
  justFormulaNote.style.display = cell.isFormula ? "" : "none";
  refreshClipboardButton();
}

let lastPastedClipboardText = null;

async function refreshClipboardButton() {
  if (justBox.disabled || justCard.style.display === "none") {
    addClipboardBtn.style.display = "none";
    return;
  }
  try {
    const text = await navigator.clipboard.readText();
    const hasNewContent = text && text.trim() && text !== lastPastedClipboardText;
    addClipboardBtn.style.display = hasNewContent ? "" : "none";
  } catch (e) {
    addClipboardBtn.style.display = "none";
  }
}

window.addEventListener("focus", () => {
  if (justCard.style.display !== "none") refreshClipboardButton();
});

addClipboardBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;
    const existing = justBox.value.replace(/\n+$/, "");
    justBox.value = existing ? existing + "\n\n" + text : text;
    justBox.focus();
    justBox.selectionStart = justBox.selectionEnd = justBox.value.length;
    justBox.scrollTop = justBox.scrollHeight;
    justBox.dispatchEvent(new Event("input", { bubbles: true }));
    lastPastedClipboardText = text;
    addClipboardBtn.style.display = "none";
  } catch (e) {
    showMessage("Couldn't read clipboard contents.", "error");
  }
});

function applyValueState(cell) {
  const useSelect = currentValueIsSelectType();
  valueBox.style.display = useSelect ? "none" : "";
  valueSelect.style.display = useSelect ? "" : "none";

  if (useSelect) {
    const possibleValues = currentFieldMeta ? currentFieldMeta.possibleValues : [];
    const optionValues = ["", ...possibleValues];
    const currentKey = normalizeKey(cell.formatted);
    const matchedOption = optionValues.find((opt) => normalizeKey(opt) === currentKey);

    valueSelect.innerHTML = "";
    optionValues.forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt;
      option.textContent = opt === "" ? "(blank)" : opt;
      valueSelect.appendChild(option);
    });

    if (matchedOption === undefined) {
      // Ephemeral: reflects the sheet's current (unlisted) value without
      // being added to the stored possible-values list.
      const option = document.createElement("option");
      option.value = cell.formatted;
      option.textContent = cell.formatted + " (not in list)";
      valueSelect.appendChild(option);
      valueSelect.value = cell.formatted;
    } else {
      valueSelect.value = matchedOption;
    }
    valueSelect.disabled = cell.isFormula;
  } else {
    valueBox.value = cell.formatted;
    valueBox.disabled = cell.isFormula;
  }

  valueFormulaNote.style.display = cell.isFormula ? "" : "none";
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
  await flushHistoryForOutgoingCell();
  updateFieldMetadata();
  updateCompletion();
  suppressAutoSave = true;

  const useSelect = currentValueIsSelectType();
  valueBox.style.display = useSelect ? "none" : "";
  valueSelect.style.display = useSelect ? "" : "none";
  valueSelect.innerHTML = '<option value="">Loading...</option>';
  valueSelect.disabled = true;

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
  addClipboardBtn.style.display = "none";
  clearSaveError(valueSaveError, [valueBox, valueSelect]);
  clearSaveError(justSaveError, [justBox]);
  try {
    const [v, j] = await Promise.all([
      getCell(settings.sheetId, settings.valueSheetName, a1, accessToken),
      getCell(settings.sheetId, settings.justSheetName, a1, accessToken),
    ]);
    valueIsFormula = v.isFormula;
    justIsFormula = j.isFormula;
    applyValueState(v);
    applyJustificationState(j);
    if (!currentValueIsSelectType()) autosizeValueBox();
    cellLoadSnapshot = {
      rowName: String(rowLabels[currentRowIndex()] ?? "").trim(),
      colName: currentColumnName(),
      value: v.formatted,
      justification: j.formatted,
    };
    valueLastSaved = v.formatted;
    justLastSaved = j.formatted;
  } catch (err) {
    valueBox.disabled = false;
    justBox.disabled = false;
    valueSelect.disabled = false;
    handleFetchError(err, "loading cell values");
  } finally {
    valueBox.placeholder = "Cell contents";
    justBox.placeholder = "Cell contents";
    suppressAutoSave = false;
  }
}

function clearSaveError(errorNoteEl, controlEls) {
  errorNoteEl.style.display = "none";
  controlEls.forEach((c) => c.classList.remove("has-save-error"));
}

function showSaveError(errorNoteEl, controlEls) {
  errorNoteEl.style.display = "";
  controlEls.forEach((c) => c.classList.add("has-save-error"));
}

async function saveCell(sheetName, a1, value, statusEl, errorNoteEl, controlEls) {
  statusEl.textContent = "Saving...";
  statusEl.className = "field-status";
  try {
    await writeCell(settings.sheetId, sheetName, a1, value, accessToken);
    statusEl.textContent = "Saved";
    statusEl.className = "field-status ok";
    clearSaveError(errorNoteEl, controlEls);
    setTimeout(() => {
      if (statusEl.textContent === "Saved") statusEl.textContent = "";
    }, 1500);
    return true;
  } catch (err) {
    statusEl.textContent = "Not saved";
    statusEl.className = "field-status error";
    showSaveError(errorNoteEl, controlEls);
    handleFetchError(err, "saving cell");
    return false;
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function saveValueField() {
  const a1 = currentA1();
  if (!a1 || suppressAutoSave || valueIsFormula) return;
  const value = currentValueIsSelectType() ? valueSelect.value : valueBox.value;
  const rowIdx = currentRowIndex();
  const colIdx = Number(colSelect.value) - 1;
  const ok = await saveCell(settings.valueSheetName, a1, value, valueStatus, valueSaveError, [valueBox, valueSelect]);
  if (ok) {
    valueLastSaved = value;
    if (rowIdx >= 0) {
      if (!valueGrid[rowIdx]) valueGrid[rowIdx] = [];
      valueGrid[rowIdx][colIdx] = value;
      updateCompletion();
    }
  }
}

const debouncedSaveValue = debounce(saveValueField, 700);

const debouncedSaveJust = debounce(async () => {
  const a1 = currentA1();
  if (!a1 || suppressAutoSave || justIsFormula) return;
  const ok = await saveCell(settings.justSheetName, a1, justBox.value, justStatus, justSaveError, [justBox]);
  if (ok) justLastSaved = justBox.value;
}, 700);

async function ensureHistorySheet() {
  if (historySheetReady) return;
  const titles = await getSheetTitles(settings.sheetId, accessToken);
  const exists = titles.some((p) => p.title === settings.historySheetName);
  if (!exists) {
    await addHiddenSheet(settings.sheetId, settings.historySheetName, accessToken);
    await writeHeaderRow(settings.sheetId, settings.historySheetName, HISTORY_HEADER, accessToken);
  }
  historySheetReady = true;
}

async function flushHistoryForOutgoingCell() {
  if (!settings.extraChangeLogging || !cellLoadSnapshot) return;
  const snapshot = cellLoadSnapshot;
  const timestamp = new Date().toISOString();
  const entries = [];
  if (valueLastSaved !== snapshot.value) {
    entries.push([snapshot.rowName, snapshot.colName, "Value", snapshot.value, valueLastSaved, timestamp]);
  }
  if (justLastSaved !== snapshot.justification) {
    entries.push([snapshot.rowName, snapshot.colName, "Justification", snapshot.justification, justLastSaved, timestamp]);
  }
  if (entries.length === 0) return;
  try {
    await ensureHistorySheet();
    for (const row of entries) {
      await appendRow(settings.sheetId, settings.historySheetName, row, accessToken);
    }
  } catch (err) {
    console.error("logging change history", err);
  }
}

valueBox.addEventListener("input", () => {
  autosizeValueBox();
  debouncedSaveValue();
});
valueSelect.addEventListener("change", saveValueField);
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

const LS_KEY = "sheetCellEditor.settings.v1";

const DEFAULTS = {
  clientId: "",
  sheetId: "",
  valueSheetName: "Value",
  justSheetName: "Justification",
  metadataSheetName: "Metadata",
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      clientId: parsed.clientId || DEFAULTS.clientId,
      sheetId: parsed.sheetId || DEFAULTS.sheetId,
      valueSheetName: parsed.valueSheetName || DEFAULTS.valueSheetName,
      justSheetName: parsed.justSheetName || DEFAULTS.justSheetName,
      metadataSheetName: parsed.metadataSheetName || DEFAULTS.metadataSheetName,
    };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(LS_KEY, JSON.stringify(settings));
}

export function isSettingsComplete(settings) {
  return !!(
    settings.clientId &&
    settings.sheetId &&
    settings.valueSheetName &&
    settings.justSheetName &&
    settings.metadataSheetName
  );
}

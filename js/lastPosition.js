const LS_KEY = "sheetCellEditor.lastPosition.v1";

export function loadLastPosition() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveLastPosition(position) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(position));
  } catch (e) {
    // ignore storage errors (e.g. private browsing quota)
  }
}

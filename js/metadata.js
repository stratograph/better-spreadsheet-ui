export function normalizeKey(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

// Expects a header row of "Column name,Description,Field type,Possible values"
// followed by one row per field. Returns a map keyed by normalized column name.
export function buildMetadataMap(values) {
  const map = {};
  const rows = values.slice(1);
  for (const row of rows) {
    const key = normalizeKey(row && row[0]);
    if (!key) continue;
    const description = (row && row[1]) || "";
    const fieldType = normalizeKey(row && row[2]);
    const possibleValues = String((row && row[3]) || "")
      .split("\n")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    map[key] = { description, fieldType, possibleValues };
  }
  return map;
}

export function isSelectFieldType(fieldType) {
  return !!fieldType && fieldType !== "text";
}

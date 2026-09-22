export function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// grid: array of row arrays (as returned by the Sheets API, column A first).
// Counts how many of columns 1..total (i.e. excluding column A's row label)
// have a non-blank value for the given row.
export function countCompletedFields(grid, rowIdx, total) {
  if (rowIdx < 0) return 0;
  const row = grid[rowIdx] || [];
  let completed = 0;
  for (let col = 1; col <= total; col++) {
    if (row[col] !== undefined && String(row[col]).trim() !== "") completed++;
  }
  return completed;
}

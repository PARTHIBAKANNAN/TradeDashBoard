// Client-side CSV export — no backend endpoint needed, since every field the
// export buttons need is already present on the order rows already fetched
// for the on-screen history table.

function escapeCsvCell(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// `columns`: [{ key, label }]
export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(",");
  const lines = (rows || []).map((row) =>
    columns.map((c) => escapeCsvCell(row[c.key])).join(","),
  );
  return [header, ...lines].join("\r\n");
}

export function downloadCsv(filename, csvString) {
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

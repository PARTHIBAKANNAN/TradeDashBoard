import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";

const SECTIONS = [
  { key: "orders", label: "Orders" },
  { key: "pnl", label: "P&L" },
  { key: "tax", label: "Tax" },
  { key: "brokerage", label: "Brokerage" },
  { key: "combined", label: "Combined" },
];

// Generates .xlsx workbooks server-side (openpyxl), reusing the same
// date-filtered query that backs the on-screen history table — no
// client-side spreadsheet library, no duplicated column logic.
export default function ExportButtons({ orders, range }) {
  const [downloading, setDownloading] = useState(null);
  const hasClosed = (orders || []).some(
    (o) => o.status === "CLOSED" || o.status === "CANCELLED",
  );

  const exportSection = async (key) => {
    setDownloading(key);
    try {
      const params = new URLSearchParams({ section: key });
      if (range?.from) params.set("from_ts", range.from.toISOString());
      if (range?.to) params.set("to_ts", range.to.toISOString());
      const r = await fetch(`/api/paper/orders/export?${params.toString()}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`Export failed (${r.status})`);
      const blob = await r.blob();
      const disposition = r.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `paper-trading-${key}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* nothing row-local to show — the button simply stops spinning */
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {SECTIONS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => exportSection(key)}
          disabled={!hasClosed || downloading === key}
          title={`Export ${label} as Excel`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-subtle bg-surface3 px-3 py-1.5 text-xs font-semibold text-muted hover:text-accent-blue hover:border-accent-blue/40 disabled:opacity-40 transition-colors"
        >
          {downloading === key ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Download size={12} />
          )}
          {label}
        </button>
      ))}
    </div>
  );
}

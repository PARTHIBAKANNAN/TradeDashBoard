import React, { useState } from "react";
import { CalendarRange } from "lucide-react";
import { PRESETS } from "../../utils/dateRanges.js";

function toInputValue(date) {
  return date ? date.toISOString().slice(0, 10) : "";
}

// Preset buttons (Today/Yesterday/This Week/Last Week/This Month/Last 30/60
// Days) plus a custom from/to pair. Calls back with `{from, to}` Date objects
// whenever the selection changes — the caller (PaperTrading.jsx) owns the
// actual fetch.
export default function DateRangeFilter({ activeKey, onChange }) {
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const applyPreset = (preset) => {
    onChange(preset.key, preset.range());
  };

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    const from = new Date(`${customFrom}T00:00:00`);
    const to = new Date(`${customTo}T23:59:59.999`);
    onChange("custom", { from, to });
  };

  return (
    <div className="rounded-xl border border-subtle bg-surface2/70 backdrop-blur-xl shadow-card p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider mb-3">
        <CalendarRange size={12} />
        Date Range
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => applyPreset(preset)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors border ${
              activeKey === preset.key
                ? "bg-accent-blue/15 border-accent-blue/40 text-accent-blue"
                : "bg-surface3 border-subtle text-muted hover:text-primary"
            }`}
          >
            {preset.label}
          </button>
        ))}

        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-subtle">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="bg-surface3 border border-strong rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-accent-blue"
          />
          <span className="text-faint text-xs">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="bg-surface3 border border-strong rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-accent-blue"
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!customFrom || !customTo}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors border ${
              activeKey === "custom"
                ? "bg-accent-blue/15 border-accent-blue/40 text-accent-blue"
                : "bg-surface3 border-subtle text-muted hover:text-primary disabled:opacity-50"
            }`}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// Exposed for callers that want to render the currently-active range as text.
export function formatRangeLabel(from, to) {
  if (!from || !to) return "";
  return `${toInputValue(from)} to ${toInputValue(to)}`;
}

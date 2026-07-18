import React, { useMemo } from "react";

const NEAR_HIGH_THRESHOLD = 95; // day_range_pos >= this = near today's high
const NEAR_LOW_THRESHOLD = 5; // day_range_pos <= this = near today's low
const TOP_N = 8;

function MiniList({ title, rows }) {
  return (
    <div className="bg-surface2/80 backdrop-blur-xl border border-subtle rounded-lg p-4 shadow-glow-sm">
      <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
        {title}
      </h3>
      <div className="space-y-1">
        {rows.map((s) => (
          <div
            key={s.symbol}
            className="flex items-center justify-between text-xs py-1"
          >
            <span className="font-bold text-primary truncate">{s.symbol}</span>
            <span className="font-mono text-faint">{s.day_range_pos}%</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-faint">No data yet.</p>}
      </div>
    </div>
  );
}

// Stocks trading near their intraday high vs. near their intraday low —
// a classic momentum/exhaustion read, derived purely from day_range_pos
// (already streamed) with no backend change needed.
export default function NewHighsLows({ stocks }) {
  const { nearHigh, nearLow } = useMemo(() => {
    const list = stocks || [];
    return {
      nearHigh: list
        .filter((s) => s.day_range_pos >= NEAR_HIGH_THRESHOLD)
        .sort((a, b) => b.day_range_pos - a.day_range_pos)
        .slice(0, TOP_N),
      nearLow: list
        .filter((s) => s.day_range_pos <= NEAR_LOW_THRESHOLD)
        .sort((a, b) => a.day_range_pos - b.day_range_pos)
        .slice(0, TOP_N),
    };
  }, [stocks]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <MiniList
        title={`New Highs (≥${NEAR_HIGH_THRESHOLD}% of day range)`}
        rows={nearHigh}
      />
      <MiniList
        title={`New Lows (≤${NEAR_LOW_THRESHOLD}% of day range)`}
        rows={nearLow}
      />
    </div>
  );
}

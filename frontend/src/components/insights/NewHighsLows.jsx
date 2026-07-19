import React, { useMemo } from "react";
import { ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import MiniList from "./MiniList.jsx";

const NEAR_HIGH_THRESHOLD = 95; // day_range_pos >= this = near today's high
const NEAR_LOW_THRESHOLD = 5; // day_range_pos <= this = near today's low
const TOP_N = 8;

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
        icon={ArrowUpCircle}
        rows={nearHigh}
        renderValue={(s) => (
          <span className="text-bull">{s.day_range_pos}%</span>
        )}
      />
      <MiniList
        title={`New Lows (≤${NEAR_LOW_THRESHOLD}% of day range)`}
        icon={ArrowDownCircle}
        rows={nearLow}
        renderValue={(s) => (
          <span className="text-bear">{s.day_range_pos}%</span>
        )}
      />
    </div>
  );
}

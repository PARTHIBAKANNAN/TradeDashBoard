import React from "react";

// Dual-track horizontal bar: yesterday's range (faint) behind today's range
// (accent), plus a tick marking where LTP currently sits — all three already
// normalized onto one shared 0-100 scale by rangeMap() (lib/rangeMap.js,
// mirrors backend calculations.range_map). Complements WatchlistRow's
// existing MiniCandlestick sparkline rather than replacing it.
export default function PriceRangeBar({ ranges, isPositive }) {
  if (!ranges) return null;
  const { yesterday, today, ltp_pos } = ranges;
  const gMin = Math.min(yesterday.raw_low, today.raw_low);
  const gMax = Math.max(yesterday.raw_high, today.raw_high);
  const fmt = (n) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  return (
    <div className="w-full max-w-[140px]">
      <div
        className="relative h-3.5 rounded-full bg-surface3 overflow-hidden"
        title={`Prev day: ${fmt(yesterday.raw_low)}–${fmt(yesterday.raw_high)}  ·  Today: ${fmt(today.raw_low)}–${fmt(today.raw_high)}`}
      >
        <div
          className="absolute inset-y-0 rounded-full bg-faint/30"
          style={{
            left: `${Math.max(0, yesterday.low)}%`,
            width: `${Math.max(0, yesterday.high - yesterday.low)}%`,
          }}
        />
        <div
          className="absolute inset-y-0 rounded-full bg-accent-blue/55"
          style={{
            left: `${Math.max(0, today.low)}%`,
            width: `${Math.max(0, today.high - today.low)}%`,
          }}
        />
        <div
          className={`absolute top-0 bottom-0 w-[2px] ${isPositive ? "bg-bull" : "bg-bear"}`}
          style={{ left: `${Math.min(99, Math.max(1, ltp_pos))}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[9px] text-faint font-mono mt-0.5">
        <span>{fmt(gMin)}</span>
        <span>{fmt(gMax)}</span>
      </div>
    </div>
  );
}

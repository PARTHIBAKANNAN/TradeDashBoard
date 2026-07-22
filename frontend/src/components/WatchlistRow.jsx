import React from "react";
import { motion } from "framer-motion";
import { ArrowUp, ArrowDown } from "lucide-react";
import OverlappingRangeBar from "./OverlappingRangeBar.jsx";

// React.memo isolates re-renders to rows whose stock object actually changed.
// `leading` renders an optional extra cell (e.g. a watchlist star toggle)
// as the row's first <td> — kept inside this single <tr>, since nesting a
// second <tr> inside a wrapping <td> (the old WatchlistScreen approach) is
// invalid HTML that browsers silently reflow via foster parenting.
const WatchlistRow = React.memo(({ stock, index = 0, leading }) => {
  const isPositive = stock.pct_change >= 0;
  const isRsPositive = stock.relative_strength >= 0;
  const hasSignal = stock.signal && stock.signal !== "None";
  const isBull = hasSignal && stock.signal.includes("Bull");
  // Both stay exactly 0 only when yesterday's range was never backfilled (e.g.
  // a broker-side historical-data permission gap) — a real price can't be 0.
  const hasYesterdayRange =
    stock.ranges?.yesterday?.raw_low > 0 || stock.ranges?.yesterday?.raw_high > 0;

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: Math.min(index, 20) * 0.012 }}
      className="group border-b border-subtle/70 hover:bg-surface3/40 transition-colors"
    >
      {leading && <td className="py-3 px-4 w-8">{leading}</td>}

      {/* Asset */}
      <td className="py-3 px-4">
        <div className="font-bold text-primary tracking-wide group-hover:text-accent-blue transition-colors">
          {stock.symbol}
        </div>
        <div className="text-[11px] text-faint font-semibold">
          {stock.sector}
        </div>
      </td>

      {/* LTP */}
      <td className="py-3 px-4 font-mono text-right tabular-nums">
        <span
          className={
            isPositive ? "text-bull font-semibold" : "text-bear font-semibold"
          }
        >
          {Number(stock.ltp).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
          })}
        </span>
        <div
          className={`text-[11px] flex items-center justify-end gap-0.5 ${
            isPositive ? "text-bull/80" : "text-bear/80"
          }`}
        >
          {isPositive ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
          {Math.abs(stock.pct_change)}%
        </div>
      </td>

      {/* Range bar */}
      <td className="py-3 px-4 text-center">
        <div className="flex flex-col items-center">
          <div className="flex justify-between w-[160px] text-[10px] text-faint font-mono mb-1">
            <span>{hasYesterdayRange ? stock.ranges?.yesterday?.raw_low : "—"}</span>
            <span>{hasYesterdayRange ? stock.ranges?.yesterday?.raw_high : "—"}</span>
          </div>
          {stock.ranges && <OverlappingRangeBar ranges={stock.ranges} />}
          <div className="text-[10px] text-faint font-mono mt-1">
            {stock.day_range_pos}% of day range
          </div>
        </div>
      </td>

      {/* Signal */}
      <td className="py-3 px-4 text-center">
        {hasSignal ? (
          <div
            className={`inline-flex flex-col items-center px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${
              isBull
                ? "bg-bull/10 text-bull border-bull/30"
                : "bg-bear/10 text-bear border-bear/30"
            }`}
          >
            <span className="flex items-center gap-1">
              {isBull ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
              {stock.signal}
            </span>
            <span className="text-[10px] font-semibold text-muted mt-0.5 font-mono">
              {stock.signal_time}
            </span>
          </div>
        ) : (
          <span className="text-faint font-semibold text-xs">—</span>
        )}
      </td>

      {/* Relative Strength vs Nifty */}
      <td className="py-3 px-4 font-mono text-right tabular-nums">
        <span
          className={`font-bold ${isRsPositive ? "text-bull" : "text-bear"}`}
        >
          {isRsPositive ? "+" : ""}
          {stock.relative_strength}
        </span>
        <div className="text-[10px] font-bold text-faint uppercase tracking-widest mt-0.5">
          {isRsPositive ? "Outperform" : "Underperform"}
        </div>
      </td>
    </motion.tr>
  );
});

export default WatchlistRow;

import React from "react";
import OverlappingRangeBar from "./OverlappingRangeBar.jsx";

// React.memo isolates re-renders to rows whose stock object actually changed.
const WatchlistRow = React.memo(({ stock }) => {
  const isPositive = stock.pct_change >= 0;
  const isRsPositive = stock.relative_strength >= 0;
  const hasSignal = stock.signal && stock.signal !== "None";
  const isBull = hasSignal && stock.signal.includes("Bull");

  return (
    <tr className="border-b border-subtle hover:bg-surface2 transition-colors">
      {/* Asset */}
      <td className="py-3 px-4">
        <div className="font-bold text-primary tracking-wide">
          {stock.symbol}
        </div>
        <div className="text-xs text-faint font-semibold">{stock.sector}</div>
      </td>

      {/* LTP */}
      <td className="py-3 px-4 font-mono text-right">
        <span
          className={
            isPositive
              ? "text-green-400 font-semibold"
              : "text-red-400 font-semibold"
          }
        >
          {Number(stock.ltp).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
          })}
        </span>
        <div
          className={`text-xs ${isPositive ? "text-green-500" : "text-red-500"}`}
        >
          {isPositive ? "+" : ""}
          {stock.pct_change}%
        </div>
      </td>

      {/* Range bar */}
      <td className="py-3 px-4 text-center">
        <div className="flex flex-col items-center">
          <div className="flex justify-between w-[160px] text-[10px] text-faint font-mono mb-1">
            <span>{stock.ranges?.yesterday?.raw_low}</span>
            <span>{stock.ranges?.yesterday?.raw_high}</span>
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
            className={`inline-flex flex-col items-center px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
              isBull
                ? "bg-green-950/50 text-green-400 border border-green-800/30"
                : "bg-red-950/50 text-red-400 border border-red-800/30"
            }`}
          >
            <span>
              {isBull ? "▲ " : "▼ "}
              {stock.signal}
            </span>
            <span className="text-[10px] font-semibold text-muted mt-0.5">
              {stock.signal_time}
            </span>
          </div>
        ) : (
          <span className="text-faint font-semibold text-xs">—</span>
        )}
      </td>

      {/* Relative Strength vs Nifty */}
      <td className="py-3 px-4 font-mono text-right">
        <span
          className={`font-bold ${isRsPositive ? "text-green-400" : "text-red-400"}`}
        >
          {isRsPositive ? "+" : ""}
          {stock.relative_strength}
        </span>
        <div className="text-[10px] font-bold text-faint uppercase tracking-widest mt-0.5">
          {isRsPositive ? "Outperform" : "Underperform"}
        </div>
      </td>
    </tr>
  );
});

export default WatchlistRow;

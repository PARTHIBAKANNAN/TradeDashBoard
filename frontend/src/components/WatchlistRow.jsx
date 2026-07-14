import React, { useMemo } from "react";
import OverlappingRangeBar from "./OverlappingRangeBar.jsx";
import { useStock } from "../hooks/useMarketStream.js";
import { rangeMap } from "../lib/rangeMap.js";

function WatchlistRow({ symbol }) {
  const stock = useStock(symbol);
  const ranges = useMemo(() => {
    if (!stock) return null;
    return rangeMap(
      stock.yesterday_low || 0, stock.yesterday_high || 0,
      stock.today_low || 0, stock.today_high || 0,
      stock.ltp || 0,
    );
  }, [
    stock?.yesterday_low, stock?.yesterday_high,
    stock?.today_low, stock?.today_high, stock?.ltp,
  ]);

  if (!stock) return null;

  const isPositive = stock.pct_change >= 0;
  const isRsPositive = stock.relative_strength >= 0;
  const hasSignal = stock.signal && stock.signal !== "None";
  const isBull = hasSignal && stock.signal.includes("Bull");

  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-900 transition-colors">
      <td className="py-3 px-4">
        <div className="font-bold text-white tracking-wide">{stock.symbol}</div>
        <div className="text-xs text-zinc-500 font-semibold">{stock.sector}</div>
      </td>

      <td className="py-3 px-4 font-mono text-right">
        <span className={isPositive ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
          {Number(stock.ltp).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </span>
        <div className={`text-xs ${isPositive ? "text-green-500" : "text-red-500"}`}>
          {isPositive ? "+" : ""}{stock.pct_change}%
        </div>
      </td>

      <td className="py-3 px-4 text-center">
        <div className="flex flex-col items-center">
          <div className="flex justify-between w-[160px] text-[10px] text-zinc-500 font-mono mb-1">
            <span>{ranges?.yesterday?.raw_low}</span>
            <span>{ranges?.yesterday?.raw_high}</span>
          </div>
          {ranges && <OverlappingRangeBar ranges={ranges} />}
          <div className="text-[10px] text-zinc-600 font-mono mt-1">
            {stock.day_range_pos}% of day range
          </div>
        </div>
      </td>

      <td className="py-3 px-4 text-center">
        {hasSignal ? (
          <div className={`inline-flex flex-col items-center px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
            isBull
              ? "bg-green-950/50 text-green-400 border border-green-800/30"
              : "bg-red-950/50 text-red-400 border border-red-800/30"
          }`}>
            <span>{isBull ? "▲ " : "▼ "}{stock.signal}</span>
            <span className="text-[10px] font-semibold text-zinc-400 mt-0.5">{stock.signal_time}</span>
          </div>
        ) : (
          <span className="text-zinc-600 font-semibold text-xs">—</span>
        )}
      </td>

      <td className="py-3 px-4 font-mono text-right">
        <span className={`font-bold ${isRsPositive ? "text-green-400" : "text-red-400"}`}>
          {isRsPositive ? "+" : ""}{stock.relative_strength}
        </span>
        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
          {isRsPositive ? "Outperform" : "Underperform"}
        </div>
      </td>
    </tr>
  );
}

export default WatchlistRow;

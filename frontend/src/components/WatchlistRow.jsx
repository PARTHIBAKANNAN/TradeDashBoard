import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, ArrowDown, Rocket, AlertTriangle, Sparkles } from "lucide-react";
import MiniCandlestick from "./MiniCandlestick.jsx";
import QuickTradeModal from "./paper-trading/QuickTradeModal.jsx";
import { useStock } from "../hooks/useMarketStream.js";
import { rangeMap } from "../lib/rangeMap.js";

// React.memo isolates re-renders to rows whose stock object actually changed.
// Accepts either `symbol` (subscribes via useStock) or `stock` prop directly.
const WatchlistRow = React.memo(
  ({ stock: propStock, symbol, index = 0, leading, niftyPctChange = 0, isRecommended = false }) => {
    const stockFromHook = useStock(symbol || propStock?.symbol);
    const stock = stockFromHook || propStock;
    const [tradeOpen, setTradeOpen] = useState(false);

    const ranges = useMemo(() => {
      if (!stock) return null;
      return (
        stock.ranges ||
        rangeMap(
          stock.yesterday_low || 0,
          stock.yesterday_high || 0,
          stock.today_low || 0,
          stock.today_high || 0,
          stock.ltp || 0,
        )
      );
    }, [
      stock?.yesterday_low,
      stock?.yesterday_high,
      stock?.today_low,
      stock?.today_high,
      stock?.ltp,
      stock?.ranges,
    ]);

    if (!stock) return null;

    const isPositive = stock.pct_change >= 0;
    const isRsPositive = stock.relative_strength >= 0;
    const hasSignal = stock.signal && stock.signal !== "None";
    const isBull = hasSignal && stock.signal.includes("Bull");
    // Already near today's high/low — a fresh entry here has less room left
    // in either direction than a stock still mid-range.
    const isExtended = stock.day_range_pos >= 85 || stock.day_range_pos <= 15;
    // Signal direction disagreeing with the broader market (Nifty) — lower
    // probability follow-through than a signal aligned with the index.
    const againstTrend =
      hasSignal && ((isBull && niftyPctChange < 0) || (!isBull && niftyPctChange > 0));

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
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-primary tracking-wide group-hover:text-accent-blue transition-colors">
              {stock.symbol}
            </span>
            {isRecommended && (
              <span
                title="Recommended: top-scoring by RS, sector strength, volume, VWAP side, signal freshness, and range position — a filtering aid, not a guarantee"
                className="inline-flex items-center gap-0.5 rounded-full bg-accent-amber/15 text-accent-amber border border-accent-amber/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
              >
                <Sparkles size={9} /> Recommended
              </span>
            )}
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

        {/* Mini candlestick chart — today's session, built live from ticks */}
        <td className="py-3 px-4 text-center">
          <div className="flex flex-col items-center">
            <MiniCandlestick candles={stock.candles} />
            <div className="text-[10px] text-faint font-mono mt-1 flex items-center gap-1">
              {stock.day_range_pos}% of day range
              {isExtended && (
                <span
                  title="Already near today's high/low — less room left for a fresh entry"
                  className="text-accent-amber font-bold"
                >
                  Extended
                </span>
              )}
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
                {againstTrend && (
                  <AlertTriangle
                    size={10}
                    className="text-accent-amber"
                    title={`Nifty is ${niftyPctChange >= 0 ? "up" : "down"} — this breakout is against the broader trend`}
                  />
                )}
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

        {/* Quick paper-trade entry point */}
        <td className="py-3 px-4 text-center">
          <button
            onClick={() => setTradeOpen(true)}
            title="Paper trade this stock"
            className="inline-flex items-center gap-1 rounded-lg border border-subtle bg-surface3 px-2.5 py-1 text-[11px] font-bold text-muted hover:text-accent-blue hover:border-accent-blue/40 transition-colors"
          >
            <Rocket size={11} /> Trade
          </button>
          {tradeOpen && (
            <QuickTradeModal symbol={stock.symbol} onClose={() => setTradeOpen(false)} />
          )}
        </td>
      </motion.tr>
    );
  },
);

export default WatchlistRow;

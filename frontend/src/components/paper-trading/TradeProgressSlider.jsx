import React from "react";
import { ShieldAlert, Target, Award, Zap } from "lucide-react";

export default function TradeProgressSlider({
  side = "BUY",
  entryPrice = 0,
  slPrice = 0,
  targetPrice = 0,
  tslPrice = null,
  ltp = 0,
}) {
  const entry = Number(entryPrice) || 0;
  const sl = Number(slPrice) || 0;
  const currentPrice = Number(ltp) || entry;
  const isBuy = side === "BUY";

  // Calculate default target if not specified (1:2 Risk-Reward)
  const rDist = Math.abs(entry - sl);
  const target =
    Number(targetPrice) || (isBuy ? entry + 2 * rDist : entry - 2 * rDist);

  // If missing critical values, render fallback
  if (entry <= 0 || sl <= 0 || rDist <= 0) {
    return (
      <div className="py-2 text-[11px] text-faint flex items-center justify-between">
        <span>Entry: ₹{entry.toFixed(2)}</span>
        <span>LTP: ₹{currentPrice.toFixed(2)}</span>
      </div>
    );
  }

  // Calculate range bounds
  // For BUY: min = sl, max = target
  // For SELL: min = target, max = sl
  const minVal = isBuy ? sl : target;
  const maxVal = isBuy ? target : sl;
  const span = maxVal - minVal;

  const clampPct = (val) => {
    if (span <= 0) return 50;
    const pct = ((val - minVal) / span) * 100;
    return Math.max(2, Math.min(98, pct));
  };

  const entryPct = clampPct(entry);
  const ltpPct = clampPct(currentPrice);

  // Trailing stop position if active
  const activeTsl = Number(tslPrice) || null;
  const tslPct = activeTsl ? clampPct(activeTsl) : null;

  // R-Multiple calculation
  const pnlPts = isBuy ? currentPrice - entry : entry - currentPrice;
  const currentR = (pnlPts / rDist).toFixed(2);
  const isProfit = pnlPts >= 0;

  return (
    <div className="w-full bg-surface2/60 border border-subtle/70 rounded-xl p-3 my-2 shadow-inner">
      {/* Header metrics */}
      <div className="flex items-center justify-between text-[11px] mb-2 font-mono font-medium">
        <div className="flex items-center gap-1.5 text-bear">
          <ShieldAlert size={13} className="text-bear/80" />
          <span>SL: ₹{sl.toFixed(2)}</span>
          <span className="text-[10px] text-faint">(-1.0R)</span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
              isProfit
                ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/40"
                : "bg-rose-950/80 text-rose-400 border border-rose-800/40"
            }`}
          >
            {isProfit ? `+${currentR}R` : `${currentR}R`}
          </span>
          {activeTsl && (
            <span className="text-amber-400 flex items-center gap-0.5 text-[10px] bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-800/30">
              <Zap size={10} /> TSL ₹{activeTsl.toFixed(2)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-bull">
          <Target size={13} className="text-bull/80" />
          <span>TP: ₹{target.toFixed(2)}</span>
          <span className="text-[10px] text-faint">(+2.0R)</span>
        </div>
      </div>

      {/* Slider Track */}
      <div className="relative w-full h-3 bg-surface3 rounded-full overflow-visible my-3 border border-border-subtle/50">
        {/* Risk Zone (from SL to Entry) */}
        <div
          className="absolute top-0 bottom-0 bg-bear/15 rounded-l-full"
          style={
            isBuy
              ? { left: "0%", width: `${entryPct}%` }
              : { left: `${entryPct}%`, width: `${100 - entryPct}%` }
          }
        />

        {/* Profit Zone (from Entry to Target) */}
        <div
          className="absolute top-0 bottom-0 bg-bull/15 rounded-r-full"
          style={
            isBuy
              ? { left: `${entryPct}%`, width: `${100 - entryPct}%` }
              : { left: "0%", width: `${entryPct}%` }
          }
        />

        {/* Entry Marker */}
        <div
          className="absolute top-[-3px] bottom-[-3px] w-1 bg-white/70 rounded-full z-10"
          style={{ left: `${entryPct}%` }}
          title={`Entry: ₹${entry.toFixed(2)}`}
        />

        {/* Trailing Stop Marker if active */}
        {tslPct !== null && (
          <div
            className="absolute top-[-4px] bottom-[-4px] w-1.5 bg-amber-400 rounded-full z-10 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
            style={{ left: `${tslPct}%` }}
            title={`Active Trailing Stop: ₹${activeTsl.toFixed(2)}`}
          />
        )}

        {/* Live LTP Marker (Pulsing Dot) */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full z-20 flex items-center justify-center transition-all duration-300 shadow-md ${
            isProfit
              ? "bg-bull border-2 border-white shadow-[0_0_10px_rgba(16,185,129,0.8)]"
              : "bg-bear border-2 border-white shadow-[0_0_10px_rgba(239,68,68,0.8)]"
          }`}
          style={{ left: `${ltpPct}%` }}
        >
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping opacity-75" />
        </div>
      </div>

      {/* Bottom Labels */}
      <div className="flex items-center justify-between text-[10px] text-muted font-mono pt-1">
        <span>{isBuy ? "Stop Loss" : "Target (+2R)"}</span>
        <div className="flex items-center gap-1 text-primary font-semibold">
          <span className="w-2 h-2 rounded-full bg-white/60 inline-block" />
          <span>Entry ₹{entry.toFixed(2)}</span>
        </div>
        <span>{isBuy ? "Target (+2R)" : "Stop Loss"}</span>
      </div>
    </div>
  );
}

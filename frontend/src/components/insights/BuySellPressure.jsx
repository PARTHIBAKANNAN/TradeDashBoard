import React, { useMemo } from "react";
import { Scale } from "lucide-react";
import SplitBar from "../ui/SplitBar.jsx";

// Aggregate market-wide order-flow imbalance across the whole watchlist,
// using tot_buy_qty/tot_sell_qty already carried on FYERS ticks (captured in
// backend/app/fyers_service.py alongside volume). Same slim-banner
// convention as MarketBreadth.jsx.
export default function BuySellPressure({ stocks }) {
  const { buyQty, sellQty, total } = useMemo(() => {
    let buyQty = 0,
      sellQty = 0;
    for (const s of stocks || []) {
      buyQty += s.tot_buy_qty || 0;
      sellQty += s.tot_sell_qty || 0;
    }
    return { buyQty, sellQty, total: buyQty + sellQty };
  }, [stocks]);

  const buyPct = total ? (buyQty / total) * 100 : 50;
  const sellPct = total ? (sellQty / total) * 100 : 50;

  return (
    <div className="rounded-xl border border-subtle bg-surface2/70 backdrop-blur-xl shadow-card px-5 py-3.5 flex items-center gap-5">
      <span className="flex items-center gap-1.5 text-xs font-bold text-muted uppercase tracking-wider whitespace-nowrap">
        <Scale size={13} className="text-accent-blue" />
        Buy/Sell Pressure
      </span>
      <SplitBar
        segments={[
          { pct: buyPct, className: "bg-bull" },
          { pct: sellPct, className: "bg-bear" },
        ]}
      />
      <div className="flex items-center gap-4 text-xs font-mono whitespace-nowrap tabular-nums">
        <span className="text-bull font-bold">{buyPct.toFixed(1)}% Buy</span>
        <span className="text-bear font-bold">{sellPct.toFixed(1)}% Sell</span>
        {total === 0 && <span className="text-faint">(no order-flow data yet)</span>}
      </div>
    </div>
  );
}

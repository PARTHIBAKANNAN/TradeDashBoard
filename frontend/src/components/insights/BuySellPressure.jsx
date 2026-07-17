import React, { useMemo } from "react";

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
    <div className="bg-surface2/80 backdrop-blur-xl border border-subtle rounded-lg px-5 py-3 flex items-center gap-5 shadow-glow-sm">
      <span className="text-xs font-bold text-muted uppercase tracking-wider whitespace-nowrap">
        Buy/Sell Pressure
      </span>
      <div className="flex-1 h-2.5 rounded-full overflow-hidden flex bg-surface3">
        {buyPct > 0 && <div style={{ width: `${buyPct}%` }} className="bg-green-500" />}
        {sellPct > 0 && <div style={{ width: `${sellPct}%` }} className="bg-red-500" />}
      </div>
      <div className="flex items-center gap-4 text-xs font-mono whitespace-nowrap">
        <span className="text-green-400 font-bold">{buyPct.toFixed(1)}% Buy</span>
        <span className="text-red-400 font-bold">{sellPct.toFixed(1)}% Sell</span>
        {total === 0 && <span className="text-faint">(no order-flow data yet)</span>}
      </div>
    </div>
  );
}

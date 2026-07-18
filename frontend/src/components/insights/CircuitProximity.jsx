import React, { useMemo } from "react";

const PROXIMITY_THRESHOLD_PCT = 2; // within this % of a circuit limit

// Stocks trading close to their upper/lower circuit breaker — a high-signal
// event in Indian markets. Needs upper_ckt/lower_ckt captured from ticks
// (backend/app/fyers_service.py); NOTE these are frequently 0/absent on some
// tick types, so this widget may show "no data" more often than the other
// Insights widgets depending on what FYERS actually sends for a given symbol.
export default function CircuitProximity({ stocks }) {
  const near = useMemo(() => {
    const rows = [];
    for (const s of stocks || []) {
      if (s.upper_ckt > 0 && s.ltp > 0) {
        const distPct = ((s.upper_ckt - s.ltp) / s.upper_ckt) * 100;
        if (distPct >= 0 && distPct <= PROXIMITY_THRESHOLD_PCT) {
          rows.push({ ...s, side: "upper", distPct });
        }
      }
      if (s.lower_ckt > 0 && s.ltp > 0) {
        const distPct = ((s.ltp - s.lower_ckt) / s.lower_ckt) * 100;
        if (distPct >= 0 && distPct <= PROXIMITY_THRESHOLD_PCT) {
          rows.push({ ...s, side: "lower", distPct });
        }
      }
    }
    return rows.sort((a, b) => a.distPct - b.distPct);
  }, [stocks]);

  const anyCircuitDataAtAll = (stocks || []).some(
    (s) => s.upper_ckt > 0 || s.lower_ckt > 0,
  );

  return (
    <div className="bg-surface2/80 backdrop-blur-xl border border-subtle rounded-lg p-4 h-full shadow-glow-sm">
      <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
        Circuit Proximity{" "}
        <span className="text-faint">(within {PROXIMITY_THRESHOLD_PCT}%)</span>
      </h3>
      <div className="space-y-1.5">
        {near.map((s) => (
          <div
            key={`${s.symbol}-${s.side}`}
            className="flex items-center justify-between text-xs py-1"
          >
            <div>
              <span className="font-bold text-primary">{s.symbol}</span>
              <span className="text-faint ml-2">{s.sector}</span>
            </div>
            <span
              className={`font-mono font-bold ${s.side === "upper" ? "text-green-400" : "text-red-400"}`}
            >
              {s.side === "upper" ? "▲ upper" : "▼ lower"} ·{" "}
              {s.distPct.toFixed(2)}%
            </span>
          </div>
        ))}
        {near.length === 0 && (
          <p className="text-xs text-faint">
            {anyCircuitDataAtAll
              ? "No stocks near a circuit limit right now."
              : "No circuit-limit data received yet from the feed."}
          </p>
        )}
      </div>
    </div>
  );
}

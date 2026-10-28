import React, { useMemo, useState } from "react";
import { ShieldAlert, ArrowUp, ArrowDown, Zap, Gauge } from "lucide-react";
import Card from "../ui/Card.jsx";

const PROXIMITY_THRESHOLD_PCT = 3.5; // Within 3.5% of limit or operating band

export default function CircuitProximity({ stocks }) {
  const [mode, setMode] = useState("bands"); // "bands" (circuit/operating band) | "extremes" (day high/low)

  const items = useMemo(() => {
    const rows = [];
    for (const s of stocks || []) {
      if (!s.ltp || s.ltp <= 0) continue;

      if (mode === "bands") {
        // Use explicit circuit limits if sent by broker; otherwise derive official NSE 10% operating band
        const upper =
          s.upper_ckt > 0
            ? s.upper_ckt
            : s.prev_close > 0
              ? s.prev_close * 1.1
              : 0;
        const lower =
          s.lower_ckt > 0
            ? s.lower_ckt
            : s.prev_close > 0
              ? s.prev_close * 0.9
              : 0;

        if (upper > 0 && s.ltp <= upper) {
          const distPct = ((upper - s.ltp) / upper) * 100;
          if (distPct >= 0 && distPct <= PROXIMITY_THRESHOLD_PCT) {
            rows.push({
              ...s,
              side: "upper",
              targetLabel: "Upper Band",
              targetPrice: upper,
              distPct,
            });
          }
        }
        if (lower > 0 && s.ltp >= lower) {
          const distPct = ((s.ltp - lower) / s.ltp) * 100;
          if (distPct >= 0 && distPct <= PROXIMITY_THRESHOLD_PCT) {
            rows.push({
              ...s,
              side: "lower",
              targetLabel: "Lower Band",
              targetPrice: lower,
              distPct,
            });
          }
        }
      } else {
        // Day High / Day Low breakout proximity
        const dayHigh = s.today_high || s.high || 0;
        const dayLow = s.today_low || s.low || 0;

        if (dayHigh > 0 && s.ltp <= dayHigh) {
          const distPct = ((dayHigh - s.ltp) / dayHigh) * 100;
          if (distPct >= 0 && distPct <= 1.5) {
            rows.push({
              ...s,
              side: "upper",
              targetLabel: "Day High",
              targetPrice: dayHigh,
              distPct,
            });
          }
        }
        if (dayLow > 0 && s.ltp >= dayLow) {
          const distPct = ((s.ltp - dayLow) / s.ltp) * 100;
          if (distPct >= 0 && distPct <= 1.5) {
            rows.push({
              ...s,
              side: "lower",
              targetLabel: "Day Low",
              targetPrice: dayLow,
              distPct,
            });
          }
        }
      }
    }
    return rows.sort((a, b) => a.distPct - b.distPct).slice(0, 8);
  }, [stocks, mode]);

  return (
    <Card
      title="Circuit & Extreme Proximity"
      subtitle={
        mode === "bands"
          ? `Within ${PROXIMITY_THRESHOLD_PCT}% of 10% operating band`
          : "Within 1.5% of Day High / Low"
      }
      icon={ShieldAlert}
      className="h-full"
      headerRight={
        <div className="flex items-center gap-1 bg-surface3/80 p-0.5 rounded-lg border border-subtle">
          <button
            onClick={() => setMode("bands")}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
              mode === "bands"
                ? "bg-accent-blue text-white shadow-sm"
                : "text-muted hover:text-primary"
            }`}
          >
            Bands
          </button>
          <button
            onClick={() => setMode("extremes")}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
              mode === "extremes"
                ? "bg-accent-blue text-white shadow-sm"
                : "text-muted hover:text-primary"
            }`}
          >
            H / L
          </button>
        </div>
      }
    >
      <div className="space-y-2.5">
        {items.map((s) => {
          const isUpper = s.side === "upper";
          const closeness = Math.max(0, Math.min(100, 100 - (s.distPct / (mode === "bands" ? PROXIMITY_THRESHOLD_PCT : 1.5)) * 100));

          return (
            <div
              key={`${s.symbol}-${s.side}`}
              className="p-2 rounded-lg bg-surface3/30 border border-subtle/60 hover:border-subtle transition-all space-y-1.5"
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-primary">{s.symbol}</span>
                  <span className="text-[10px] text-faint">
                    {s.sector || "NIFTY"}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono tabular-nums text-xs">
                  <span className="text-muted">
                    ₹{Number(s.ltp).toFixed(1)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold text-[10px] ${
                      isUpper
                        ? "bg-bull/15 text-bull border border-bull/30"
                        : "bg-bear/15 text-bear border border-bear/30"
                    }`}
                  >
                    {isUpper ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                    {s.distPct.toFixed(2)}% to {s.targetLabel}
                  </span>
                </div>
              </div>

              {/* Proximity visual meter */}
              <div className="w-full bg-surface2 h-1.5 rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${closeness}%` }}
                  className={`h-full rounded-full transition-all duration-300 ${
                    isUpper
                      ? "bg-gradient-to-r from-emerald-500/60 to-emerald-400"
                      : "bg-gradient-to-r from-rose-500/60 to-rose-400"
                  }`}
                  title={`${closeness.toFixed(0)}% proximity`}
                />
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="py-8 text-center text-xs text-faint flex flex-col items-center gap-1">
            <Gauge size={20} className="text-faint/60 mb-1" />
            <span>
              {mode === "bands"
                ? "No stocks within 3.5% of circuit operating limits."
                : "No stocks currently testing day extremes (within 1.5%)."}
            </span>
            <span className="text-[10px]">Markets trading in mid-range.</span>
          </div>
        )}
      </div>
    </Card>
  );
}

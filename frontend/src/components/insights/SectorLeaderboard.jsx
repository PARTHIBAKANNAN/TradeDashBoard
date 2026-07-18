import React, { useMemo } from "react";
import { sectorAggregates } from "../../utils/sectorAggregates.js";

// Horizontal bar chart ranking each NIFTY group by SIMPLE mean %change
// (deliberately not traded-value-weighted — see sectorAggregates.js).
export default function SectorLeaderboard({ stocks }) {
  const ranked = useMemo(() => {
    return sectorAggregates(stocks).sort((a, b) => b.mean - a.mean);
  }, [stocks]);

  const maxAbs = Math.max(1, ...ranked.map((r) => Math.abs(r.mean)));

  return (
    <div className="bg-surface2/80 backdrop-blur-xl border border-subtle rounded-lg p-4 h-full shadow-glow-sm">
      <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
        Sector Performance
      </h3>
      <div className="space-y-1.5">
        {ranked.map((r) => {
          const isUp = r.mean >= 0;
          const widthPct = (Math.abs(r.mean) / maxAbs) * 100;
          return (
            <div key={r.group} className="flex items-center gap-2 text-xs">
              <span className="w-32 truncate text-muted font-medium">
                {r.group}
              </span>
              <div className="flex-1 h-4 bg-surface3 rounded-sm relative overflow-hidden">
                <div
                  className={`h-full ${isUp ? "bg-green-500/70" : "bg-red-500/70"}`}
                  style={{
                    width: `${widthPct}%`,
                    marginLeft: isUp ? "0" : "auto",
                  }}
                />
              </div>
              <span
                className={`w-14 text-right font-mono font-bold ${
                  isUp ? "text-green-400" : "text-red-400"
                }`}
              >
                {isUp ? "+" : ""}
                {r.mean}%
              </span>
            </div>
          );
        })}
        {ranked.length === 0 && (
          <p className="text-xs text-faint">No data yet.</p>
        )}
      </div>
    </div>
  );
}

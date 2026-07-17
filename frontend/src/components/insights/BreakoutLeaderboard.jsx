import React, { useMemo } from "react";

// All stocks currently showing a live 30-min ORB breakout signal.
// "None" is the backend's literal string sentinel (state.py), not JS null.
export default function BreakoutLeaderboard({ stocks }) {
  const signals = useMemo(() => {
    return (stocks || [])
      .filter((s) => s.signal && s.signal !== "None")
      .sort((a, b) => (b.signal_time || "").localeCompare(a.signal_time || ""));
  }, [stocks]);

  return (
    <div className="bg-surface2/80 backdrop-blur-xl border border-subtle rounded-lg p-4 h-full shadow-glow-sm">
      <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
        Breakout Signals <span className="text-faint">({signals.length})</span>
      </h3>
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {signals.map((s) => {
          const isBull = s.signal.includes("Bull");
          return (
            <div
              key={s.symbol}
              className="flex items-center justify-between text-xs py-1 border-b border-subtle last:border-0"
            >
              <div>
                <span className="font-bold text-primary">{s.symbol}</span>
                <span className="text-faint ml-2">{s.sector}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`font-bold uppercase ${isBull ? "text-green-400" : "text-red-400"}`}
                >
                  {isBull ? "▲" : "▼"} {s.signal}
                </span>
                <span className="text-faint font-mono">{s.signal_time}</span>
              </div>
            </div>
          );
        })}
        {signals.length === 0 && (
          <p className="text-xs text-faint">No active breakout signals right now.</p>
        )}
      </div>
    </div>
  );
}

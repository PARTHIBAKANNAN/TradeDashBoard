import React, { useMemo } from "react";
import { Zap, ArrowUp, ArrowDown } from "lucide-react";
import Card from "../ui/Card.jsx";

// All stocks currently showing a live 30-min ORB breakout signal.
// "None" is the backend's literal string sentinel (state.py), not JS null.
export default function BreakoutLeaderboard({ stocks }) {
  const signals = useMemo(() => {
    return (stocks || [])
      .filter((s) => s.signal && s.signal !== "None")
      .sort((a, b) => (b.signal_time || "").localeCompare(a.signal_time || ""));
  }, [stocks]);

  return (
    <Card
      title="Breakout Signals"
      subtitle={`${signals.length} active`}
      icon={Zap}
      className="h-full"
    >
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {signals.map((s) => {
          const isBull = s.signal.includes("Bull");
          return (
            <div
              key={s.symbol}
              className="flex items-center justify-between text-xs py-1.5 border-b border-subtle last:border-0"
            >
              <div>
                <span className="font-bold text-primary">{s.symbol}</span>
                <span className="text-faint ml-2">{s.sector}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`flex items-center gap-1 font-bold uppercase ${
                    isBull ? "text-bull" : "text-bear"
                  }`}
                >
                  {isBull ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                  {s.signal}
                </span>
                <span className="text-faint font-mono">{s.signal_time}</span>
              </div>
            </div>
          );
        })}
        {signals.length === 0 && (
          <p className="text-xs text-faint">
            No active breakout signals right now.
          </p>
        )}
      </div>
    </Card>
  );
}

import React, { useMemo } from "react";

const TOP_N = 8;

function MiniList({ title, rows, valueFmt, valueClass }) {
  return (
    <div className="bg-surface2/80 backdrop-blur-xl border border-subtle rounded-lg p-4 shadow-glow-sm">
      <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-1">
        {rows.map((s, i) => (
          <div key={s.symbol} className="flex items-center justify-between text-xs py-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-faint font-mono w-4">{i + 1}</span>
              <span className="font-bold text-primary truncate">{s.symbol}</span>
            </div>
            <span className={`font-mono font-bold whitespace-nowrap ${valueClass(s)}`}>
              {valueFmt(s)}
            </span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-faint">No data yet.</p>}
      </div>
    </div>
  );
}

// Four ranked-list panels sharing one layout: Gainers, Losers, Most Active, RS.
export default function RankedMovers({ stocks }) {
  const { gainers, losers, mostActive, rsLeaders } = useMemo(() => {
    const list = stocks || [];
    return {
      gainers: [...list].sort((a, b) => b.pct_change - a.pct_change).slice(0, TOP_N),
      losers: [...list].sort((a, b) => a.pct_change - b.pct_change).slice(0, TOP_N),
      mostActive: [...list].sort((a, b) => (b.traded_value || 0) - (a.traded_value || 0)).slice(0, TOP_N),
      rsLeaders: [...list].sort((a, b) => b.relative_strength - a.relative_strength).slice(0, TOP_N),
    };
  }, [stocks]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <MiniList
        title="Top Gainers"
        rows={gainers}
        valueFmt={(s) => `+${s.pct_change}%`}
        valueClass={() => "text-green-400"}
      />
      <MiniList
        title="Top Losers"
        rows={losers}
        valueFmt={(s) => `${s.pct_change}%`}
        valueClass={() => "text-red-400"}
      />
      <MiniList
        title="Most Active (Value)"
        rows={mostActive}
        valueFmt={(s) => formatValue(s.traded_value)}
        valueClass={() => "text-accent-blue"}
      />
      <MiniList
        title="RS vs Nifty"
        rows={rsLeaders}
        valueFmt={(s) => `${s.relative_strength >= 0 ? "+" : ""}${s.relative_strength}`}
        valueClass={(s) => (s.relative_strength >= 0 ? "text-green-400" : "text-red-400")}
      />
    </div>
  );
}

function formatValue(v) {
  if (!v) return "—";
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

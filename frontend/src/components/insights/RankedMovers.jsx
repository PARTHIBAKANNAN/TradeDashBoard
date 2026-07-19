import React, { useMemo } from "react";
import { TrendingUp, TrendingDown, BarChart2, Gauge } from "lucide-react";
import MiniList from "./MiniList.jsx";

const TOP_N = 8;

// Four ranked-list panels sharing one layout: Gainers, Losers, Most Active, RS.
export default function RankedMovers({ stocks }) {
  const { gainers, losers, mostActive, rsLeaders } = useMemo(() => {
    const list = stocks || [];
    return {
      gainers: [...list]
        .sort((a, b) => b.pct_change - a.pct_change)
        .slice(0, TOP_N),
      losers: [...list]
        .sort((a, b) => a.pct_change - b.pct_change)
        .slice(0, TOP_N),
      mostActive: [...list]
        .sort((a, b) => (b.traded_value || 0) - (a.traded_value || 0))
        .slice(0, TOP_N),
      rsLeaders: [...list]
        .sort((a, b) => b.relative_strength - a.relative_strength)
        .slice(0, TOP_N),
    };
  }, [stocks]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <MiniList
        title="Top Gainers"
        icon={TrendingUp}
        rows={gainers}
        showRank
        renderValue={(s) => <span className="text-bull">+{s.pct_change}%</span>}
      />
      <MiniList
        title="Top Losers"
        icon={TrendingDown}
        rows={losers}
        showRank
        renderValue={(s) => <span className="text-bear">{s.pct_change}%</span>}
      />
      <MiniList
        title="Most Active (Value)"
        icon={BarChart2}
        rows={mostActive}
        showRank
        renderValue={(s) => (
          <span className="text-accent-blue">
            {formatValue(s.traded_value)}
          </span>
        )}
      />
      <MiniList
        title="RS vs Nifty"
        icon={Gauge}
        rows={rsLeaders}
        showRank
        renderValue={(s) => (
          <span
            className={s.relative_strength >= 0 ? "text-bull" : "text-bear"}
          >
            {s.relative_strength >= 0 ? "+" : ""}
            {s.relative_strength}
          </span>
        )}
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

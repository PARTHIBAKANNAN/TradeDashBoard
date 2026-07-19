import React, { useMemo } from "react";
import { Activity } from "lucide-react";
import SplitBar from "../ui/SplitBar.jsx";

// Slim single-row banner: how many stocks are up / down / unchanged today.
export default function MarketBreadth({ stocks }) {
  const { up, down, flat, total } = useMemo(() => {
    let up = 0,
      down = 0,
      flat = 0;
    for (const s of stocks || []) {
      const pct = s.pct_change || 0;
      if (pct > 0) up++;
      else if (pct < 0) down++;
      else flat++;
    }
    return { up, down, flat, total: (stocks || []).length };
  }, [stocks]);

  const upPct = total ? (up / total) * 100 : 0;
  const downPct = total ? (down / total) * 100 : 0;
  const flatPct = total ? (flat / total) * 100 : 0;

  return (
    <div className="rounded-xl border border-subtle bg-surface2/70 backdrop-blur-xl shadow-card px-5 py-3.5 flex items-center gap-5">
      <span className="flex items-center gap-1.5 text-xs font-bold text-muted uppercase tracking-wider whitespace-nowrap">
        <Activity size={13} className="text-accent-blue" />
        Market Breadth
      </span>
      <SplitBar
        segments={[
          { pct: upPct, className: "bg-bull" },
          { pct: flatPct, className: "bg-faint" },
          { pct: downPct, className: "bg-bear" },
        ]}
      />
      <div className="flex items-center gap-4 text-xs font-mono whitespace-nowrap tabular-nums">
        <span className="text-bull font-bold">{up} Up</span>
        <span className="text-faint font-bold">{flat} Flat</span>
        <span className="text-bear font-bold">{down} Down</span>
        <span className="text-faint">({total} total)</span>
      </div>
    </div>
  );
}

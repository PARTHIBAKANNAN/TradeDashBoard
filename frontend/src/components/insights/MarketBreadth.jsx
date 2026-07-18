import React, { useMemo } from "react";

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
    <div className="bg-surface2/80 backdrop-blur-xl border border-subtle rounded-lg px-5 py-3 flex items-center gap-5 shadow-glow-sm">
      <span className="text-xs font-bold text-muted uppercase tracking-wider whitespace-nowrap">
        Market Breadth
      </span>
      <div className="flex-1 h-2.5 rounded-full overflow-hidden flex bg-surface3">
        {upPct > 0 && (
          <div style={{ width: `${upPct}%` }} className="bg-green-500" />
        )}
        {flatPct > 0 && (
          <div style={{ width: `${flatPct}%` }} className="bg-faint" />
        )}
        {downPct > 0 && (
          <div style={{ width: `${downPct}%` }} className="bg-red-500" />
        )}
      </div>
      <div className="flex items-center gap-4 text-xs font-mono whitespace-nowrap">
        <span className="text-green-400 font-bold">{up} Up</span>
        <span className="text-faint font-bold">{flat} Flat</span>
        <span className="text-red-400 font-bold">{down} Down</span>
        <span className="text-faint">({total} total)</span>
      </div>
    </div>
  );
}

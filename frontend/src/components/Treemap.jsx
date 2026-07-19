import React, { useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { motion, AnimatePresence } from "framer-motion";
import { niftyGroup } from "../utils/sectorGroups.js";
import { sectorAggregates } from "../utils/sectorAggregates.js";

// Color a tile by %change: green rising / red falling, intensity scales with
// magnitude (capped at +/-5% so a couple of extreme movers don't wash out
// the rest of the map). Tuned against the app's bull/bear tokens rather than
// raw Tailwind greens/reds for visual consistency with the rest of the UI.
function colorFor(pctChange) {
  const capped = Math.max(-5, Math.min(5, pctChange || 0));
  const intensity = Math.abs(capped) / 5; // 0..1
  if (capped >= 0) {
    const l = 16 + intensity * 26;
    return `hsl(158, 64%, ${l}%)`;
  }
  const l = 18 + intensity * 24;
  return `hsl(350, 74%, ${l}%)`;
}

// Level 1: one node per NIFTY sector group, sized by total traded value,
// colored by that group's traded-value-weighted average %change.
function buildSectorLevelHierarchy(stocks) {
  const groups = sectorAggregates(stocks);
  return {
    name: "root",
    children: groups.map((g) => ({
      name: g.group,
      value: Math.max(g.totalTradedValue, 1),
      pct_change: g.weightedMean,
      count: g.count,
    })),
  };
}

// Level 2: one node per stock within a single chosen sector group.
function buildStockLevelHierarchy(stocks, sector) {
  const members = stocks.filter((s) => niftyGroup(s.sector) === sector);
  return {
    name: sector,
    children: members.map((s) => ({
      name: s.symbol,
      value: Math.max(s.traded_value || 0, 1),
      pct_change: s.pct_change,
      ltp: s.ltp,
    })),
  };
}

const Treemap = React.memo(({ stocks, drilldownSector, onSelectSector }) => {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 640 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setSize((prev) => (prev.width === width ? prev : { ...prev, width }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!size.width || !stocks?.length) return null;
    const data = drilldownSector
      ? buildStockLevelHierarchy(stocks, drilldownSector)
      : buildSectorLevelHierarchy(stocks);
    const root = hierarchy(data).sum((d) => d.value);
    treemap()
      .tile(treemapSquarify)
      .size([size.width, size.height])
      .paddingOuter(4)
      .paddingInner(3)
      .round(true)(root);
    return root;
  }, [stocks, size.width, size.height, drilldownSector]);

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: size.height }}
    >
      <AnimatePresence mode="popLayout">
        {layout &&
          layout.leaves().map((node) => {
            const w = node.x1 - node.x0;
            const h = node.y1 - node.y0;
            if (w <= 0 || h <= 0) return null;
            const pct = node.data.pct_change ?? 0;
            const showText = w > 44 && h > 28;
            const showCount = w > 70 && h > 44;
            const clickable = !drilldownSector;

            return (
              <motion.div
                key={node.data.name}
                layout
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                whileHover={
                  clickable ? { scale: 1.015, zIndex: 10 } : { zIndex: 10 }
                }
                title={
                  drilldownSector
                    ? `${node.data.name}  ${pct >= 0 ? "+" : ""}${pct}%  LTP ${node.data.ltp}`
                    : `${node.data.name}  ${node.data.count} stocks  avg ${pct >= 0 ? "+" : ""}${pct}%`
                }
                onClick={
                  clickable ? () => onSelectSector(node.data.name) : undefined
                }
                className={`absolute flex flex-col items-center justify-center text-white overflow-hidden rounded-md border border-black/25 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] ${
                  clickable ? "cursor-pointer" : ""
                }`}
                style={{
                  left: node.x0,
                  top: node.y0,
                  width: w,
                  height: h,
                  backgroundColor: colorFor(pct),
                }}
              >
                {showText && (
                  <>
                    <span className="text-[11px] font-bold truncate px-1.5 font-display">
                      {node.data.name}
                    </span>
                    <span className="text-[10px] font-mono font-semibold opacity-90">
                      {pct >= 0 ? "+" : ""}
                      {pct}%
                    </span>
                    {!drilldownSector && showCount && (
                      <span className="text-[9px] font-mono opacity-70 mt-0.5">
                        {node.data.count} stocks
                      </span>
                    )}
                  </>
                )}
              </motion.div>
            );
          })}
      </AnimatePresence>
      {!stocks?.length && (
        <div className="absolute inset-0 grid place-items-center text-faint text-sm">
          No data yet.
        </div>
      )}
    </div>
  );
});

export default Treemap;

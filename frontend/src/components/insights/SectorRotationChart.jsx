import React, { useMemo, useRef, useState, useEffect } from "react";
import { Compass } from "lucide-react";
import { groupBySector } from "../../utils/sectorAggregates.js";
import Card from "../ui/Card.jsx";

const PADDING = 40;

// x = today's %change, y = RS vs Nifty, one dot per sector (mean of members).
// Hand-rolled linear-scale scatter — same absolute-positioning technique
// already used by Treemap.jsx/OverlappingRangeBar.jsx, no new dependency.
export default function SectorRotationChart({ stocks }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 380 });

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

  const points = useMemo(() => {
    const groups = groupBySector(stocks);
    return Array.from(groups.entries()).map(([group, members]) => {
      const n = members.length || 1;
      const meanPct = members.reduce((a, s) => a + (s.pct_change || 0), 0) / n;
      const meanRs =
        members.reduce((a, s) => a + (s.relative_strength || 0), 0) / n;
      return { group, x: meanPct, y: meanRs, count: members.length };
    });
  }, [stocks]);

  const { xDomain, yDomain } = useMemo(() => {
    const xs = points.map((p) => p.x).concat(0);
    const ys = points.map((p) => p.y).concat(0);
    const pad = (arr) => {
      const max = Math.max(1, ...arr.map(Math.abs));
      return [-max * 1.15, max * 1.15];
    };
    return { xDomain: pad(xs), yDomain: pad(ys) };
  }, [points]);

  const w = Math.max(0, size.width - PADDING * 2);
  const h = size.height - PADDING * 2;
  const scaleX = (v) =>
    PADDING + ((v - xDomain[0]) / (xDomain[1] - xDomain[0])) * w;
  const scaleY = (v) =>
    PADDING + h - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * h;
  const zeroX = scaleX(0);
  const zeroY = scaleY(0);

  return (
    <Card
      title="Sector Rotation"
      subtitle="x = today's %change · y = RS vs Nifty · one dot per sector"
      icon={Compass}
    >
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height: size.height }}
      >
        {size.width > 0 && (
          <>
            {/* Quadrant tints */}
            <div
              className="absolute bg-bull/5"
              style={{
                left: zeroX,
                top: PADDING,
                width: w - (zeroX - PADDING),
                height: zeroY - PADDING,
              }}
              title="Leading: rising today + outperforming"
            />
            <div
              className="absolute bg-bear/5"
              style={{
                left: PADDING,
                top: zeroY,
                width: zeroX - PADDING,
                height: PADDING + h - zeroY,
              }}
              title="Lagging: falling today + underperforming"
            />
            {/* Axes */}
            <div
              className="absolute border-t border-subtle"
              style={{ left: PADDING, top: zeroY, width: w }}
            />
            <div
              className="absolute border-l border-subtle"
              style={{ left: zeroX, top: PADDING, height: h }}
            />
            {/* Quadrant labels */}
            <span
              className="absolute text-[9px] text-faint"
              style={{ left: PADDING + 4, top: PADDING + 2 }}
            >
              Improving
            </span>
            <span
              className="absolute text-[9px] text-faint"
              style={{ right: 4, top: PADDING + 2 }}
            >
              Leading
            </span>
            <span
              className="absolute text-[9px] text-faint"
              style={{ left: PADDING + 4, bottom: 4 }}
            >
              Lagging
            </span>
            <span
              className="absolute text-[9px] text-faint"
              style={{ right: 4, bottom: 4 }}
            >
              Weakening
            </span>
            {/* Dots */}
            {points.map((p) => (
              <div
                key={p.group}
                title={`${p.group}: ${p.x >= 0 ? "+" : ""}${p.x.toFixed(2)}% change, RS ${p.y.toFixed(2)} (${p.count} stocks)`}
                className={`absolute rounded-full -translate-x-1/2 -translate-y-1/2 flex items-center justify-center ring-2 ${
                  p.x >= 0 ? "bg-bull ring-bull/25" : "bg-bear ring-bear/25"
                }`}
                style={{
                  left: scaleX(p.x),
                  top: scaleY(p.y),
                  width: 10 + Math.min(10, p.count / 2),
                  height: 10 + Math.min(10, p.count / 2),
                }}
              >
                <span
                  className="absolute text-[9px] text-primary whitespace-nowrap font-semibold"
                  style={{ top: -14 }}
                >
                  {p.group.replace("NIFTY ", "")}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </Card>
  );
}

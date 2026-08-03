import React, { useEffect, useMemo, useRef, useState } from "react";
import { LineChart as LineChartIcon } from "lucide-react";
import Card from "../ui/Card.jsx";

const PADDING = 32;

// Cumulative realized P&L over closed trades — hand-rolled SVG line, same
// scaffolding as SectorRotationChart.jsx (ResizeObserver + manual scaleX/Y).
// Unrealized P&L from open positions is shown as a live stat tile elsewhere,
// not plotted here — there's no fixed historical point to plot it at.
export default function EquityCurveChart({ closedOrders }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 220 });

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
    const closed = (closedOrders || [])
      .filter(
        (o) => o.status === "CLOSED" && o.realized_pnl != null && o.closed_at,
      )
      .sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at));
    let running = 0;
    return closed.map((o, i) => {
      running += Number(o.realized_pnl);
      return { i, cum: running, order: o };
    });
  }, [closedOrders]);

  const w = Math.max(0, size.width - PADDING * 2);
  const h = size.height - PADDING * 2;

  const yDomain = useMemo(() => {
    const ys = points.map((p) => p.cum).concat(0);
    const max = Math.max(1, ...ys.map(Math.abs));
    return [-max * 1.15, max * 1.15];
  }, [points]);

  const scaleX = (i) =>
    points.length <= 1
      ? PADDING + w / 2
      : PADDING + (i / (points.length - 1)) * w;
  const scaleY = (v) =>
    PADDING + h - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * h;
  const zeroY = scaleY(0);

  const path = points.map((p) => `${scaleX(p.i)},${scaleY(p.cum)}`).join(" ");
  const last = points[points.length - 1];
  const isUp = last ? last.cum >= 0 : true;

  return (
    <Card
      title="Equity Curve"
      subtitle="Cumulative realized P&L, closed trades only"
      icon={LineChartIcon}
    >
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height: size.height }}
      >
        {size.width > 0 && (
          <svg
            width={size.width}
            height={size.height}
            className="absolute inset-0"
          >
            <line
              x1={PADDING}
              x2={PADDING + w}
              y1={zeroY}
              y2={zeroY}
              stroke="currentColor"
              className="text-subtle"
              strokeWidth={1}
            />
            {points.length > 1 && (
              <polyline
                points={path}
                fill="none"
                strokeWidth={2}
                className={isUp ? "text-bull" : "text-bear"}
                stroke="currentColor"
              />
            )}
            {points.map((p) => (
              <circle
                key={p.order.id}
                cx={scaleX(p.i)}
                cy={scaleY(p.cum)}
                r={3}
                className={p.cum >= 0 ? "text-bull" : "text-bear"}
                fill="currentColor"
              >
                <title>
                  {p.order.symbol} {p.order.side} · realized{" "}
                  {p.order.realized_pnl} · cumulative {p.cum.toFixed(2)}
                </title>
              </circle>
            ))}
          </svg>
        )}
        {points.length === 0 && (
          <div className="absolute inset-0 grid place-items-center text-faint text-sm">
            No closed trades yet
          </div>
        )}
      </div>
    </Card>
  );
}

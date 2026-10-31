import React, { useEffect, useMemo, useRef, useState } from "react";
import { LineChart as LineChartIcon, TrendingUp, TrendingDown, Target, Shield, Clock } from "lucide-react";
import Card from "../ui/Card.jsx";

const PADDING_TOP = 28;
const PADDING_BOTTOM = 36;
const PADDING_LEFT = 52;
const PADDING_RIGHT = 32;

function formatCurrency(val) {
  if (val == null || isNaN(val)) return "₹0.00";
  const num = Number(val);
  const sign = num > 0 ? "+" : num < 0 ? "-" : "";
  return `${sign}₹${Math.abs(num).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(isoString) {
  if (!isoString) return "N/A";
  try {
    const d = new Date(isoString);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

// Convert points to smooth Catmull-Rom spline cubic bezier path
function getSmoothPath(pts) {
  if (!pts || pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export default function EquityCurveChart({ closedOrders }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 260 });
  const [hoveredIdx, setHoveredIdx] = useState(null);

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
    let peak = 0;
    return closed.map((o, i) => {
      const pnl = Number(o.realized_pnl);
      running += pnl;
      if (running > peak) peak = running;
      const dd = peak - running;
      return {
        i,
        cum: running,
        pnl,
        peak,
        drawdown: dd,
        order: o,
      };
    });
  }, [closedOrders]);

  const w = Math.max(0, size.width - PADDING_LEFT - PADDING_RIGHT);
  const h = Math.max(0, size.height - PADDING_TOP - PADDING_BOTTOM);

  const yDomain = useMemo(() => {
    const ys = points.map((p) => p.cum).concat(0);
    const max = Math.max(100, ...ys.map(Math.abs));
    const pad = max * 0.15;
    return [-max - pad, max + pad];
  }, [points]);

  const scaleX = (i) =>
    points.length <= 1
      ? PADDING_LEFT + w / 2
      : PADDING_LEFT + (i / (points.length - 1)) * w;

  const scaleY = (v) =>
    PADDING_TOP + h - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * h;

  const zeroY = scaleY(0);

  const coords = useMemo(() => {
    return points.map((p) => ({
      ...p,
      x: scaleX(p.i),
      y: scaleY(p.cum),
    }));
  }, [points, w, h, yDomain]);

  const smoothCurve = useMemo(() => getSmoothPath(coords), [coords]);

  const areaCurve = useMemo(() => {
    if (coords.length < 2) return "";
    const firstX = coords[0].x;
    const lastX = coords[coords.length - 1].x;
    return `${smoothCurve} L ${lastX.toFixed(2)} ${zeroY.toFixed(2)} L ${firstX.toFixed(2)} ${zeroY.toFixed(2)} Z`;
  }, [smoothCurve, coords, zeroY]);

  const currentCum = points.length > 0 ? points[points.length - 1].cum : 0;
  const isPositive = currentCum >= 0;
  const maxEquity = points.length > 0 ? Math.max(...points.map((p) => p.cum)) : 0;
  const minEquity = points.length > 0 ? Math.min(...points.map((p) => p.cum)) : 0;

  const handleMouseMove = (e) => {
    if (!coords || coords.length === 0) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;

    let closestIdx = 0;
    let minDist = Infinity;
    coords.forEach((pt, idx) => {
      const dist = Math.abs(pt.x - mouseX);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });
    setHoveredIdx(closestIdx);
  };

  const handleTouch = (e) => {
    if (!coords || coords.length === 0) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !e.touches || !e.touches[0]) return;
    const touchX = e.touches[0].clientX - rect.left;

    let closestIdx = 0;
    let minDist = Infinity;
    coords.forEach((pt, idx) => {
      const dist = Math.abs(pt.x - touchX);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });
    setHoveredIdx(closestIdx);
  };

  const handleMouseLeave = () => {
    setHoveredIdx(null);
  };

  const activePoint = hoveredIdx != null ? coords[hoveredIdx] : coords[coords.length - 1];

  return (
    <Card
      title={
        <div className="flex items-center justify-between w-full flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-primary font-bold">Portfolio Equity Trajectory</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface3 text-muted border border-white/5">
              {points.length} closed {points.length === 1 ? "trade" : "trades"}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-faint text-[11px]">Peak:</span>
              <span className="text-emerald-400 font-semibold">{formatCurrency(maxEquity)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-faint text-[11px]">Trough:</span>
              <span className="text-rose-400 font-semibold">{formatCurrency(minEquity)}</span>
            </div>
            <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
              <span className="text-faint text-[11px]">Net P&amp;L:</span>
              <span className={`font-bold ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                {formatCurrency(currentCum)}
              </span>
            </div>
          </div>
        </div>
      }
      subtitle="Cumulative realized P&L with Catmull-Rom spline smoothing and interactive trade inspection (Hover or Touch to inspect)"
      icon={LineChartIcon}
    >
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={() => setHoveredIdx(null)}
        className="relative w-full cursor-crosshair select-none"
        style={{ height: size.height }}
      >
        {size.width > 0 && (
          <svg
            width={size.width}
            height={size.height}
            className="absolute inset-0 pointer-events-none"
          >
            <defs>
              <linearGradient id="equity-grad-bull" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
                <stop offset="60%" stopColor="#10b981" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="equity-grad-bear" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.28" />
                <stop offset="60%" stopColor="#f43f5e" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
              </linearGradient>
              <filter id="glow-bull" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-bear" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Gridlines */}
            {[0.25, 0.5, 0.75].map((fraction) => {
              const yVal = yDomain[0] + (yDomain[1] - yDomain[0]) * fraction;
              const yPos = scaleY(yVal);
              return (
                <line
                  key={fraction}
                  x1={PADDING_LEFT}
                  x2={PADDING_LEFT + w}
                  y1={yPos}
                  y2={yPos}
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeDasharray="3 3"
                />
              );
            })}

            {/* Zero Baseline */}
            <line
              x1={PADDING_LEFT}
              x2={PADDING_LEFT + w}
              y1={zeroY}
              y2={zeroY}
              stroke="rgba(255, 255, 255, 0.22)"
              strokeWidth={1}
            />
            <text
              x={PADDING_LEFT - 8}
              y={zeroY + 3.5}
              textAnchor="end"
              fill="rgba(255, 255, 255, 0.4)"
              fontSize="9"
              fontFamily="monospace"
            >
              ₹0
            </text>

            {/* Top Y value */}
            <text
              x={PADDING_LEFT - 8}
              y={PADDING_TOP + 4}
              textAnchor="end"
              fill="rgba(255, 255, 255, 0.3)"
              fontSize="9"
              fontFamily="monospace"
            >
              {formatCurrency(yDomain[1]).replace("+", "")}
            </text>

            {/* Bottom Y value */}
            <text
              x={PADDING_LEFT - 8}
              y={PADDING_TOP + h + 2}
              textAnchor="end"
              fill="rgba(255, 255, 255, 0.3)"
              fontSize="9"
              fontFamily="monospace"
            >
              {formatCurrency(yDomain[0])}
            </text>

            {/* Area fill */}
            {coords.length > 1 && (
              <path
                d={areaCurve}
                fill={isPositive ? "url(#equity-grad-bull)" : "url(#equity-grad-bear)"}
                transition="all 0.3s ease"
              />
            )}

            {/* Smooth Catmull-Rom curve path */}
            {coords.length > 1 && (
              <path
                d={smoothCurve}
                fill="none"
                stroke={isPositive ? "#10b981" : "#f43f5e"}
                strokeWidth={2.4}
                filter={isPositive ? "url(#glow-bull)" : "url(#glow-bear)"}
              />
            )}

            {/* Subtle trade nodes */}
            {coords.map((pt) => {
              const isPtPos = pt.pnl >= 0;
              return (
                <circle
                  key={pt.order.id}
                  cx={pt.x}
                  cy={pt.y}
                  r={hoveredIdx === pt.i ? 4.5 : 2}
                  fill={isPtPos ? "#10b981" : "#f43f5e"}
                  stroke="#0b0f19"
                  strokeWidth={1.5}
                  opacity={hoveredIdx != null && hoveredIdx !== pt.i ? 0.35 : 0.85}
                />
              );
            })}

            {/* Hovered Crosshair and Indicator */}
            {activePoint && hoveredIdx != null && (
              <>
                <line
                  x1={activePoint.x}
                  x2={activePoint.x}
                  y1={PADDING_TOP}
                  y2={PADDING_TOP + h}
                  stroke="rgba(255, 255, 255, 0.35)"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                <line
                  x1={PADDING_LEFT}
                  x2={PADDING_LEFT + w}
                  y1={activePoint.y}
                  y2={activePoint.y}
                  stroke="rgba(255, 255, 255, 0.2)"
                  strokeDasharray="2 2"
                  strokeWidth={1}
                />
                <circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r={6}
                  fill={activePoint.cum >= 0 ? "#10b981" : "#f43f5e"}
                  stroke="#ffffff"
                  strokeWidth={2}
                  className="animate-pulse"
                />
              </>
            )}
          </svg>
        )}

        {/* Hover / Touch Tooltip (Glassmorphic) */}
        {activePoint && hoveredIdx != null && (
          <div
            className="absolute z-20 pointer-events-none transform -translate-y-full transition-all duration-75"
            style={{
              left: Math.min(
                Math.max(activePoint.x - 110, 10),
                (size.width || 400) - 230,
              ),
              top: Math.max(activePoint.y - 12, 10),
            }}
          >
            <div className="bg-surface2/95 backdrop-blur-md border border-subtle rounded-xl shadow-2xl p-3 w-[220px] text-xs font-sans text-primary">
              <div className="flex items-center justify-between border-b border-subtle pb-1.5 mb-1.5">
                <span className="font-bold font-mono text-[11px] text-accent-blue">
                  Trade #{activePoint.i + 1}
                </span>
                <span className="text-[10px] text-faint flex items-center gap-1">
                  <Clock size={10} />
                  {formatDateTime(activePoint.order.closed_at).split(",")[0]}
                </span>
              </div>

              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-[13px] tracking-wide text-primary">
                  {activePoint.order.symbol}
                </span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    activePoint.order.side === "BUY"
                      ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
                      : "bg-rose-950/80 text-rose-400 border border-rose-800/60"
                  }`}
                >
                  {activePoint.order.side} {activePoint.order.quantity || 1}x
                </span>
              </div>

              <div className="space-y-1 font-mono text-[11px] pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-faint">Trade P&amp;L:</span>
                  <span
                    className={`font-bold ${
                      activePoint.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatCurrency(activePoint.pnl)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-faint">Cumulative Equity:</span>
                  <span
                    className={`font-bold ${
                      activePoint.cum >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatCurrency(activePoint.cum)}
                  </span>
                </div>

                {activePoint.order.close_reason && (
                  <div className="flex items-center justify-between pt-1 border-t border-subtle text-[10px] font-sans">
                    <span className="text-faint">Exit Reason:</span>
                    <span className="text-muted font-medium truncate max-w-[110px]" title={activePoint.order.close_reason}>
                      {activePoint.order.close_reason}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {points.length === 0 && (
          <div className="absolute inset-0 grid place-items-center text-faint text-sm">
            No closed trades recorded in this date range.
          </div>
        )}
      </div>
    </Card>
  );
}

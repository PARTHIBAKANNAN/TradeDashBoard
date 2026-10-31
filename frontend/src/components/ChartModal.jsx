import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import CandleChart from "./CandleChart.jsx";
import { useMultiDayCandles } from "../hooks/useSymbolCandles.js";
import { useStock } from "../hooks/useMarketStream.js";
import { usePositions } from "../hooks/useOrders.js";

// ── Resolution definitions ────────────────────────────────────────────────────

const RESOLUTIONS = [
  { label: "1m", minutes: 1 },
  { label: "5m", minutes: 5 },
  { label: "1hr", minutes: 60 },
  { label: "4hr", minutes: 240 },
  { label: "1D", minutes: 1440 },
];

/**
 * Re-aggregate an array of candles into a coarser resolution.
 * Supports 1m, 5m, 1hr, 4hr, and 1D.
 */
function aggregateCandles(candles, targetMinutes) {
  if (!candles || candles.length === 0 || targetMinutes <= 5) return candles;

  const groups = new Map();

  for (const c of candles) {
    let key;
    let bucketStart;

    if (targetMinutes >= 1440) {
      // 1D: Group by full trading session date
      key = c.bucket_date;
      bucketStart = 9 * 60 + 15; // 09:15 IST session open
    } else {
      // 1hr, 4hr: Align to bucket within the day
      bucketStart = Math.floor(c.bucket_minute / targetMinutes) * targetMinutes;
      key = `${c.bucket_date}_${bucketStart}`;
    }

    if (!groups.has(key)) {
      groups.set(key, {
        bucket_date: c.bucket_date,
        bucket_minute: bucketStart,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        delta: c.delta || 0,
      });
    } else {
      const g = groups.get(key);
      g.high = Math.max(g.high, c.high);
      g.low = Math.min(g.low, c.low);
      g.close = c.close; // last close wins
      g.delta += c.delta || 0;
    }
  }

  return Array.from(groups.values());
}

// ── ChartModal ────────────────────────────────────────────────────────────────

export default function ChartModal({ symbol, stock: stockProp, onClose }) {
  const { candles, levels, loading, isPreviousDay, candleDate } =
    useMultiDayCandles(symbol, 21);
  const liveStock = useStock(symbol);
  const stock = liveStock || stockProp;
  const positions = usePositions();
  const position = positions.find(
    (p) => p.symbol === symbol && p.status === "OPEN",
  );

  const [resolution, setResolution] = useState(5); // minutes
  const chartContainerRef = useRef(null);
  const [chartHeight, setChartHeight] = useState(600);

  // Dynamically size the chart to fill the modal content area
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartHeight(entry.contentRect.height || 600);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const aggregated = useMemo(
    () => aggregateCandles(candles, resolution),
    [candles, resolution],
  );

  const pointChange =
    stock?.ltp != null && stock?.prev_close != null
      ? stock.ltp - stock.prev_close
      : null;

  return createPortal(
    <AnimatePresence>
      {symbol && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex flex-col w-full h-full bg-surface border-t border-subtle shadow-glow overflow-hidden pb-safe"
          >
            {/* ── Modal header ──────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 sm:gap-4 px-3 sm:px-5 py-2.5 sm:py-3 border-b border-subtle flex-shrink-0 bg-surface2/80 backdrop-blur pt-safe">
              {/* Row 1 on mobile: Symbol + price + Close button */}
              <div className="flex items-center justify-between gap-3 min-w-0">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-wrap">
                  <span className="font-extrabold text-lg sm:text-xl text-primary tracking-tight font-display">
                    {symbol}
                  </span>
                  {stock && (
                    <>
                      <span className="font-mono text-sm sm:text-base font-bold text-primary">
                        ₹
                        {stock.ltp?.toLocaleString("en-IN", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      {pointChange != null && (
                        <span
                          className={`font-mono text-xs sm:text-sm font-semibold flex items-center gap-0.5 ${
                            pointChange >= 0
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }`}
                        >
                          <span>{pointChange >= 0 ? "▲ +" : "▼ "}</span>
                          <span>
                            {Math.abs(pointChange).toLocaleString("en-IN", {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </span>
                      )}
                      <span
                        className={`text-xs sm:text-sm font-mono font-semibold ${
                          (stock.pct_change ?? 0) >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        ({(stock.pct_change ?? 0) >= 0 ? "+" : ""}
                        {stock.pct_change ?? 0}%)
                      </span>
                      {stock.sector && (
                        <span className="text-xs text-faint hidden sm:block truncate">
                          {stock.sector}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Close Button for mobile */}
                <button
                  onClick={onClose}
                  aria-label="Close modal"
                  className="md:hidden w-8 h-8 grid place-items-center rounded-lg border border-subtle bg-surface3 text-muted hover:text-primary transition-colors flex-shrink-0 ml-auto"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Row 2 on mobile / Center on desktop: resolution picker + desktop close */}
              <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto">
                <div className="flex items-center gap-1 rounded-xl border border-subtle bg-surface3/80 p-0.5 sm:p-1 overflow-x-auto no-scrollbar w-full sm:w-auto justify-between sm:justify-start">
                  {RESOLUTIONS.map(({ label, minutes }) => (
                    <button
                      key={label}
                      onClick={() => setResolution(minutes)}
                      className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all text-center whitespace-nowrap cursor-pointer ${
                        resolution === minutes
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-muted hover:text-primary hover:bg-surface2"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Desktop Close button */}
                <button
                  onClick={onClose}
                  aria-label="Close modal"
                  className="hidden md:grid w-8 h-8 place-items-center rounded-lg border border-subtle bg-surface3 text-muted hover:text-primary hover:border-strong transition-colors flex-shrink-0 ml-2 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* ── Chart area ────────────────────────────────────────────── */}
            <div ref={chartContainerRef} className="flex-1 min-h-0 p-2">
              {loading && aggregated.length === 0 ? (
                <div className="h-full grid place-items-center text-faint text-sm animate-pulse">
                  Loading {symbol} history…
                </div>
              ) : !loading && aggregated.length === 0 ? (
                <div className="h-full grid place-items-center text-faint text-sm">
                  No candle data available.
                </div>
              ) : (
                <CandleChart
                  candles={aggregated}
                  levels={levels}
                  position={position}
                  height={chartHeight}
                  multiDay={true}
                  candleDate={candleDate}
                  isPreviousDay={isPreviousDay}
                />
              )}
            </div>

            {/* ── Footer: data info ─────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-2 border-t border-subtle bg-surface2/60 backdrop-blur text-[11px] text-faint flex-shrink-0">
              <span>
                {aggregated.length} bars · up to 21 trading days ·{" "}
                {resolution === 1 ? "1m / 5m base" : `${resolution}m`}{" "}
                resolution
              </span>
              <span>
                {position
                  ? `Active Position: ${position.side} ${position.quantity} Qty`
                  : "Free-Flow Cursor · Pinch to Zoom"}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

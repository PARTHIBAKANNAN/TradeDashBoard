import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import CandleChart from "./CandleChart.jsx";
import { useSymbolCandles } from "../hooks/useSymbolCandles.js";
import { useStock } from "../hooks/useMarketStream.js";
import { usePositions } from "../hooks/useOrders.js";

// Full-size chart-in-a-popup — same CandleChart used by the Charts tab (same
// reference lines, same CVD pane), just opened in place instead of jumping
// tabs. Portals to document.body so it's safe from inside a <tr>.
export default function ChartModal({ symbol, onClose }) {
  const { candles, levels, loading } = useSymbolCandles(symbol);
  const stock = useStock(symbol);
  const positions = usePositions();
  const position = positions.find(
    (p) => p.symbol === symbol && p.status === "OPEN",
  );

  return createPortal(
    <AnimatePresence>
      {symbol && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm p-2 sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="relative mx-auto w-full max-w-6xl h-full sm:h-[92vh] bg-surface2 border border-subtle rounded-2xl shadow-glow overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-subtle flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-primary text-lg">{symbol}</span>
                {stock && (
                  <span
                    className={`font-mono text-sm font-semibold ${
                      stock.pct_change >= 0 ? "text-bull" : "text-bear"
                    }`}
                  >
                    {stock.ltp?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}{" "}
                    ({stock.pct_change >= 0 ? "+" : ""}
                    {stock.pct_change}%)
                  </span>
                )}
                {stock?.sector && (
                  <span className="text-xs text-faint truncate">{stock.sector}</span>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-faint hover:text-primary transition-colors flex-shrink-0"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-2">
              {loading && candles.length === 0 ? (
                <div className="h-full grid place-items-center text-faint text-sm animate-pulse">
                  Loading candles…
                </div>
              ) : !loading && candles.length === 0 ? (
                <div className="h-full grid place-items-center text-faint text-sm">
                  No candles yet today
                </div>
              ) : (
                <CandleChart
                  candles={candles}
                  levels={levels}
                  position={position}
                  height="100%"
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

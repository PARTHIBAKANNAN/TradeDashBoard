import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Rocket } from "lucide-react";
import PlaceOrderForm from "./PlaceOrderForm.jsx";

// Thin modal shell around PlaceOrderForm, opened from a per-row "Trade"
// button (WatchlistRow / RankingScreen) pre-filled with that row's symbol —
// avoids forking order-form logic or adding state to the 169-row table.
// Portals to document.body so it's always safe to trigger, even from inside
// a <tr> (a fixed-position <div> can't legally live inside a table row).
export default function QuickTradeModal({ symbol, onClose }) {
  return createPortal(
    <AnimatePresence>
      {symbol && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-surface2 border-t sm:border border-subtle rounded-t-3xl sm:rounded-2xl shadow-glow flex flex-col max-h-[92vh] sm:max-h-[85vh] pb-safe"
          >
            {/* Mobile Sheet Pull Indicator */}
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center flex-shrink-0">
              <div className="w-10 h-1 bg-surface4 rounded-full" />
            </div>

            {/* Sticky header — always visible even when the form scrolls */}
            <div className="flex items-center justify-between px-5 pt-2 sm:pt-5 pb-3 border-b border-subtle flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="grid place-items-center w-7 h-7 rounded-md bg-accent-blue/10 text-accent-blue">
                  <Rocket size={14} />
                </span>
                <h3 className="text-sm font-bold text-primary">
                  Quick Trade · {symbol}
                </h3>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-7 h-7 grid place-items-center rounded-lg text-faint hover:text-primary hover:bg-surface3 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            {/* Scrollable body with comfortable padding */}
            <div className="overflow-y-auto flex-1 px-5 py-4 overscroll-contain">
              <PlaceOrderForm
                defaultSymbol={symbol}
                lockSymbol
                onPlaced={onClose}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

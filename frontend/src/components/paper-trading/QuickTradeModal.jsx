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
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm grid place-items-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-surface2 border border-subtle rounded-2xl p-5 shadow-glow"
          >
            <div className="flex items-center justify-between mb-4">
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
                className="text-faint hover:text-primary transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <PlaceOrderForm
              defaultSymbol={symbol}
              lockSymbol
              onPlaced={onClose}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

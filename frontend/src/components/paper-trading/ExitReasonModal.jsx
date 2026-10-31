import React, { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Check, X, ShieldAlert } from "lucide-react";
import { logExitReason } from "../../hooks/useOrders.js";

const PRESET_REASONS = [
  "Target Reached Early (Locked Profit)",
  "Price Action Stalled / Reversed",
  "False Breakout / Setup Invalidated",
  "Pre-Event / News Volatility Avoidance",
  "Disciplined Risk Cut",
];

export default function ExitReasonModal({ order, onClose }) {
  const [selectedReason, setSelectedReason] = useState(PRESET_REASONS[0]);
  const [customNote, setCustomNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!order) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await logExitReason(order.id, selectedReason, customNote.trim());
      onClose();
    } catch {
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm grid place-items-center p-4 font-sans"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-surface2 border border-subtle rounded-2xl p-5 shadow-2xl space-y-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-subtle pb-3">
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center w-8 h-8 rounded-xl bg-accent-blue/15 text-accent-blue border border-accent-blue/30">
                <FileText size={16} />
              </span>
              <div>
                <h3 className="text-sm font-bold text-primary flex items-center gap-1.5">
                  Trade Closed: {order.symbol}
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                    Filled at Market
                  </span>
                </h3>
                <p className="text-[11px] text-faint">
                  Order was closed immediately. Record the exit reason for journal review:
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-faint hover:text-primary transition-colors p-1"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                Primary Exit Reason
              </label>
              <div className="space-y-1.5">
                {PRESET_REASONS.map((r) => {
                  const isSelected = selectedReason === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSelectedReason(r)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all border ${
                        isSelected
                          ? "bg-accent-blue/15 text-accent-blue border-accent-blue/50 shadow-sm"
                          : "bg-surface3/60 text-muted hover:text-primary border-subtle"
                      }`}
                    >
                      <span>{r}</span>
                      {isSelected && <Check size={14} className="text-accent-blue" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
                Additional Trade Notes <span className="text-faint font-normal">(optional)</span>
              </label>
              <textarea
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                rows={2}
                placeholder="What did you observe? Price action details, psychological notes..."
                className="w-full bg-surface3 border border-strong rounded-xl p-2.5 text-xs text-primary focus:outline-none focus:border-accent-blue resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-subtle">
              <button
                type="button"
                onClick={onClose}
                className="py-2 text-xs font-bold text-muted hover:text-primary rounded-xl border border-subtle transition-colors"
              >
                Skip / Leave Default
              </button>
              <button
                type="submit"
                disabled={busy}
                className="py-2 text-xs font-bold text-white bg-gradient-to-r from-accent-blue to-accent-violet hover:opacity-90 rounded-xl shadow-sm transition-opacity"
              >
                {busy ? "Saving..." : "Save Exit Journal"}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}


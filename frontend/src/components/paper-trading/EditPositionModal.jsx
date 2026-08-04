import React, { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, PencilLine } from "lucide-react";
import { modifyPosition } from "../../hooks/useOrders.js";
import TslFields from "./TslFields.jsx";

// Edit the bracket on an already-OPEN position: SL, Target, and/or TSL.
// Full-replace semantics matching the backend endpoint — always submits the
// complete desired state, pre-filled from the order passed in.
export default function EditPositionModal({ order, onClose }) {
  const [slPrice, setSlPrice] = useState(order?.sl_price ?? "");
  const [targetPrice, setTargetPrice] = useState(order?.target_price ?? "");
  const [tslType, setTslType] = useState(order?.tsl_type ?? "");
  const [tslValue, setTslValue] = useState(order?.tsl_value ?? "");
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (tslType && (!tslValue || Number(tslValue) <= 0)) {
      setError(
        "Trailing stop value is required when a trail type is selected.",
      );
      return;
    }
    setBusy(true);
    try {
      await modifyPosition(order.id, {
        sl_price: slPrice ? Number(slPrice) : undefined,
        target_price: targetPrice ? Number(targetPrice) : undefined,
        tsl_type: tslType || undefined,
        tsl_value: tslType && tslValue ? Number(tslValue) : undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err.message || "Could not update the position.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {order && (
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
                <span className="grid place-items-center w-7 h-7 rounded-md bg-accent-violet/10 text-accent-violet">
                  <PencilLine size={14} />
                </span>
                <h3 className="text-sm font-bold text-primary">
                  Edit Position · {order.symbol}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="text-faint hover:text-primary transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
                    Stop Loss{" "}
                    <span className="text-faint font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={slPrice}
                    onChange={(e) => setSlPrice(e.target.value)}
                    className="w-full bg-surface3 border border-strong rounded-lg p-2 text-sm font-mono focus:outline-none focus:border-accent-blue"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
                    Target{" "}
                    <span className="text-faint font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    className="w-full bg-surface3 border border-strong rounded-lg p-2 text-sm font-mono focus:outline-none focus:border-accent-blue"
                  />
                </div>
              </div>

              <TslFields
                tslType={tslType}
                tslValue={tslValue}
                onTypeChange={setTslType}
                onValueChange={setTslValue}
              />

              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
                  Journal Note{" "}
                  <span className="text-faint font-normal">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Why this trade? Setup, conviction, plan…"
                  className="w-full bg-surface3 border border-strong rounded-lg p-2 text-sm focus:outline-none focus:border-accent-blue resize-none"
                />
              </div>

              {error && <p className="text-bear text-xs">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="w-full bg-gradient-to-r from-accent-blue to-accent-violet hover:opacity-90 disabled:opacity-50 rounded-lg py-2.5 text-sm font-bold text-white transition-opacity"
              >
                {busy ? "Saving…" : "Save Changes"}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

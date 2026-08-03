import React from "react";

const TYPES = ["NONE", "PERCENT", "POINTS"];
const LABEL = { NONE: "Off", PERCENT: "%", POINTS: "₹ pts" };

// Shared Trailing-Stop input group — used by both PlaceOrderForm (set at
// entry) and EditPositionModal (add/change on an already-open position).
export default function TslFields({ tslType, tslValue, onTypeChange, onValueChange }) {
  const active = tslType || "NONE";
  return (
    <div>
      <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
        Trailing Stop <span className="text-faint font-normal">(optional)</span>
      </label>
      <div className="grid grid-cols-3 gap-2">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTypeChange(t === "NONE" ? "" : t)}
            className={`rounded-lg py-2 text-xs font-semibold transition-colors border ${
              active === t
                ? "bg-accent-violet/15 border-accent-violet/40 text-accent-violet"
                : "bg-surface3 border-subtle text-muted hover:text-primary"
            }`}
          >
            {LABEL[t]}
          </button>
        ))}
      </div>
      {tslType && (
        <input
          type="number"
          step="0.05"
          min="0"
          value={tslValue}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={tslType === "PERCENT" ? "Trail % e.g. 1.5" : "Trail ₹ e.g. 20"}
          className="mt-2 w-full bg-surface3 border border-strong rounded-lg p-2 text-sm font-mono focus:outline-none focus:border-accent-blue"
        />
      )}
    </div>
  );
}

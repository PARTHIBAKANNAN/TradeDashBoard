import React, { useMemo } from "react";
import { Clock3 } from "lucide-react";
import { CANDLE_MARKS } from "../utils/candleTime.js";

// Replaces the old 0-100% "Day Range Position" slider. Steps through the
// trading day in real 15-min candle marks (09:15 = candle 1, 09:30 = candle
// 2, ...) instead of an abstract percentage. Index 0 = "All day" (no
// filter); index N maps to CANDLE_MARKS[N-1] and filters to stocks whose
// breakout signal fired at or before that clock time.
export default function SignalTimeFilter({ value, onChange }) {
  const max = CANDLE_MARKS.length;
  const active = value > 0;
  const mark = active ? CANDLE_MARKS[value - 1] : null;

  const fillPct = useMemo(() => (max ? (value / max) * 100 : 0), [value, max]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide">
          <Clock3 size={12} className="text-accent-blue" />
          Signal Time
        </label>
        {active && (
          <button
            onClick={() => onChange(0)}
            className="text-[10px] font-bold text-accent-blue hover:text-accent-violet transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <div className="rounded-lg border border-subtle bg-surface3/60 px-3 py-3">
        <div className="flex items-baseline justify-between mb-2.5">
          {active ? (
            <>
              <span className="font-mono text-lg font-bold text-primary tabular-nums">
                {mark.label}
              </span>
              <span className="text-[10px] font-bold text-accent-violet bg-accent-violet/10 border border-accent-violet/30 rounded px-1.5 py-0.5">
                Candle #{mark.candle}
              </span>
            </>
          ) : (
            <span className="text-sm font-bold text-faint">All day · no time filter</span>
          )}
        </div>

        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="slider-premium w-full cursor-pointer"
          style={{ "--slider-fill": `${fillPct}%` }}
          aria-label="Filter stocks by signal time"
        />

        <div className="flex justify-between mt-2">
          {["09:15", "10:15", "11:15", "12:15", "13:15", "14:15", "15:15"].map((t) => (
            <span key={t} className="text-[9px] font-mono text-faint">
              {t}
            </span>
          ))}
        </div>

        <p className="text-[10px] text-faint mt-2 leading-relaxed">
          {active
            ? `Showing stocks whose breakout signal fired at or before ${mark.label}.`
            : "Drag to only show stocks whose signal fired by a given time."}
        </p>
      </div>
    </div>
  );
}

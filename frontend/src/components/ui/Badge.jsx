import React from "react";

const TONES = {
  bull: "bg-bull/10 text-bull border-bull/30",
  bear: "bg-bear/10 text-bear border-bear/30",
  neutral: "bg-surface3 text-muted border-strong",
  accent: "bg-accent-blue/10 text-accent-blue border-accent-blue/30",
  amber: "bg-accent-amber/10 text-accent-amber border-accent-amber/30",
};

export default function Badge({ tone = "neutral", className = "", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

import React from "react";
import { Lightbulb } from "lucide-react";
import Insights from "../components/insights/Insights.jsx";

export default function InsightsScreen({ stocks }) {
  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-full px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-accent-violet/10 text-accent-violet border border-accent-violet/20">
            <Lightbulb size={17} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-primary font-display">Market Insights</h2>
            <p className="text-xs text-faint">Real-time analytics and market breadth indicators</p>
          </div>
        </div>

        <Insights stocks={stocks} />
      </div>
    </div>
  );
}

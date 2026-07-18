import React from "react";
import Insights from "../components/insights/Insights.jsx";

export default function InsightsScreen({ stocks }) {
  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-full px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-primary mb-2">
            Market Insights
          </h2>
          <p className="text-xs text-faint">
            Real-time analytics and market breadth indicators
          </p>
        </div>

        {/* Insights Component */}
        <Insights stocks={stocks} />
      </div>
    </div>
  );
}

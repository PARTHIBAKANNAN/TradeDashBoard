import React from "react";
import MarketBreadth from "./MarketBreadth.jsx";
import SectorLeaderboard from "./SectorLeaderboard.jsx";
import BreakoutLeaderboard from "./BreakoutLeaderboard.jsx";
import RankedMovers from "./RankedMovers.jsx";
import NewHighsLows from "./NewHighsLows.jsx";
import CircuitProximity from "./CircuitProximity.jsx";
import BuySellPressure from "./BuySellPressure.jsx";
import SectorRotationChart from "./SectorRotationChart.jsx";

// Composes all Insights widgets. All derive from the same `stocks` prop
// (the SSE payload's stock list) — no additional data fetching.
export default function Insights({ stocks }) {
  return (
    <div className="space-y-4">
      <MarketBreadth stocks={stocks} />
      <BuySellPressure stocks={stocks} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectorLeaderboard stocks={stocks} />
        <BreakoutLeaderboard stocks={stocks} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectorRotationChart stocks={stocks} />
        <CircuitProximity stocks={stocks} />
      </div>
      <NewHighsLows stocks={stocks} />
      <RankedMovers stocks={stocks} />
    </div>
  );
}

import React, { useMemo, useState } from "react";
import {
  SlidersHorizontal,
  X,
  RotateCcw,
  TrendingUp,
  Building2,
  ArrowUpDown,
  Zap,
} from "lucide-react";
import WatchlistRow from "../components/WatchlistRow.jsx";
import SignalTimeFilter from "../components/SignalTimeFilter.jsx";
import Card from "../components/ui/Card.jsx";
import { CANDLE_MARKS, timeStrToMinutes } from "../utils/candleTime.js";

const SORTS = {
  rs_desc: {
    label: "RS ▼ (strongest)",
    fn: (a, b) => b.relative_strength - a.relative_strength,
  },
  rs_asc: {
    label: "RS ▲ (weakest)",
    fn: (a, b) => a.relative_strength - b.relative_strength,
  },
  chg_desc: { label: "% Change ▼", fn: (a, b) => b.pct_change - a.pct_change },
  pos_desc: {
    label: "Day range % ▼",
    fn: (a, b) => b.day_range_pos - a.day_range_pos,
  },
  sym: { label: "Symbol A-Z", fn: (a, b) => a.symbol.localeCompare(b.symbol) },
};

export default function RankingScreen({ stocks }) {
  const [showFilters, setShowFilters] = useState(true);
  const [selectedSignal, setSelectedSignal] = useState("All signals");
  const [selectedSector, setSelectedSector] = useState("All sectors");
  const [signalTimeIndex, setSignalTimeIndex] = useState(0);
  const [sortKey, setSortKey] = useState("rs_desc");

  const sectors = useMemo(() => {
    const set = new Set((stocks || []).map((s) => s.sector));
    return ["All sectors", ...Array.from(set).sort()];
  }, [stocks]);

  const filteredStocks = useMemo(() => {
    const timeThreshold =
      signalTimeIndex > 0 ? CANDLE_MARKS[signalTimeIndex - 1].minutes : null;
    const rows = (stocks || []).filter((stock) => {
      if (selectedSignal !== "All signals") {
        if (!stock.signal || !stock.signal.includes(selectedSignal))
          return false;
      }
      if (selectedSector !== "All sectors" && stock.sector !== selectedSector)
        return false;
      if (timeThreshold !== null) {
        const hasSignal = stock.signal && stock.signal !== "None";
        if (!hasSignal) return false;
        const signalMinutes = timeStrToMinutes(stock.signal_time);
        if (signalMinutes === null || signalMinutes > timeThreshold)
          return false;
      }
      return true;
    });
    return rows.sort(SORTS[sortKey].fn);
  }, [stocks, selectedSignal, selectedSector, signalTimeIndex, sortKey]);

  const activeFilterCount =
    (selectedSignal !== "All signals" ? 1 : 0) +
    (selectedSector !== "All sectors" ? 1 : 0) +
    (signalTimeIndex > 0 ? 1 : 0);

  const resetFilters = () => {
    setSelectedSignal("All signals");
    setSelectedSector("All sectors");
    setSignalTimeIndex(0);
    setSortKey("rs_desc");
  };

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-7xl px-6 py-6 flex gap-6">
        {/* Filters Sidebar */}
        {showFilters && (
          <div className="w-72 flex-shrink-0">
            <Card
              className="sticky top-24"
              title="Filters"
              icon={SlidersHorizontal}
              actions={
                <button
                  onClick={() => setShowFilters(false)}
                  className="text-faint hover:text-primary transition-colors"
                >
                  <X size={15} />
                </button>
              }
            >
              <div className="space-y-5">
                <FilterGroup label="Breakout Signal" icon={Zap}>
                  <select
                    value={selectedSignal}
                    onChange={(e) => setSelectedSignal(e.target.value)}
                    className="w-full bg-surface3 border border-strong rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent-blue transition-colors"
                  >
                    <option>All signals</option>
                    <option value="Bull">Bull</option>
                    <option value="Bear">Bear</option>
                  </select>
                </FilterGroup>

                <FilterGroup label="Sector" icon={Building2}>
                  <select
                    value={selectedSector}
                    onChange={(e) => setSelectedSector(e.target.value)}
                    className="w-full bg-surface3 border border-strong rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent-blue transition-colors"
                  >
                    {sectors.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </FilterGroup>

                <FilterGroup label="Sort by" icon={ArrowUpDown}>
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value)}
                    className="w-full bg-surface3 border border-strong rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent-blue transition-colors"
                  >
                    {Object.entries(SORTS).map(([key, { label }]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </FilterGroup>

                <SignalTimeFilter
                  value={signalTimeIndex}
                  onChange={setSignalTimeIndex}
                />

                <button
                  onClick={resetFilters}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-accent-blue hover:text-accent-violet transition-colors py-2 border border-subtle rounded-lg hover:bg-surface3"
                >
                  <RotateCcw size={12} />
                  Reset Filters
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            {!showFilters ? (
              <button
                onClick={() => setShowFilters(true)}
                className="text-xs font-bold text-accent-blue hover:text-accent-violet transition-colors flex items-center gap-2"
              >
                <SlidersHorizontal size={13} />
                Show Filters
                {activeFilterCount > 0 && (
                  <span className="w-4 h-4 grid place-items-center rounded-full bg-accent-blue text-white text-[9px]">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-bold text-faint">
                <TrendingUp size={13} className="text-accent-blue" />
                Live rankings
              </div>
            )}
            <div className="text-xs text-faint ml-auto">
              Showing{" "}
              <span className="font-bold text-primary">
                {filteredStocks.length}
              </span>{" "}
              stocks
            </div>
          </div>

          {/* Table */}
          <div className="bg-surface2/70 backdrop-blur-xl border border-subtle rounded-xl overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface3/60 border-b border-subtle">
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider">
                      Stock
                    </th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                      LTP
                    </th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">
                      Day Range
                    </th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">
                      Signal
                    </th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                      RS vs NIFTY
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStocks.map((stock, i) => (
                    <WatchlistRow key={stock.symbol} stock={stock} index={i} />
                  ))}
                </tbody>
              </table>
            </div>
            {filteredStocks.length === 0 && (
              <div className="py-12 text-center text-faint text-sm">
                No stocks match the current filters. Try adjusting your
                criteria.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ label, icon: Icon, children }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase mb-2 tracking-wide">
        {Icon && <Icon size={12} className="text-accent-blue" />}
        {label}
      </label>
      {children}
    </div>
  );
}

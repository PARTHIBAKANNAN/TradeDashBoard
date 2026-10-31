import React, { useMemo, useState } from "react";
import {
  SlidersHorizontal,
  X,
  RotateCcw,
  TrendingUp,
  Building2,
  ArrowUpDown,
  Zap,
  Search,
} from "lucide-react";
import WatchlistRow from "../components/WatchlistRow.jsx";
import SignalTimeFilter from "../components/SignalTimeFilter.jsx";
import Card from "../components/ui/Card.jsx";
import { CANDLE_MARKS, timeStrToMinutes } from "../utils/candleTime.js";
import { useRecommendedStocks } from "../hooks/useRecommendedStocks.js";

// A stock only ever carries a real signal once it's passed all 3 breakout-
// quality rules (calculations.py) — so "has a signal" already *is* "passed
// the 3 conditions", no separate check needed here.
const hasQualifiedSignal = (s) => Boolean(s.signal && s.signal !== "None");

const SORTS = {
  breakout_first: {
    label: "Breakout qualified first",
    fn: (a, b) => {
      const q = Number(hasQualifiedSignal(b)) - Number(hasQualifiedSignal(a));
      if (q !== 0) return q;
      // Among equally-qualified (or equally unqualified) rows, most recent
      // signal first, then fall back to RS as a tiebreaker.
      if (a.signal_time !== b.signal_time)
        return (b.signal_time || "").localeCompare(a.signal_time || "");
      return b.relative_strength - a.relative_strength;
    },
  },
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

const NIFTY_50_SET = new Set([
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR", "ITC", "SBIN",
  "BHARTIARTL", "BAJFINANCE", "LICI", "LT", "HCLTECH", "KOTAKBANK", "AXISBANK",
  "MARUTI", "SUNPHARMA", "TMPV", "TITAN", "ONGC", "NTPC", "TATAMOTORS", "POWERGRID",
  "ADANIENT", "BAJAJFINSV", "COALINDIA", "TATASTEEL", "ASIANPAINT", "JSWSTEEL",
  "ADANIPORTS", "GRASIM", "TECHM", "EICHERMOT", "HINDALCO", "BPCL", "DRREDDY",
  "CIPLA", "BRITANNIA", "TATACONSUM", "NESTLEIND", "DIVISLAB", "APOLLOHOSP",
  "BAJAJ-AUTO", "WIPRO", "ULTRACEMCO", "SHRIRAMFIN", "M&M", "BEL", "TRENT"
]);

export default function RankingScreen({ stocks, nifty }) {
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState("All signals");
  const [selectedSector, setSelectedSector] = useState("All sectors");
  const [signalTimeIndex, setSignalTimeIndex] = useState(0);
  const [sortKey, setSortKey] = useState("breakout_first");
  const [search, setSearch] = useState("");
  const [activePreset, setActivePreset] = useState("ALL");
  const [activeBasket, setActiveBasket] = useState("ALL");
  const recommended = useRecommendedStocks(stocks, nifty?.pct_change || 0);

  const counts = useMemo(() => {
    let openEq = 0;
    let rvol = 0;
    let hodSqueeze = 0;
    let vwapRetest = 0;

    (stocks || []).forEach((s) => {
      if (s.open_eq_signal === "OPEN_LOW" || s.open_eq_signal === "OPEN_HIGH") openEq++;
      if (s.is_rvol_shocker || (s.rvol && s.rvol >= 2.0)) rvol++;
      if (s.is_hod_squeeze || s.is_lod_breakdown || (s.day_range_pos >= 90 && s.day_range_pos > 0)) hodSqueeze++;
      if (s.is_vwap_retest || (s.vwap_dist_pct != null && Math.abs(s.vwap_dist_pct) <= 0.40 && Math.abs(s.relative_strength || 0) >= 0.50)) vwapRetest++;
    });

    return {
      all: stocks?.length || 210,
      openEq,
      rvol,
      hodSqueeze,
      vwapRetest,
    };
  }, [stocks]);

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
      if (search && !stock.symbol.toUpperCase().includes(search.toUpperCase()))
        return false;

      // 4 Advanced Intraday Screeners Filter
      if (activePreset === "OPEN_EQ") {
        if (!stock.open_eq_signal || stock.open_eq_signal === "None") return false;
      } else if (activePreset === "RVOL") {
        if (!stock.is_rvol_shocker && (!stock.rvol || stock.rvol < 2.0)) return false;
      } else if (activePreset === "HOD_SQUEEZE") {
        if (!stock.is_hod_squeeze && !stock.is_lod_breakdown && (stock.day_range_pos < 90 || stock.day_range_pos <= 0)) return false;
      } else if (activePreset === "VWAP_RETEST") {
        const nearVwap = stock.is_vwap_retest || (stock.vwap_dist_pct != null && Math.abs(stock.vwap_dist_pct) <= 0.40);
        if (!nearVwap) return false;
      }

      // Smart Basket Filter
      if (activeBasket === "NIFTY50") {
        if (!NIFTY_50_SET.has(stock.symbol)) return false;
      } else if (activeBasket === "HIGH_BETA") {
        if (NIFTY_50_SET.has(stock.symbol)) return false;
      } else if (activeBasket === "HIGH_ATR") {
        if (Math.abs(stock.pct_change || 0) < 1.8 && (stock.day_range_pos < 75)) return false;
      }

      return true;
    });
    return rows.sort(SORTS[sortKey].fn);
  }, [
    stocks,
    selectedSignal,
    selectedSector,
    signalTimeIndex,
    sortKey,
    search,
    activePreset,
    activeBasket,
  ]);

  const activeFilterCount =
    (selectedSignal !== "All signals" ? 1 : 0) +
    (selectedSector !== "All sectors" ? 1 : 0) +
    (signalTimeIndex > 0 ? 1 : 0);

  const resetFilters = () => {
    setSelectedSignal("All signals");
    setSelectedSector("All sectors");
    setSignalTimeIndex(0);
    setSortKey("breakout_first");
    setActivePreset("ALL");
    setActiveBasket("ALL");
  };

  const filterCard = (
    <Card
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
  );

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-[1920px] w-full px-4 sm:px-6 py-4 flex gap-6">
        {/* Filters — inline sidebar on lg+, slide-over drawer below lg */}
        {showFilters && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
              onClick={() => setShowFilters(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] overflow-y-auto p-4 lg:hidden">
              {filterCard}
            </div>
            <div className="hidden lg:block w-72 flex-shrink-0">
              <div className="sticky top-24">{filterCard}</div>
            </div>
          </>
        )}

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4">
            <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
              {!showFilters ? (
                <button
                  onClick={() => setShowFilters(true)}
                  className="text-xs font-bold text-accent-blue hover:text-accent-violet transition-colors flex items-center gap-2 flex-shrink-0 py-1"
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
                <div className="flex items-center gap-1.5 text-xs font-bold text-faint flex-shrink-0 py-1">
                  <TrendingUp size={13} className="text-accent-blue" />
                  Live rankings
                </div>
              )}
              <div className="sm:hidden text-xs text-faint flex-shrink-0">
                <span className="font-bold text-primary">
                  {filteredStocks.length}
                </span>{" "}
                stocks
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto sm:ml-auto">
              <div className="relative w-full sm:w-60">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search symbol…"
                  className="w-full bg-surface3 border border-strong rounded-lg pl-8 pr-3 py-1.5 text-xs text-primary focus:outline-none focus:border-accent-blue transition-colors"
                />
              </div>
              <div className="hidden sm:block text-xs text-faint flex-shrink-0">
                Showing{" "}
                <span className="font-bold text-primary">
                  {filteredStocks.length}
                </span>{" "}
                stocks
              </div>
            </div>
          </div>

          {/* Quick-Preset Screener Bar & Smart Baskets */}
          <div className="flex flex-col gap-2.5 mb-4 bg-surface2/40 border border-subtle/80 rounded-xl p-3 backdrop-blur-md">
            {/* Top row: 4 Advanced Intraday Screeners */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <span className="text-[10px] font-mono uppercase tracking-wider text-faint flex-shrink-0 mr-1 hidden sm:inline">
                Screener:
              </span>
              <button
                onClick={() => setActivePreset("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  activePreset === "ALL"
                    ? "bg-accent-blue text-white shadow-sm font-bold"
                    : "bg-surface3/80 text-faint hover:text-primary hover:bg-surface3"
                }`}
              >
                All ({counts.all})
              </button>
              <button
                onClick={() => setActivePreset("OPEN_EQ")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  activePreset === "OPEN_EQ"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold"
                    : "bg-surface3/80 text-faint hover:text-emerald-400 hover:bg-surface3"
                }`}
              >
                <span>⚡ 09:16 O=H / O=L</span>
                {counts.openEq > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/30 text-emerald-300 font-mono">
                    {counts.openEq}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActivePreset("RVOL")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  activePreset === "RVOL"
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold"
                    : "bg-surface3/80 text-faint hover:text-amber-400 hover:bg-surface3"
                }`}
              >
                <span>🔥 RVOL Shockers</span>
                {counts.rvol > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/30 text-amber-300 font-mono">
                    {counts.rvol}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActivePreset("HOD_SQUEEZE")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  activePreset === "HOD_SQUEEZE"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold"
                    : "bg-surface3/80 text-faint hover:text-emerald-400 hover:bg-surface3"
                }`}
              >
                <span>🎯 HOD Squeeze</span>
                {counts.hodSqueeze > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/30 text-emerald-300 font-mono">
                    {counts.hodSqueeze}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActivePreset("VWAP_RETEST")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  activePreset === "VWAP_RETEST"
                    ? "bg-sky-500/20 text-sky-400 border border-sky-500/40 font-bold"
                    : "bg-surface3/80 text-faint hover:text-sky-400 hover:bg-surface3"
                }`}
              >
                <span>🌊 VWAP Retest</span>
                {counts.vwapRetest > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-500/30 text-sky-300 font-mono">
                    {counts.vwapRetest}
                  </span>
                )}
              </button>
            </div>

            {/* Bottom row: Smart Baskets */}
            <div className="flex items-center gap-1.5 pt-2 border-t border-subtle/50 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <span className="text-[10px] font-mono uppercase tracking-wider text-faint flex-shrink-0 mr-1 hidden sm:inline">
                Basket:
              </span>
              <button
                onClick={() => setActiveBasket("ALL")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all ${
                  activeBasket === "ALL"
                    ? "bg-white/10 text-primary font-semibold border border-white/20"
                    : "text-faint hover:text-primary hover:bg-surface3"
                }`}
              >
                All Universe
              </button>
              <button
                onClick={() => setActiveBasket("NIFTY50")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all ${
                  activeBasket === "NIFTY50"
                    ? "bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30"
                    : "text-faint hover:text-primary hover:bg-surface3"
                }`}
              >
                🏛 Nifty 50 Titans
              </button>
              <button
                onClick={() => setActiveBasket("HIGH_BETA")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all ${
                  activeBasket === "HIGH_BETA"
                    ? "bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30"
                    : "text-faint hover:text-primary hover:bg-surface3"
                }`}
              >
                🚀 High-Beta Midcaps
              </button>
              <button
                onClick={() => setActiveBasket("HIGH_ATR")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all ${
                  activeBasket === "HIGH_ATR"
                    ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30"
                    : "text-faint hover:text-primary hover:bg-surface3"
                }`}
              >
                ⚡ High Volatility Leaders
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-surface2/70 backdrop-blur-xl border border-subtle rounded-xl overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="hidden md:table-header-group">
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
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">
                      Trade
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStocks.map((stock, i) => (
                    <WatchlistRow
                      key={stock.symbol}
                      stock={stock}
                      index={i}
                      niftyPctChange={nifty?.pct_change || 0}
                      isRecommended={recommended.includes(stock.symbol)}
                    />
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

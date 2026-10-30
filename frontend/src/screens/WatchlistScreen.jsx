import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  Star,
  PlusCircle,
  FolderPlus,
  Trash2,
  Check,
  X,
  LayoutGrid,
  Columns,
  Zap,
  TrendingUp,
  Bookmark,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Rocket,
  LineChart,
} from "lucide-react";
import CandleChart from "../components/CandleChart.jsx";
import MiniCandlestick from "../components/MiniCandlestick.jsx";
import QuickTradeModal from "../components/paper-trading/QuickTradeModal.jsx";
import ChartModal from "../components/ChartModal.jsx";
import { useMultiDayCandles } from "../hooks/useSymbolCandles.js";
import { useStock } from "../hooks/useMarketStream.js";

const DEFAULT_WATCHLISTS = {
  "Core Focus": ["RELIANCE", "TCS", "HCLTECH", "INFY", "WIPRO"],
  "High Beta": ["HAVELLS", "ANGELONE", "DIXON", "POLYCAB"],
  "Breakouts": ["360ONE", "ABB", "COFORGE"],
};

// ── Right Detail Canvas Sub-Component ─────────────────────────────────────────
function WatchlistChartCanvas({ symbol, onTrade }) {
  const { candles, levels, loading, isPreviousDay, candleDate } =
    useMultiDayCandles(symbol, 7);
  const liveStock = useStock(symbol);

  if (!symbol) {
    return (
      <div className="h-full min-h-[480px] grid place-items-center text-center p-6 text-faint">
        <div>
          <LineChart size={36} className="mx-auto mb-2 text-faint opacity-50" />
          <p className="text-sm font-semibold text-primary">Select a stock to view chart & levels</p>
          <p className="text-xs text-faint mt-1">
            Click any symbol from your watchlist on the left to see live candlesticks, CPR, and ORB levels.
          </p>
        </div>
      </div>
    );
  }

  const ltp = liveStock?.ltp ?? null;
  const pctChange = liveStock?.pct_change ?? 0;
  const isPositive = pctChange >= 0;

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-subtle">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-primary font-display">
              {symbol}
            </h3>
            <span className="text-[10px] font-semibold text-muted px-2 py-0.5 rounded-full bg-surface3 border border-subtle">
              {liveStock?.sector || "Equity"}
            </span>
            {liveStock?.signal && liveStock.signal !== "None" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                ⚡ {liveStock.signal}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5 mt-0.5">
            <span className="font-mono text-base sm:text-lg font-bold text-primary tabular-nums">
              ₹
              {ltp?.toLocaleString("en-IN", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 2,
              }) || "—"}
            </span>
            <span
              className={`text-xs font-bold tabular-nums flex items-center ${
                isPositive ? "text-bull" : "text-bear"
              }`}
            >
              {isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {isPositive ? "+" : ""}
              {pctChange}%
            </span>
          </div>
        </div>

        {/* Quick Order Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onTrade(symbol, "BUY")}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all flex items-center gap-1 cursor-pointer"
          >
            <span>BUY</span>
          </button>
          <button
            onClick={() => onTrade(symbol, "SELL")}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition-all flex items-center gap-1 cursor-pointer"
          >
            <span>SELL</span>
          </button>
        </div>
      </div>

      {/* Intraday Technical Reference Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-xl bg-surface3/40 border border-subtle text-xs">
        <div>
          <span className="text-[10px] text-faint uppercase font-bold tracking-wider">
            CPR Pivot
          </span>
          <p className="font-mono font-bold text-primary mt-0.5 tabular-nums">
            ₹{levels?.pivot ? Number(levels.pivot).toFixed(2) : "—"}
          </p>
        </div>
        <div>
          <span className="text-[10px] text-faint uppercase font-bold tracking-wider">
            OR Range (15m)
          </span>
          <p className="font-mono font-bold text-accent-blue mt-0.5 tabular-nums">
            {levels?.opening_range_high
              ? `₹${Number(levels.opening_range_high).toFixed(1)} - ₹${Number(
                  levels.opening_range_low
                ).toFixed(1)}`
              : "—"}
          </p>
        </div>
        <div>
          <span className="text-[10px] text-faint uppercase font-bold tracking-wider">
            Day High / Low
          </span>
          <p className="font-mono font-bold text-primary mt-0.5 tabular-nums">
            {liveStock?.today_high
              ? `₹${Number(liveStock.today_high).toFixed(1)} / ₹${Number(
                  liveStock.today_low
                ).toFixed(1)}`
              : "—"}
          </p>
        </div>
        <div>
          <span className="text-[10px] text-faint uppercase font-bold tracking-wider">
            Session Bias
          </span>
          <p
            className={`font-semibold text-xs mt-0.5 ${
              (liveStock?.day_range_pos || 50) >= 70
                ? "text-bull"
                : (liveStock?.day_range_pos || 50) <= 30
                ? "text-bear"
                : "text-muted"
            }`}
          >
            {(liveStock?.day_range_pos || 50) >= 70
              ? "🔥 Near Highs"
              : (liveStock?.day_range_pos || 50) <= 30
              ? "❄️ Near Lows"
              : "Mid Range"}
          </p>
        </div>
      </div>

      {/* Embedded Chart */}
      <div className="flex-1 min-h-[420px] rounded-xl border border-subtle overflow-hidden bg-surface2/60">
        {loading && candles.length === 0 ? (
          <div className="h-full min-h-[420px] grid place-items-center text-xs text-faint animate-pulse">
            Loading {symbol} intraday chart…
          </div>
        ) : (
          <CandleChart
            candles={candles}
            levels={levels}
            height={420}
            multiDay={false}
            candleDate={candleDate}
            isPreviousDay={isPreviousDay}
          />
        )}
      </div>
    </div>
  );
}

// ── Main Watchlist Screen Component ───────────────────────────────────────────
export default function WatchlistScreen({ stocks, nifty }) {
  // Named watchlists state
  const [watchlists, setWatchlists] = useState(() => {
    try {
      const saved = localStorage.getItem("pulsehunter_watchlists_v2");
      if (saved) return JSON.parse(saved);
      const legacy = localStorage.getItem("watchlist");
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { "My Watchlist": parsed, ...DEFAULT_WATCHLISTS };
        }
      }
      return DEFAULT_WATCHLISTS;
    } catch {
      return DEFAULT_WATCHLISTS;
    }
  });

  const [activeListName, setActiveListName] = useState(() => {
    return Object.keys(watchlists)[0] || "Core Focus";
  });

  // View Mode: 'split' (Pro Split View) vs 'grid' (Card Grid View)
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem("pulsehunter_watchlist_view_mode") || "split";
  });

  const [selectedSymbol, setSelectedSymbol] = useState(() => {
    const list = watchlists[activeListName] || [];
    return list[0] || "RELIANCE";
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [tradeSymbol, setTradeSymbol] = useState(null);
  const [chartModalSymbol, setChartModalSymbol] = useState(null);
  const searchInputRef = useRef(null);

  // Persist view mode
  useEffect(() => {
    localStorage.setItem("pulsehunter_watchlist_view_mode", viewMode);
  }, [viewMode]);

  // Persist watchlists
  useEffect(() => {
    localStorage.setItem("pulsehunter_watchlists_v2", JSON.stringify(watchlists));
    const activeSymbols = watchlists[activeListName] || [];
    localStorage.setItem("watchlist", JSON.stringify(activeSymbols));
  }, [watchlists, activeListName]);

  // Keyboard shortcut '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const activeSymbols = useMemo(() => {
    return watchlists[activeListName] || [];
  }, [watchlists, activeListName]);

  // Ensure selectedSymbol belongs to current list or updates
  useEffect(() => {
    if (activeSymbols.length > 0 && !activeSymbols.includes(selectedSymbol)) {
      setSelectedSymbol(activeSymbols[0]);
    }
  }, [activeListName, activeSymbols, selectedSymbol]);

  // Stock objects for currently watched symbols
  const watchedStockObjects = useMemo(() => {
    const map = new Map((stocks || []).map((s) => [s.symbol, s]));
    return activeSymbols.map((sym) => map.get(sym) || { symbol: sym, ltp: null, pct_change: 0 });
  }, [stocks, activeSymbols]);

  // Search results across all 210 stocks
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return (stocks || [])
      .filter(
        (s) =>
          s.symbol.toLowerCase().includes(q) ||
          (s.sector && s.sector.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [stocks, searchQuery]);

  const toggleStockInActiveList = (symbol) => {
    setWatchlists((prev) => {
      const currentList = prev[activeListName] || [];
      const updatedList = currentList.includes(symbol)
        ? currentList.filter((s) => s !== symbol)
        : [...currentList, symbol];
      return { ...prev, [activeListName]: updatedList };
    });
  };

  const handleCreateList = (e) => {
    e.preventDefault();
    const trimmed = newListName.trim();
    if (!trimmed || watchlists[trimmed]) return;
    setWatchlists((prev) => ({ ...prev, [trimmed]: [] }));
    setActiveListName(trimmed);
    setNewListName("");
    setIsAddingList(false);
  };

  const handleDeleteList = (nameToDelete) => {
    const listNames = Object.keys(watchlists);
    if (listNames.length <= 1) return;
    setWatchlists((prev) => {
      const copy = { ...prev };
      delete copy[nameToDelete];
      return copy;
    });
    const remaining = listNames.filter((n) => n !== nameToDelete);
    setActiveListName(remaining[0]);
  };

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-[1920px] w-full px-3 sm:px-6 py-4 space-y-4">
        {/* Top Control Bar: Watchlist Tabs & View Mode Switcher */}
        <div className="bg-surface2/70 border border-subtle/80 rounded-2xl p-3 sm:p-4 shadow-sm flex items-center justify-between flex-wrap gap-3">
          {/* Watchlist Tabs Strip */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {Object.keys(watchlists).map((name) => {
              const isActive = activeListName === name;
              const count = (watchlists[name] || []).length;
              return (
                <div key={name} className="relative group">
                  <button
                    onClick={() => setActiveListName(name)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                      isActive
                        ? "bg-blue-600/15 text-blue-400 border border-blue-500/40 shadow-sm font-bold"
                        : "bg-surface3/60 text-muted hover:text-primary hover:bg-surface3 border border-white/5"
                    }`}
                  >
                    <Bookmark size={12} className={isActive ? "text-blue-400" : "text-muted"} />
                    <span>{name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface4 text-faint">
                      {count}
                    </span>
                  </button>

                  {/* Delete button (when > 1 list) */}
                  {Object.keys(watchlists).length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteList(name);
                      }}
                      title="Delete Watchlist"
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-950 text-rose-400 border border-rose-800/60 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center text-[10px] cursor-pointer"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Create New List Button */}
            {isAddingList ? (
              <form onSubmit={handleCreateList} className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="List name..."
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  autoFocus
                  className="px-2.5 py-1 text-xs bg-surface3 border border-blue-500 rounded-lg text-primary focus:outline-none w-28"
                />
                <button
                  type="submit"
                  className="p-1 rounded bg-blue-600 text-white hover:bg-blue-500"
                >
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingList(false)}
                  className="p-1 rounded bg-surface3 text-muted hover:text-white"
                >
                  <X size={12} />
                </button>
              </form>
            ) : (
              <button
                onClick={() => setIsAddingList(true)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-surface3/40 hover:bg-surface3 text-muted hover:text-primary border border-white/5 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Create a new named watchlist"
              >
                <FolderPlus size={13} />
                <span className="hidden sm:inline">New List</span>
              </button>
            )}
          </div>

          {/* View Mode Toggle: Split View vs Grid View */}
          <div className="flex items-center gap-1 bg-[#10141e]/90 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setViewMode("split")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === "split"
                  ? "bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm font-bold"
                  : "text-muted hover:text-primary"
              }`}
            >
              <Columns size={13} />
              <span className="hidden sm:inline">Split View</span>
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm font-bold"
                  : "text-muted hover:text-primary"
              }`}
            >
              <LayoutGrid size={13} />
              <span className="hidden sm:inline">Card Grid</span>
            </button>
          </div>
        </div>

        {/* ── MODE A: PRO SPLIT-VIEW (DEFAULT) ─────────────────────────────────── */}
        {viewMode === "split" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Left Drawer (4 Cols / 340px) */}
            <div className="lg:col-span-4 xl:col-span-4 bg-surface2/60 border border-subtle/80 rounded-2xl p-3 shadow-sm space-y-3">
              {/* Universal Search & 1-Click Pin across 210 stocks */}
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search 210 stocks to pin... (Press '/' to focus)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-2 bg-surface3/80 border border-subtle rounded-xl text-xs text-primary placeholder:text-faint focus:outline-none focus:border-blue-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-primary"
                  >
                    <X size={13} />
                  </button>
                )}

                {/* Instant Search Dropdown Popover */}
                {searchQuery.trim() && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-surface2/95 border border-subtle rounded-xl shadow-2xl p-1.5 max-h-64 overflow-y-auto">
                    {searchResults.length > 0 ? (
                      searchResults.map((s) => {
                        const isPinned = activeSymbols.includes(s.symbol);
                        return (
                          <div
                            key={s.symbol}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-surface3/60 transition-colors"
                          >
                            <div>
                              <div className="text-xs font-bold text-primary">
                                {s.symbol}
                              </div>
                              <div className="text-[10px] text-faint">
                                {s.sector} · ₹{s.ltp ?? "—"}
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                toggleStockInActiveList(s.symbol);
                                setSearchQuery("");
                              }}
                              className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                isPinned
                                  ? "bg-rose-950 text-rose-400 border border-rose-800"
                                  : "bg-blue-600 text-white hover:bg-blue-500"
                              }`}
                            >
                              {isPinned ? "Unpin" : "+ Pin"}
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-3 text-center text-xs text-faint">
                        No stocks found matching "{searchQuery}"
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Stocks List in Active Watchlist */}
              <div className="space-y-1.5 max-h-[620px] overflow-y-auto pr-1">
                {watchedStockObjects.length > 0 ? (
                  watchedStockObjects.map((s) => {
                    const isSelected = selectedSymbol === s.symbol;
                    const isPositive = (s.pct_change || 0) >= 0;
                    return (
                      <div
                        key={s.symbol}
                        onClick={() => setSelectedSymbol(s.symbol)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? "bg-blue-600/15 border-blue-500/50 shadow-sm"
                            : "bg-surface3/40 border-subtle/60 hover:bg-surface3/80 hover:border-subtle"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isSelected ? "bg-blue-400" : "bg-transparent"
                            }`}
                          />
                          <div>
                            <div className="text-xs font-bold text-primary flex items-center gap-1.5">
                              <span>{s.symbol}</span>
                              {(s.day_range_pos || 50) >= 85 && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950/60 text-amber-400 font-bold">
                                  HOD
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-faint">
                              {s.sector || "Equity"}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="font-mono text-xs font-bold text-primary tabular-nums">
                              ₹{s.ltp ? s.ltp.toLocaleString("en-IN") : "—"}
                            </div>
                            <div
                              className={`text-[10px] font-bold tabular-nums ${
                                isPositive ? "text-bull" : "text-bear"
                              }`}
                            >
                              {isPositive ? "+" : ""}
                              {s.pct_change || 0}%
                            </div>
                          </div>

                          {/* Quick Remove Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStockInActiveList(s.symbol);
                            }}
                            title="Remove from list"
                            className="p-1 rounded text-faint hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-12 text-center text-xs text-faint space-y-1">
                    <Bookmark size={24} className="mx-auto text-faint opacity-50" />
                    <p className="font-semibold text-primary">No stocks in "{activeListName}"</p>
                    <p className="text-[11px]">Use the search bar above to pin any of the 210 stocks.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Detail Canvas (8 Cols) */}
            <div className="lg:col-span-8 xl:col-span-8 bg-surface2/60 border border-subtle/80 rounded-2xl p-4 shadow-sm min-h-[560px]">
              <WatchlistChartCanvas
                symbol={selectedSymbol}
                onTrade={(sym) => setTradeSymbol(sym)}
              />
            </div>
          </div>
        )}

        {/* ── MODE B: HIGH-DENSITY CARD GRID ───────────────────────────────────── */}
        {viewMode === "grid" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {watchedStockObjects.map((s) => {
              const isPositive = (s.pct_change || 0) >= 0;
              return (
                <div
                  key={s.symbol}
                  className="bg-surface2/70 border border-subtle/80 hover:border-blue-500/40 rounded-2xl p-3 shadow-sm hover:shadow-md transition-all space-y-2 group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-primary">{s.symbol}</h4>
                      <p className="text-[10px] text-faint">{s.sector || "Equity"}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold text-primary tabular-nums">
                        ₹{s.ltp ? s.ltp.toLocaleString("en-IN") : "—"}
                      </div>
                      <div
                        className={`text-[10px] font-bold tabular-nums ${
                          isPositive ? "text-bull" : "text-bear"
                        }`}
                      >
                        {isPositive ? "+" : ""}
                        {s.pct_change || 0}%
                      </div>
                    </div>
                  </div>

                  {/* Micro Candlestick / Range Bar */}
                  <div className="h-9 bg-surface3/40 rounded-lg p-0.5 flex items-center justify-center overflow-hidden">
                    {s.candles && s.candles.length > 0 ? (
                      <MiniCandlestick candles={s.candles} />
                    ) : (
                      <div className="w-full px-2">
                        <div className="flex justify-between text-[9px] text-faint font-mono mb-1">
                          <span>₹{s.today_low || "—"}</span>
                          <span>₹{s.today_high || "—"}</span>
                        </div>
                        <div className="h-1 bg-surface4 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${isPositive ? "bg-emerald-400" : "bg-rose-400"}`}
                            style={{ width: `${Math.min(100, Math.max(0, s.day_range_pos || 50))}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Shortcuts */}
                  <div className="flex items-center justify-between pt-1 border-t border-subtle/60 text-xs">
                    <button
                      onClick={() => setChartModalSymbol(s.symbol)}
                      className="text-[11px] font-semibold text-muted hover:text-blue-400 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <LineChart size={12} /> Chart
                    </button>
                    <button
                      onClick={() => setTradeSymbol(s.symbol)}
                      className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Rocket size={12} /> Trade
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Trade Modal */}
      {tradeSymbol && (
        <QuickTradeModal
          symbol={tradeSymbol}
          onClose={() => setTradeSymbol(null)}
        />
      )}

      {/* Fullscreen Chart Modal */}
      {chartModalSymbol && (
        <ChartModal
          symbol={chartModalSymbol}
          onClose={() => setChartModalSymbol(null)}
        />
      )}
    </div>
  );
}

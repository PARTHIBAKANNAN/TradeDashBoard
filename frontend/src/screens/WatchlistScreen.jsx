import React, { useState, useMemo, useEffect } from "react";
import { Search, Star, PlusCircle, FolderPlus, Trash2, Check, X } from "lucide-react";
import WatchlistRow from "../components/WatchlistRow.jsx";
import { useRecommendedStocks } from "../hooks/useRecommendedStocks.js";

const DEFAULT_WATCHLISTS = {
  "Core Focus": ["RELIANCE", "TCS", "HCLTECH", "INFY", "WIPRO"],
  "High Beta": ["HAVELLS", "ANGELONE", "DIXON", "POLYCAB"],
  "Breakouts": ["360ONE", "ABB", "COFORGE"],
};

export default function WatchlistScreen({ stocks, nifty }) {
  // Load named watchlists from localStorage
  const [watchlists, setWatchlists] = useState(() => {
    try {
      const saved = localStorage.getItem("pulsehunter_watchlists_v2");
      if (saved) return JSON.parse(saved);
      // Migrate legacy single watchlist if present
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

  const [searchTerm, setSearchTerm] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");

  // Persist whenever watchlists change
  useEffect(() => {
    localStorage.setItem("pulsehunter_watchlists_v2", JSON.stringify(watchlists));
    // sync back to legacy key for backwards compatibility with row star toggles
    const activeSymbols = watchlists[activeListName] || [];
    localStorage.setItem("watchlist", JSON.stringify(activeSymbols));
  }, [watchlists, activeListName]);

  const recommended = useRecommendedStocks(stocks, nifty?.pct_change || 0);

  const activeSymbols = useMemo(() => {
    return watchlists[activeListName] || [];
  }, [watchlists, activeListName]);

  // Filtered stocks in current active watchlist
  const watchlistStocks = useMemo(() => {
    return (stocks || []).filter(
      (stock) =>
        activeSymbols.includes(stock.symbol) &&
        (stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (stock.sector && stock.sector.toLowerCase().includes(searchTerm.toLowerCase())))
    );
  }, [stocks, activeSymbols, searchTerm]);

  // Global search across all 210 stocks
  const globalSearchResults = useMemo(() => {
    if (!globalSearch.trim()) return [];
    const term = globalSearch.toLowerCase().trim();
    return (stocks || [])
      .filter(
        (s) =>
          s.symbol.toLowerCase().includes(term) ||
          (s.sector && s.sector.toLowerCase().includes(term))
      )
      .slice(0, 15);
  }, [stocks, globalSearch]);

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
    if (listNames.length <= 1) {
      alert("You must keep at least one watchlist.");
      return;
    }
    if (!window.confirm(`Delete watchlist "${nameToDelete}"?`)) return;
    setWatchlists((prev) => {
      const copy = { ...prev };
      delete copy[nameToDelete];
      return copy;
    });
    if (activeListName === nameToDelete) {
      const remaining = listNames.filter((n) => n !== nameToDelete);
      setActiveListName(remaining[0]);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-[1920px] w-full px-3 sm:px-6 py-4 space-y-4">
        {/* Header & Watchlist Tabs */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="grid place-items-center w-8 h-8 rounded-lg bg-accent-amber/15 text-accent-amber border border-accent-amber/30">
                <Star size={16} fill="currentColor" />
              </span>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-primary font-display flex items-center gap-2">
                  Multi-Watchlists
                  <span className="text-[10px] font-mono text-muted bg-surface3 px-2 py-0.5 rounded-full">
                    210 NSE Stocks
                  </span>
                </h2>
              </div>
            </div>

            {/* List Pills Bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {Object.keys(watchlists).map((name) => {
                const isActive = activeListName === name;
                const count = watchlists[name]?.length || 0;
                return (
                  <div
                    key={name}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                      isActive
                        ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/40 shadow-sm"
                        : "bg-surface2 text-muted hover:text-primary border border-subtle"
                    }`}
                    onClick={() => setActiveListName(name)}
                  >
                    <span>{name}</span>
                    <span className="text-[10px] opacity-75 font-mono">({count})</span>
                    {isActive && Object.keys(watchlists).length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteList(name);
                        }}
                        className="ml-1 text-faint hover:text-rose-400"
                        title="Delete this watchlist"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                );
              })}

              {isAddingList ? (
                <form onSubmit={handleCreateList} className="flex items-center gap-1">
                  <input
                    type="text"
                    placeholder="List name..."
                    autoFocus
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    className="bg-surface3 border border-accent-blue px-2 py-1 text-xs text-primary rounded-lg focus:outline-none w-28"
                  />
                  <button type="submit" className="text-emerald-400 hover:text-emerald-300 p-1">
                    <Check size={13} />
                  </button>
                  <button type="button" onClick={() => setIsAddingList(false)} className="text-faint hover:text-primary p-1">
                    <X size={13} />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingList(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-surface3/60 text-muted hover:text-primary border border-subtle transition-all"
                  title="Create new named watchlist"
                >
                  <FolderPlus size={13} />
                  <span className="hidden sm:inline">New List</span>
                </button>
              )}
            </div>
          </div>

          {/* Search Row: Filter Active List + Universal 210 Stock Search */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            <div className="md:col-span-6 relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
              <input
                type="text"
                placeholder={`Search in ${activeListName} (${watchlistStocks.length} stocks)...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-surface2/80 border border-subtle rounded-xl pl-9 pr-4 py-2 text-xs text-primary placeholder-faint focus:outline-none focus:border-accent-blue transition-colors"
              />
            </div>

            <div className="md:col-span-6 relative">
              <PlusCircle size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-accent-blue" />
              <input
                type="text"
                placeholder="Find & Pin any of 210 stocks (e.g. HCLTECH, TCS, SBIN)..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="w-full bg-surface2/80 border border-accent-blue/30 rounded-xl pl-9 pr-4 py-2 text-xs text-primary placeholder-faint focus:outline-none focus:border-accent-blue transition-colors"
              />

              {/* Fast Popover for Universal Search */}
              {globalSearchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-surface2/95 backdrop-blur-xl border border-subtle rounded-xl shadow-2xl p-2 z-50 max-h-60 overflow-y-auto space-y-1">
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wider px-2 py-1 flex justify-between">
                    <span>Matches in 210 Stock Universe</span>
                    <button onClick={() => setGlobalSearch("")} className="text-faint hover:text-primary">Close</button>
                  </div>
                  {globalSearchResults.map((stock) => {
                    const isPinned = activeSymbols.includes(stock.symbol);
                    return (
                      <div
                        key={stock.symbol}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-surface3 transition-colors text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-primary">{stock.symbol}</span>
                          <span className="text-[10px] text-faint">{stock.sector}</span>
                          <span className="font-mono text-primary">₹{stock.ltp}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleStockInActiveList(stock.symbol)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                            isPinned
                              ? "bg-rose-950/60 text-rose-400 border border-rose-800/60 hover:bg-rose-900"
                              : "bg-accent-blue/15 text-accent-blue border border-accent-blue/40 hover:bg-accent-blue/30"
                          }`}
                        >
                          {isPinned ? "Unpin" : "+ Pin"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Watchlist Table */}
        <div className="bg-surface2/70 backdrop-blur-xl border border-subtle rounded-xl overflow-hidden shadow-card">
          {watchlistStocks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="hidden md:table-header-group">
                  <tr className="bg-surface3/60 border-b border-subtle">
                    <th className="py-2.5 px-3 text-[10px] uppercase font-bold text-muted tracking-wider w-8" />
                    <th className="py-2.5 px-3 text-[10px] uppercase font-bold text-muted tracking-wider">
                      Stock
                    </th>
                    <th className="py-2.5 px-3 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                      LTP
                    </th>
                    <th className="py-2.5 px-3 text-[10px] uppercase font-bold text-muted tracking-wider text-center">
                      Day Range
                    </th>
                    <th className="py-2.5 px-3 text-[10px] uppercase font-bold text-muted tracking-wider text-center">
                      Signal
                    </th>
                    <th className="py-2.5 px-3 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                      RS vs NIFTY
                    </th>
                    <th className="py-2.5 px-3 text-[10px] uppercase font-bold text-muted tracking-wider text-center">
                      Trade
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {watchlistStocks.map((stock, i) => (
                    <WatchlistRow
                      key={stock.symbol}
                      stock={stock}
                      index={i}
                      niftyPctChange={nifty?.pct_change || 0}
                      isRecommended={recommended.includes(stock.symbol)}
                      leading={
                        <button
                          onClick={() => toggleStockInActiveList(stock.symbol)}
                          className="text-accent-amber hover:scale-110 transition-transform"
                          title="Unpin from this watchlist"
                        >
                          <Star size={15} fill="currentColor" />
                        </button>
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center">
              <Star size={28} className="mx-auto mb-2 text-faint" />
              <p className="text-primary text-xs font-semibold mb-1">
                "{activeListName}" has no stocks yet.
              </p>
              <p className="text-faint text-[11px]">
                Use the search box above to pin any of the 210 stocks to this list.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

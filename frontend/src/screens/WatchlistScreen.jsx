import React, { useState, useMemo } from "react";
import { Search, Star, PlusCircle } from "lucide-react";
import WatchlistRow from "../components/WatchlistRow.jsx";

export default function WatchlistScreen({ stocks }) {
  const [watchlist, setWatchlist] = useState(
    JSON.parse(localStorage.getItem("watchlist") || "[]"),
  );
  const [searchTerm, setSearchTerm] = useState("");

  const watchlistStocks = useMemo(() => {
    return (stocks || []).filter(
      (stock) =>
        watchlist.includes(stock.symbol) &&
        stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [stocks, watchlist, searchTerm]);

  const toggleWatchlist = (symbol) => {
    const updated = watchlist.includes(symbol)
      ? watchlist.filter((s) => s !== symbol)
      : [...watchlist, symbol];
    setWatchlist(updated);
    localStorage.setItem("watchlist", JSON.stringify(updated));
  };

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="grid place-items-center w-9 h-9 rounded-lg bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
              <Star size={17} />
            </span>
            <h2 className="text-lg font-bold text-primary font-display">
              My Watchlist
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                type="text"
                placeholder="Search watchlist..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-surface2/70 backdrop-blur-xl border border-subtle rounded-lg pl-9 pr-4 py-2.5 text-sm text-primary placeholder-faint focus:outline-none focus:border-accent-blue transition-colors"
              />
            </div>
            <div className="text-sm font-semibold text-muted whitespace-nowrap">
              {watchlistStocks.length} stocks
            </div>
          </div>
        </div>

        {/* Watchlist Table */}
        <div className="bg-surface2/70 backdrop-blur-xl border border-subtle rounded-xl overflow-hidden shadow-card">
          {watchlistStocks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface3/60 border-b border-subtle">
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider w-8" />
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
                  {watchlistStocks.map((stock, i) => (
                    <WatchlistRow
                      key={stock.symbol}
                      stock={stock}
                      index={i}
                      leading={
                        <button
                          onClick={() => toggleWatchlist(stock.symbol)}
                          className="text-accent-amber hover:scale-110 transition-transform"
                          title="Remove from watchlist"
                        >
                          <Star size={16} fill="currentColor" />
                        </button>
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-14 text-center">
              <Star size={32} className="mx-auto mb-3 text-faint" />
              <p className="text-faint text-sm mb-1">Your watchlist is empty</p>
              <p className="text-faint text-xs">
                Add stocks below, or from the Ranking / Heatmap tabs
              </p>
            </div>
          )}
        </div>

        {/* All Stocks - Add to Watchlist */}
        <div className="mt-8">
          <h3 className="flex items-center gap-2 text-sm font-bold text-primary mb-4">
            <PlusCircle size={14} className="text-accent-blue" />
            Add stocks to your watchlist
          </h3>
          <div className="bg-surface2/70 backdrop-blur-xl border border-subtle rounded-xl overflow-hidden shadow-card">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface3/60 border-b border-subtle sticky top-0">
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider w-8" />
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider">
                      Stock
                    </th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                      LTP
                    </th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">
                      Change %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(stocks || [])
                    .slice()
                    .sort(
                      (a, b) => Math.abs(b.pct_change) - Math.abs(a.pct_change),
                    )
                    .slice(0, 20)
                    .map((stock) => {
                      const isWatched = watchlist.includes(stock.symbol);
                      const isPositive = stock.pct_change >= 0;
                      return (
                        <tr
                          key={stock.symbol}
                          className="border-b border-subtle/70 hover:bg-surface3/40 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <button
                              onClick={() => toggleWatchlist(stock.symbol)}
                              className={`transition-all hover:scale-110 ${
                                isWatched
                                  ? "text-accent-amber"
                                  : "text-faint hover:text-accent-amber"
                              }`}
                              title={
                                isWatched
                                  ? "Remove from watchlist"
                                  : "Add to watchlist"
                              }
                            >
                              <Star
                                size={16}
                                fill={isWatched ? "currentColor" : "none"}
                              />
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-sm font-semibold text-primary">
                              {stock.symbol}
                            </div>
                            <div className="text-xs text-faint">
                              {stock.sector}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="text-sm font-mono text-primary tabular-nums">
                              ₹
                              {stock.ltp?.toLocaleString("en-IN", {
                                maximumFractionDigits: 2,
                              })}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`text-sm font-semibold tabular-nums ${
                                isPositive ? "text-bull" : "text-bear"
                              }`}
                            >
                              {isPositive ? "+" : ""}
                              {stock.pct_change}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

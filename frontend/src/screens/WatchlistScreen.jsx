import React, { useState, useMemo } from "react";
import WatchlistRow from "../components/WatchlistRow.jsx";

export default function WatchlistScreen({ stocks }) {
  const [watchlist, setWatchlist] = useState(
    JSON.parse(localStorage.getItem("watchlist") || "[]")
  );
  const [searchTerm, setSearchTerm] = useState("");

  const watchlistStocks = useMemo(() => {
    return (stocks || []).filter(
      (stock) =>
        watchlist.includes(stock.symbol) &&
        stock.symbol.toLowerCase().includes(searchTerm.toLowerCase())
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
          <h2 className="text-lg font-bold text-primary mb-4">My Watchlist</h2>
          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="Search watchlist..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-surface2/80 border border-subtle rounded-lg px-4 py-2.5 text-sm text-primary placeholder-faint focus:outline-none focus:border-accent-blue"
            />
            <div className="text-sm font-semibold text-muted">
              {watchlistStocks.length} stocks
            </div>
          </div>
        </div>

        {/* Watchlist Table */}
        <div className="bg-surface2/80 backdrop-blur-xl border border-subtle rounded-lg overflow-hidden">
          {watchlistStocks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface3/50 border-b border-subtle">
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider w-8"></th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider">Stock</th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">LTP</th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">Price Range</th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">Signal</th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">RS vs NIFTY</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlistStocks.map((stock) => (
                    <tr key={stock.symbol} className="border-b border-subtle/50 hover:bg-surface3/20 transition-colors">
                      <td className="py-3 px-4">
                        <button
                          onClick={() => toggleWatchlist(stock.symbol)}
                          className="text-lg transition-colors hover:scale-110"
                          title="Remove from watchlist"
                        >
                          ⭐
                        </button>
                      </td>
                      <td colSpan="5">
                        <WatchlistRow stock={stock} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center">
              <div className="text-4xl mb-3">⭐</div>
              <p className="text-faint text-sm mb-3">Your watchlist is empty</p>
              <p className="text-faint text-xs">
                Go to Ranking or Heatmap and add stocks to your watchlist
              </p>
            </div>
          )}
        </div>

        {/* All Stocks - Add to Watchlist */}
        <div className="mt-8">
          <h3 className="text-sm font-bold text-primary mb-4">Add stocks to your watchlist</h3>
          <div className="bg-surface2/80 backdrop-blur-xl border border-subtle rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface3/50 border-b border-subtle">
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider w-8"></th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider">Stock</th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">LTP</th>
                    <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">Change %</th>
                  </tr>
                </thead>
                <tbody>
                  {(stocks || [])
                    .sort((a, b) => Math.abs(b.pct_change) - Math.abs(a.pct_change))
                    .slice(0, 20)
                    .map((stock) => (
                      <tr
                        key={stock.symbol}
                        className="border-b border-subtle/50 hover:bg-surface3/20 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <button
                            onClick={() => toggleWatchlist(stock.symbol)}
                            className={`text-lg transition-colors hover:scale-110 ${
                              watchlist.includes(stock.symbol)
                                ? "opacity-100"
                                : "opacity-40 hover:opacity-70"
                            }`}
                            title={
                              watchlist.includes(stock.symbol)
                                ? "Remove from watchlist"
                                : "Add to watchlist"
                            }
                          >
                            ⭐
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm font-semibold text-primary">{stock.symbol}</div>
                          <div className="text-xs text-faint">{stock.sector}</div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="text-sm font-mono text-primary">
                            ₹{stock.ltp?.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`text-sm font-semibold ${
                              stock.pct_change >= 0 ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {stock.pct_change >= 0 ? "+" : ""}
                            {stock.pct_change}%
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

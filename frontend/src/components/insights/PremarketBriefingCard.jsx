import React, { useEffect, useState } from "react";

export default function PremarketBriefingCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchBriefing() {
    try {
      setLoading(true);
      const res = await fetch("/api/ai/premarket-briefing", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.warn("Failed to fetch premarket briefing", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    try {
      setRefreshing(true);
      const res = await fetch("/api/ai/premarket-briefing/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.warn("Failed to refresh premarket briefing", err);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchBriefing();
  }, []);

  if (!data && loading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 animate-pulse">
        <div className="h-4 bg-surface-raised w-1/3 rounded mb-2" />
        <div className="h-3 bg-surface-raised w-2/3 rounded" />
      </div>
    );
  }

  if (!data) return null;

  const bias = data.bias || "NEUTRAL";
  const biasBadgeColor =
    bias === "BULLISH"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
      : bias === "BEARISH"
      ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
      : "bg-amber-500/10 text-amber-400 border-amber-500/30";

  return (
    <div className="bg-surface border border-border rounded-xl p-4 shadow-sm space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🌐</span>
          <h3 className="font-semibold text-sm tracking-wide text-text">
            Pre-Market Global Intelligence & News Catalysts
          </h3>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${biasBadgeColor}`}
          >
            {bias} BIAS
          </span>
          {data.is_grounded && (
            <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">
              ⚡ Google Search Grounded
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-text-muted">Updated: {data.updated_at || data.date}</span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-xs px-2.5 py-1 bg-surface-raised hover:bg-surface-border border border-border rounded-lg text-text-muted hover:text-text transition disabled:opacity-50"
            title="Re-run Google Search scan"
          >
            {refreshing ? "Refreshing..." : "↻ Scan News"}
          </button>
        </div>
      </div>

      {/* Summary */}
      <p className="text-xs text-text leading-relaxed bg-surface-raised/40 p-3 rounded-lg border border-border/50">
        {data.summary}
      </p>

      {/* Sector Outlook Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {/* Leading Sectors */}
        <div className="bg-surface-raised/30 border border-emerald-500/20 rounded-lg p-2.5">
          <span className="font-medium text-emerald-400 block mb-1.5">
            🟢 Expected Leading Sectors:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(data.leading_sectors || data.sector_focus || []).map((sec, idx) => (
              <span
                key={idx}
                className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded text-[11px]"
              >
                {sec}
              </span>
            ))}
            {(!data.leading_sectors || data.leading_sectors.length === 0) && (
              <span className="text-text-muted text-[11px]">No specific sector leader flagged</span>
            )}
          </div>
        </div>

        {/* Lagging Sectors */}
        <div className="bg-surface-raised/30 border border-rose-500/20 rounded-lg p-2.5">
          <span className="font-medium text-rose-400 block mb-1.5">
            🔴 Expected Drag / Lagging Sectors:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(data.lagging_sectors || []).map((sec, idx) => (
              <span
                key={idx}
                className="bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2 py-0.5 rounded text-[11px]"
              >
                {sec}
              </span>
            ))}
            {(!data.lagging_sectors || data.lagging_sectors.length === 0) && (
              <span className="text-text-muted text-[11px]">No sector drag flagged</span>
            )}
          </div>
        </div>
      </div>

      {/* Specific High-Impact Focus Stocks */}
      {data.focus_stocks && data.focus_stocks.length > 0 && (
        <div className="border-t border-border/50 pt-2.5">
          <span className="text-xs font-semibold text-text block mb-2">
            🎯 High-Impact Stock Catalysts to Watch:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {data.focus_stocks.map((item, idx) => {
              const isBull = item.bias?.toUpperCase() === "BULLISH";
              return (
                <div
                  key={idx}
                  className={`p-2 rounded-lg border text-xs ${
                    isBull
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : "bg-rose-500/5 border-rose-500/20"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-text">{item.symbol}</span>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                        isBull
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-rose-500/20 text-rose-400"
                      }`}
                    >
                      {item.bias}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted leading-tight">{item.catalyst}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Key Risks */}
      {data.key_risks && data.key_risks.length > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-text-muted border-t border-border/40 pt-2">
          <span className="font-medium text-amber-400">⚠️ Key Watch Items:</span>
          <span>{data.key_risks.join(" • ")}</span>
        </div>
      )}
    </div>
  );
}

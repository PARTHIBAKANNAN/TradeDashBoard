import React, { useEffect, useState } from "react";
import {
  Globe,
  Flame,
  ShieldAlert,
  Target,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Layers,
} from "lucide-react";

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
      <div className="bg-surface border border-subtle rounded-2xl p-5 animate-pulse space-y-3">
        <div className="h-5 bg-surface3 w-1/3 rounded-lg" />
        <div className="h-4 bg-surface3 w-2/3 rounded-lg" />
      </div>
    );
  }

  if (!data) return null;

  const bias = data.bias || "NEUTRAL";
  const biasBadgeColor =
    bias === "BULLISH"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : bias === "BEARISH"
      ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
      : "bg-amber-500/15 text-amber-400 border-amber-500/30";

  const cues = data.global_cues || {};
  const policyWatch = data.policy_and_macro_watch || [];

  return (
    <div className="bg-surface border border-subtle rounded-2xl p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent-blue/20 to-accent-violet/20 grid place-items-center text-accent-blue border border-accent-blue/30">
            <Globe size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm tracking-tight text-primary">
                Multi-Stream Global Intelligence & Macro Catalysts
              </h3>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${biasBadgeColor}`}
              >
                {bias} BIAS
              </span>
            </div>
            <p className="text-[11px] text-faint">
              Real-time Global Tech, Commodities, Tariffs/SEBI & Indian Corporate Action Wire
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] text-muted font-mono">
            {data.updated_at || data.date}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-surface3 hover:bg-surface4 border border-strong rounded-xl text-primary transition disabled:opacity-50"
            title="Re-run live multi-stream wire scan"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Scanning Wires..." : "↻ Scan Wires"}
          </button>
        </div>
      </div>

      {/* Global Macro Cues Bar */}
      {(cues.gift_nifty || cues.us_markets || cues.crude_oil || cues.gold_commodities) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-[11px] font-mono">
          {cues.gift_nifty && (
            <div className="bg-surface2/60 border border-subtle rounded-xl p-2.5">
              <span className="text-[9px] uppercase font-bold text-faint block">
                Gift Nifty Indication
              </span>
              <span className="font-bold text-primary truncate block">
                {cues.gift_nifty}
              </span>
            </div>
          )}
          {cues.us_markets && (
            <div className="bg-surface2/60 border border-subtle rounded-xl p-2.5">
              <span className="text-[9px] uppercase font-bold text-faint block">
                US & Tech Sentiment
              </span>
              <span className="font-bold text-primary truncate block">
                {cues.us_markets}
              </span>
            </div>
          )}
          {cues.crude_oil && (
            <div className="bg-surface2/60 border border-subtle rounded-xl p-2.5">
              <span className="text-[9px] uppercase font-bold text-faint block">
                Brent Crude Oil
              </span>
              <span className="font-bold text-primary truncate block">
                {cues.crude_oil}
              </span>
            </div>
          )}
          {cues.gold_commodities && (
            <div className="bg-surface2/60 border border-subtle rounded-xl p-2.5">
              <span className="text-[9px] uppercase font-bold text-faint block">
                Gold & Commodities
              </span>
              <span className="font-bold text-primary truncate block">
                {cues.gold_commodities}
              </span>
            </div>
          )}
          {cues.dollar_index && (
            <div className="bg-surface2/60 border border-subtle rounded-xl p-2.5">
              <span className="text-[9px] uppercase font-bold text-faint block">
                Dollar DXY / FX
              </span>
              <span className="font-bold text-primary truncate block">
                {cues.dollar_index}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      <p className="text-xs text-primary leading-relaxed bg-surface2/40 p-3.5 rounded-xl border border-subtle">
        {data.summary}
      </p>

      {/* Policy, Tariffs & Geopolitics Watch */}
      {policyWatch.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
          <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5 mb-1.5">
            <ShieldAlert size={13} />
            Policy, Tariffs & Macro Watch:
          </span>
          <div className="space-y-1">
            {policyWatch.map((item, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-xs text-muted">
                <span className="text-amber-400">•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sector Outlook Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {/* Leading Sectors */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
          <span className="font-bold text-emerald-400 flex items-center gap-1.5 mb-2">
            <TrendingUp size={13} />
            Leading Sectors:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(data.leading_sectors || data.sector_focus || []).map((sec, idx) => (
              <span
                key={idx}
                className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg text-[11px] font-medium"
              >
                {sec}
              </span>
            ))}
            {(!data.leading_sectors || data.leading_sectors.length === 0) && (
              <span className="text-faint text-[11px]">No specific sector leader flagged</span>
            )}
          </div>
        </div>

        {/* Lagging Sectors */}
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3">
          <span className="font-bold text-rose-400 flex items-center gap-1.5 mb-2">
            <TrendingDown size={13} />
            Lagging / Drag Sectors:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(data.lagging_sectors || []).map((sec, idx) => (
              <span
                key={idx}
                className="bg-rose-500/10 text-rose-300 border border-rose-500/30 px-2.5 py-0.5 rounded-lg text-[11px] font-medium"
              >
                {sec}
              </span>
            ))}
            {(!data.lagging_sectors || data.lagging_sectors.length === 0) && (
              <span className="text-faint text-[11px]">No sector drag flagged</span>
            )}
          </div>
        </div>
      </div>

      {/* Specific High-Impact Focus Stocks */}
      {data.focus_stocks && data.focus_stocks.length > 0 && (
        <div className="border-t border-subtle pt-3">
          <span className="text-xs font-bold text-primary flex items-center gap-1.5 mb-2.5">
            <Target size={14} className="text-accent-blue" />
            Thematic Focus Stocks & Catalyst Drivers:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {data.focus_stocks.map((item, idx) => {
              const isBull = item.bias?.toUpperCase() === "BULLISH";
              return (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border text-xs transition-all ${
                    isBull
                      ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40"
                      : "bg-rose-500/5 border-rose-500/20 hover:border-rose-500/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-primary font-mono">{item.symbol}</span>
                      {item.theme && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-surface3 border border-subtle text-faint font-semibold">
                          {item.theme}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        isBull
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-rose-500/20 text-rose-400"
                      }`}
                    >
                      {item.bias}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">{item.catalyst}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Key Risks */}
      {data.key_risks && data.key_risks.length > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-muted border-t border-subtle pt-2.5">
          <span className="font-bold text-amber-400">⚠️ Key Risks:</span>
          <span>{data.key_risks.join(" • ")}</span>
        </div>
      )}
    </div>
  );
}

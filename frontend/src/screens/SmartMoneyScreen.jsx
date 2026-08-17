import React, { useEffect, useState } from "react";
import { Brain, Info, LineChart, RefreshCw, Rocket } from "lucide-react";
import ChartModal from "../components/ChartModal.jsx";
import QuickTradeModal from "../components/paper-trading/QuickTradeModal.jsx";

const POLL_INTERVAL_MS = 30_000;

function fmtRatio(v) {
  if (v == null) return "—";
  return `${v.toFixed(2)}x`;
}

function fmtSigned(v) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function ScoreBar({ score }) {
  const pct = Math.max(0, Math.min(100, score));
  const color =
    pct >= 70 ? "bg-bull" : pct >= 40 ? "bg-accent-amber" : "bg-bear";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-surface3 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs font-bold text-primary tabular-nums">
        {score.toFixed(1)}
      </span>
    </div>
  );
}

export default function SmartMoneyScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Modal state — one state variable drives both modals; null = closed.
  const [chartSymbol, setChartSymbol] = useState(null);
  const [tradeSymbol, setTradeSymbol] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/smart-money/top10", { credentials: "include" })
        .then((r) => {
          if (!r.ok) throw new Error(`Request failed (${r.status})`);
          return r.json();
        })
        .then((j) => {
          if (!cancelled) {
            setData(j);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    };
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const lookback = data?.lookback_days ?? 20;
  const minDays = data?.min_history_days ?? 3;
  const buildingHistory = (data?.eligible_symbols ?? 0) === 0;

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-accent-blue" />
            <h1 className="text-sm font-bold text-primary">
              Smart Money — Pre-Breakout Ranking
            </h1>
          </div>
          {data?.computed_at && (
            <div className="text-[11px] text-faint flex items-center gap-1.5">
              <RefreshCw size={11} />
              Updated{" "}
              {new Date(data.computed_at).toLocaleTimeString("en-IN", {
                hour12: false,
              })}
            </div>
          )}
        </div>

        <div className="mb-4 flex items-start gap-2 rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-4 py-3 text-xs text-primary">
          <Info size={14} className="text-accent-blue flex-shrink-0 mt-0.5" />
          <div>
            Ranks the F&amp;O universe every 5 minutes on Fresh Turnover Ratio
            (50%), RVOL (30%) and Relative Strength vs NIFTY (20%) — each
            stock's turnover/volume compared against its own last {lookback}{" "}
            trading days in the same 5-min slot.{" "}
            <b>This is a watchlist filter, not a trade signal</b> — enter only
            when your own technical trigger (ORB, PDH, etc.) fires on a stock
            that shows up here.
            {buildingHistory && (
              <div className="mt-1.5 text-accent-amber font-semibold">
                Building history: candle_history only started recording on
                2026-08-06, so most/all stocks are still below the {minDays}-day
                minimum needed for a reliable ratio. Rankings will start
                appearing as more trading days accumulate (fully warmed up after{" "}
                {lookback} trading days).
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-bear/30 bg-bear/10 px-4 py-3 text-xs text-bear">
            Couldn't load rankings: {error}
          </div>
        )}

        <div className="bg-surface2/70 backdrop-blur-xl border border-subtle rounded-xl overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface3/60 border-b border-subtle">
                  <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider">
                    #
                  </th>
                  <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider">
                    Stock
                  </th>
                  <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider">
                    Score
                  </th>
                  <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                    Fresh Turnover
                  </th>
                  <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                    RVOL
                  </th>
                  <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-right">
                    RS vs NIFTY
                  </th>
                  <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">
                    History
                  </th>
                  {/* Chart + Trade action buttons */}
                  <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">
                    Chart
                  </th>
                  <th className="py-3 px-4 text-[10px] uppercase font-bold text-muted tracking-wider text-center">
                    Trade
                  </th>
                </tr>
              </thead>
              <tbody>
                {(data?.top || []).map((row, i) => (
                  <tr
                    key={row.symbol}
                    className="border-b border-subtle/70 hover:bg-surface3/40 transition-colors"
                  >
                    <td className="py-3 px-4 text-faint font-mono text-xs">
                      {i + 1}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-primary">{row.symbol}</div>
                      <div className="text-[11px] text-faint">{row.sector}</div>
                    </td>
                    <td className="py-3 px-4">
                      <ScoreBar score={row.score} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                      {fmtRatio(row.fresh_turnover_ratio)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                      {fmtRatio(row.rvol)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono text-xs font-bold tabular-nums ${
                        row.relative_strength >= 0 ? "text-bull" : "text-bear"
                      }`}
                    >
                      {fmtSigned(row.relative_strength)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] font-mono text-faint">
                        {row.days_history}/{lookback}d
                      </span>
                    </td>

                    {/* Chart button — opens ChartModal inline */}
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setChartSymbol(row.symbol)}
                        title="View chart"
                        className="inline-flex items-center rounded-lg border border-subtle bg-surface3 p-1.5 text-muted hover:text-accent-blue hover:border-accent-blue/40 transition-colors"
                      >
                        <LineChart size={13} />
                      </button>
                    </td>

                    {/* Trade button — opens QuickTradeModal */}
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setTradeSymbol(row.symbol)}
                        title="Quick trade"
                        className="inline-flex items-center rounded-lg border border-subtle bg-surface3 p-1.5 text-muted hover:text-bull hover:border-bull/40 transition-colors"
                      >
                        <Rocket size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(data?.top || []).length === 0 && !error && (
            <div className="py-12 text-center text-faint text-sm">
              {buildingHistory
                ? "No stocks have enough history yet — check back after a few trading days."
                : "No eligible stocks right now."}
            </div>
          )}
        </div>
      </div>

      {/* Chart modal — portalled, full-screen */}
      {chartSymbol && (
        <ChartModal
          symbol={chartSymbol}
          onClose={() => setChartSymbol(null)}
        />
      )}

      {/* Quick Trade modal — portalled, scrollable */}
      <QuickTradeModal
        symbol={tradeSymbol}
        onClose={() => setTradeSymbol(null)}
      />
    </div>
  );
}

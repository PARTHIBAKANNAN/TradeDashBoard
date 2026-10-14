import React, { useMemo, useState } from "react";
import {
  PieChart,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  ShieldCheck,
  Building2,
  SlidersHorizontal,
  Award,
  Layers,
} from "lucide-react";

function formatMoney(v) {
  const n = Number(v) || 0;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function TradesAnalyticsCard({ orders = [], stocks = [] }) {
  const [selectedView, setSelectedView] = useState("sector"); // "sector" | "strategy" | "symbols"

  // Stock lookup map for sector resolution
  const stockMap = useMemo(() => {
    const map = {};
    (stocks || []).forEach((s) => {
      map[s.symbol] = s;
    });
    return map;
  }, [stocks]);

  // Analytics Computation
  const stats = useMemo(() => {
    const closed = (orders || []).filter((o) => o.status === "CLOSED");
    if (!closed.length) {
      return {
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        grossProfit: 0,
        grossLoss: 0,
        profitFactor: 0,
        netPnl: 0,
        avgTradePnl: 0,
        sectorBreakdown: {},
        strategyBreakdown: {},
        symbolBreakdown: {},
        rDistribution: { target: 0, partial: 0, breakeven: 0, sl: 0 },
      };
    }

    let winCount = 0;
    let lossCount = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let netPnl = 0;

    const sectorBreakdown = {};
    const strategyBreakdown = {};
    const symbolBreakdown = {};
    const rDistribution = { target: 0, partial: 0, breakeven: 0, sl: 0 };

    closed.forEach((o) => {
      const pnl = Number(o.realized_pnl) || 0;
      const net = Number(o.net_pnl ?? o.realized_pnl) || 0;
      netPnl += net;

      if (pnl > 0) {
        winCount++;
        grossProfit += pnl;
      } else if (pnl < 0) {
        lossCount++;
        grossLoss += Math.abs(pnl);
      }

      // R-Multiple Bucketing
      const entry = Number(o.entry_price) || 0;
      const sl = Number(o.sl_price) || 0;
      const risk = Math.abs(entry - sl);
      if (risk > 0) {
        const rRatio = pnl / (risk * Number(o.quantity || 1));
        if (rRatio >= 2.0) rDistribution.target++;
        else if (rRatio >= 0.8) rDistribution.partial++;
        else if (rRatio > -0.2 && rRatio < 0.2) rDistribution.breakeven++;
        else rDistribution.sl++;
      } else {
        if (pnl > 0) rDistribution.target++;
        else rDistribution.sl++;
      }

      // Sector Resolution
      const sec = stockMap[o.symbol]?.sector || "OTHER";
      if (!sectorBreakdown[sec]) {
        sectorBreakdown[sec] = {
          count: 0,
          wins: 0,
          netPnl: 0,
          grossProfit: 0,
          grossLoss: 0,
        };
      }
      sectorBreakdown[sec].count++;
      if (pnl > 0) sectorBreakdown[sec].wins++;
      sectorBreakdown[sec].netPnl += net;

      // Strategy Resolution from Notes
      let strat = "MANUAL";
      const notes = (o.notes || "").toUpperCase();
      if (
        notes.includes("ORB") ||
        notes.includes("C0.5") ||
        notes.includes("C1") ||
        notes.includes("C2")
      ) {
        strat = "ORB Breakout & Retest";
      } else if (notes.includes("VWAP")) {
        strat = "Institutional VWAP Absorption";
      } else if (notes.includes("OI SQUEEZE") || notes.includes("OI")) {
        strat = "Futures Delta-OI Squeeze";
      } else if (notes.includes("SQUEEZE")) {
        strat = "Volatility Squeeze Expansion";
      } else if (notes.includes("AI_COPILOT")) {
        strat = "AI Copilot Quant Signal";
      }

      if (!strategyBreakdown[strat]) {
        strategyBreakdown[strat] = { count: 0, wins: 0, netPnl: 0 };
      }
      strategyBreakdown[strat].count++;
      if (pnl > 0) strategyBreakdown[strat].wins++;
      strategyBreakdown[strat].netPnl += net;

      // Symbol Resolution
      if (!symbolBreakdown[o.symbol]) {
        symbolBreakdown[o.symbol] = {
          count: 0,
          wins: 0,
          netPnl: 0,
          sector: sec,
        };
      }
      symbolBreakdown[o.symbol].count++;
      if (pnl > 0) symbolBreakdown[o.symbol].wins++;
      symbolBreakdown[o.symbol].netPnl += net;
    });

    const totalTrades = closed.length;
    const winRate = totalTrades
      ? Math.round((winCount / totalTrades) * 100)
      : 0;
    const profitFactor =
      grossLoss > 0
        ? Number((grossProfit / grossLoss).toFixed(2))
        : grossProfit > 0
          ? 99.9
          : 0;
    const avgTradePnl = totalTrades ? Math.round(netPnl / totalTrades) : 0;

    return {
      totalTrades,
      winCount,
      lossCount,
      winRate,
      grossProfit,
      grossLoss,
      profitFactor,
      netPnl,
      avgTradePnl,
      sectorBreakdown,
      strategyBreakdown,
      symbolBreakdown,
      rDistribution,
    };
  }, [orders, stockMap]);

  return (
    <div className="space-y-4">
      {/* ── Key Performance Metrics Banner ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-subtle bg-surface2/70 p-3 shadow-card">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
            <Target size={12} className="text-accent-blue" />
            Total Trades
          </div>
          <div className="font-mono text-lg font-bold text-primary">
            {stats.totalTrades}
          </div>
          <div className="text-[10px] text-faint">
            {stats.winCount}W • {stats.lossCount}L
          </div>
        </div>

        <div className="rounded-xl border border-subtle bg-surface2/70 p-3 shadow-card">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
            <Award
              size={12}
              className={
                stats.winRate >= 50 ? "text-accent-green" : "text-amber-400"
              }
            />
            Win Rate
          </div>
          <div
            className={`font-mono text-lg font-bold ${stats.winRate >= 50 ? "text-accent-green" : "text-amber-400"}`}
          >
            {stats.winRate}%
          </div>
          <div className="text-[10px] text-faint">Target: &ge; 60%</div>
        </div>

        <div className="rounded-xl border border-subtle bg-surface2/70 p-3 shadow-card">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
            <Zap size={12} className="text-accent-blue" />
            Profit Factor
          </div>
          <div
            className={`font-mono text-lg font-bold ${stats.profitFactor >= 1.5 ? "text-accent-green" : "text-primary"}`}
          >
            {stats.profitFactor}x
          </div>
          <div className="text-[10px] text-faint">Gross W/L Ratio</div>
        </div>

        <div className="rounded-xl border border-subtle bg-surface2/70 p-3 shadow-card">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
            <TrendingUp size={12} className="text-accent-green" />
            Gross Profit
          </div>
          <div className="font-mono text-lg font-bold text-accent-green">
            {formatMoney(stats.grossProfit)}
          </div>
          <div className="text-[10px] text-faint">Sum of winners</div>
        </div>

        <div className="rounded-xl border border-subtle bg-surface2/70 p-3 shadow-card">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
            <TrendingDown size={12} className="text-accent-red" />
            Gross Loss
          </div>
          <div className="font-mono text-lg font-bold text-accent-red">
            {formatMoney(-stats.grossLoss)}
          </div>
          <div className="text-[10px] text-faint">Sum of losers</div>
        </div>

        <div className="rounded-xl border border-subtle bg-surface2/70 p-3 shadow-card">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
            <ShieldCheck
              size={12}
              className={
                stats.netPnl >= 0 ? "text-accent-green" : "text-accent-red"
              }
            />
            Net P&amp;L
          </div>
          <div
            className={`font-mono text-lg font-bold ${stats.netPnl >= 0 ? "text-accent-green" : "text-accent-red"}`}
          >
            {formatMoney(stats.netPnl)}
          </div>
          <div className="text-[10px] text-faint">
            After all taxes &amp; fees
          </div>
        </div>
      </div>

      {/* ── View Switcher Buttons ── */}
      <div className="flex items-center justify-between border-b border-subtle pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedView("sector")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedView === "sector"
                ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30"
                : "text-muted hover:text-primary hover:bg-surface3/50"
            }`}
          >
            <Building2 size={13} />
            Sector Distribution
          </button>
          <button
            onClick={() => setSelectedView("strategy")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedView === "strategy"
                ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30"
                : "text-muted hover:text-primary hover:bg-surface3/50"
            }`}
          >
            <Layers size={13} />
            Strategy Breakdown
          </button>
          <button
            onClick={() => setSelectedView("symbols")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedView === "symbols"
                ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30"
                : "text-muted hover:text-primary hover:bg-surface3/50"
            }`}
          >
            <BarChart3 size={13} />
            Stock Contributors
          </button>
        </div>

        <span className="text-[11px] text-faint hidden sm:inline">
          Live Order Flow &amp; Derivative Analytics Engine
        </span>
      </div>

      {/* ── Detailed Breakdown Views ── */}
      {selectedView === "sector" && (
        <div className="rounded-xl border border-subtle bg-surface2/70 p-4 shadow-card space-y-3">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
            <Building2 size={14} className="text-accent-blue" />
            Trades Taken by Sector / Industry Group
          </h4>

          {Object.keys(stats.sectorBreakdown).length === 0 ? (
            <div className="py-8 text-center text-xs text-faint">
              No closed trades recorded in this date range.
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(stats.sectorBreakdown)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([sec, data]) => {
                  const pctOfTotal = Math.round(
                    (data.count / stats.totalTrades) * 100,
                  );
                  const winRate = Math.round((data.wins / data.count) * 100);
                  const isProfitable = data.netPnl >= 0;

                  return (
                    <div
                      key={sec}
                      className="p-3 rounded-lg border border-subtle bg-surface3/40 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 font-semibold text-primary">
                          <span className="w-2 h-2 rounded-full bg-accent-blue" />
                          {sec}
                          <span className="text-[10px] text-faint font-normal">
                            ({data.count} trades • {pctOfTotal}% of portfolio)
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono">
                          <span
                            className={`text-[11px] ${winRate >= 50 ? "text-accent-green" : "text-amber-400"}`}
                          >
                            {winRate}% Win
                          </span>
                          <span
                            className={`font-bold ${isProfitable ? "text-accent-green" : "text-accent-red"}`}
                          >
                            {formatMoney(data.netPnl)}
                          </span>
                        </div>
                      </div>

                      {/* Visual progress bar */}
                      <div className="w-full bg-surface2 h-2 rounded-full overflow-hidden flex">
                        <div
                          style={{ width: `${winRate}%` }}
                          className="bg-accent-green h-full transition-all"
                          title={`Wins: ${data.wins}`}
                        />
                        <div
                          style={{ width: `${100 - winRate}%` }}
                          className="bg-accent-red/70 h-full transition-all"
                          title={`Losses: ${data.count - data.wins}`}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {selectedView === "strategy" && (
        <div className="rounded-xl border border-subtle bg-surface2/70 p-4 shadow-card space-y-3">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
            <Layers size={14} className="text-accent-blue" />
            Strategy Alpha Comparison (Win Rate &amp; Returns)
          </h4>

          {Object.keys(stats.strategyBreakdown).length === 0 ? (
            <div className="py-8 text-center text-xs text-faint">
              No closed trades recorded in this date range.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(stats.strategyBreakdown).map(
                ([stratName, data]) => {
                  const winRate = Math.round((data.wins / data.count) * 100);
                  const isProfitable = data.netPnl >= 0;

                  return (
                    <div
                      key={stratName}
                      className="p-3.5 rounded-lg border border-subtle bg-surface3/40 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-primary">
                          {stratName}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface2 text-faint border border-subtle">
                          {data.count} trades
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-muted">Win Rate:</span>
                        <span
                          className={`font-mono font-bold ${winRate >= 50 ? "text-accent-green" : "text-amber-400"}`}
                        >
                          {winRate}% ({data.wins}W / {data.count - data.wins}L)
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted">Net Realized:</span>
                        <span
                          className={`font-mono font-bold ${isProfitable ? "text-accent-green" : "text-accent-red"}`}
                        >
                          {formatMoney(data.netPnl)}
                        </span>
                      </div>

                      <div className="w-full bg-surface2 h-1.5 rounded-full overflow-hidden mt-1">
                        <div
                          style={{ width: `${winRate}%` }}
                          className="bg-accent-blue h-full"
                        />
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </div>
      )}

      {selectedView === "symbols" && (
        <div className="rounded-xl border border-subtle bg-surface2/70 p-4 shadow-card space-y-3">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
            <BarChart3 size={14} className="text-accent-blue" />
            Stock Contributors Leaderboard
          </h4>

          {Object.keys(stats.symbolBreakdown).length === 0 ? (
            <div className="py-8 text-center text-xs text-faint">
              No closed trades recorded in this date range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-subtle text-[10px] text-muted uppercase tracking-wider">
                    <th className="py-2 px-3">Stock</th>
                    <th className="py-2 px-3">Sector</th>
                    <th className="py-2 px-3 text-center">Trades</th>
                    <th className="py-2 px-3 text-center">Win Rate</th>
                    <th className="py-2 px-3 text-right">Net Return</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle/50 font-mono">
                  {Object.entries(stats.symbolBreakdown)
                    .sort((a, b) => b[1].netPnl - a[1].netPnl)
                    .map(([sym, data]) => {
                      const winRate = Math.round(
                        (data.wins / data.count) * 100,
                      );
                      const isUp = data.netPnl >= 0;
                      return (
                        <tr
                          key={sym}
                          className="hover:bg-surface3/30 transition-colors"
                        >
                          <td className="py-2 px-3 font-sans font-bold text-primary">
                            {sym}
                          </td>
                          <td className="py-2 px-3 font-sans text-muted text-[11px]">
                            {data.sector}
                          </td>
                          <td className="py-2 px-3 text-center text-muted">
                            {data.count}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={
                                winRate >= 50
                                  ? "text-accent-green"
                                  : "text-amber-400"
                              }
                            >
                              {winRate}%
                            </span>
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-bold ${isUp ? "text-accent-green" : "text-accent-red"}`}
                          >
                            {formatMoney(data.netPnl)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

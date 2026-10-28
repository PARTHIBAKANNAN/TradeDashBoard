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
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
} from "lucide-react";

function formatMoney(v) {
  const n = Number(v) || 0;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatMinutes(mins) {
  if (!mins || isNaN(mins)) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${m}m`;
}

export default function TradesAnalyticsCard({ orders = [], stocks = [] }) {
  // Available views: "overview" | "hourly" | "exits" | "sector" | "strategy" | "symbols" | "equity"
  const [selectedView, setSelectedView] = useState("overview");

  // Stock lookup map for sector resolution
  const stockMap = useMemo(() => {
    const map = {};
    (stocks || []).forEach((s) => {
      map[s.symbol] = s;
    });
    return map;
  }, [stocks]);

  // Comprehensive Analytics Computation
  const stats = useMemo(() => {
    const closed = (orders || []).filter((o) => o.status === "CLOSED");
    if (!closed.length) {
      return {
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        breakevenCount: 0,
        winRate: 0,
        grossProfit: 0,
        grossLoss: 0,
        profitFactor: 0,
        netPnl: 0,
        avgTradePnl: 0,
        avgWin: 0,
        avgLoss: 0,
        payoffRatio: 0,
        expectancy: 0,
        bestTrade: null,
        worstTrade: null,
        currentStreak: { type: "NONE", count: 0 },
        maxWinStreak: 0,
        maxLossStreak: 0,
        longStats: { count: 0, wins: 0, losses: 0, netPnl: 0, winRate: 0 },
        shortStats: { count: 0, wins: 0, losses: 0, netPnl: 0, winRate: 0 },
        hourlyBreakdown: {},
        exitReasonBreakdown: {},
        avgWinDurationMins: 0,
        avgLossDurationMins: 0,
        overallAvgDurationMins: 0,
        equityPoints: [],
        maxDrawdown: 0,
        peakEquity: 0,
        sectorBreakdown: {},
        strategyBreakdown: {},
        symbolBreakdown: {},
        rDistribution: { target: 0, partial: 0, breakeven: 0, sl: 0 },
      };
    }

    let winCount = 0;
    let lossCount = 0;
    let breakevenCount = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let netPnl = 0;

    let bestTrade = null;
    let worstTrade = null;

    const winDurations = [];
    const lossDurations = [];
    const allDurations = [];

    const longStats = { count: 0, wins: 0, losses: 0, netPnl: 0, winRate: 0 };
    const shortStats = { count: 0, wins: 0, losses: 0, netPnl: 0, winRate: 0 };

    const hourlyBreakdown = {
      "09:15 - 10:00": { label: "Opening Drive & ORB", count: 0, wins: 0, netPnl: 0 },
      "10:00 - 11:30": { label: "Morning Momentum", count: 0, wins: 0, netPnl: 0 },
      "11:30 - 13:30": { label: "Midday Range", count: 0, wins: 0, netPnl: 0 },
      "13:30 - 15:30": { label: "Afternoon & Square-off", count: 0, wins: 0, netPnl: 0 },
    };

    const exitReasonBreakdown = {};
    const sectorBreakdown = {};
    const strategyBreakdown = {};
    const symbolBreakdown = {};
    const rDistribution = { target: 0, partial: 0, breakeven: 0, sl: 0 };

    // Sort chronologically for streaks & equity curve
    const chronological = [...closed].sort(
      (a, b) =>
        new Date(a.closed_at || a.filled_at || a.placed_at) -
        new Date(b.closed_at || b.filled_at || b.placed_at),
    );

    let currentStreakType = "NONE";
    let currentStreakCount = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let tempWinStreak = 0;
    let tempLossStreak = 0;

    let runningCumPnl = 0;
    let peakEquity = 0;
    let maxDrawdown = 0;
    const equityPoints = [];

    chronological.forEach((o, index) => {
      const pnl = Number(o.realized_pnl) || 0;
      const net = Number(o.net_pnl ?? o.realized_pnl) || 0;
      netPnl += net;

      // Best / Worst trade tracker
      if (!bestTrade || net > (bestTrade.netPnl ?? bestTrade.pnl)) {
        bestTrade = { symbol: o.symbol, pnl, netPnl: net, side: o.side, date: o.closed_at };
      }
      if (!worstTrade || net < (worstTrade.netPnl ?? worstTrade.pnl)) {
        worstTrade = { symbol: o.symbol, pnl, netPnl: net, side: o.side, date: o.closed_at };
      }

      // Win / Loss / Breakeven counts
      if (pnl > 0) {
        winCount++;
        grossProfit += pnl;
        tempWinStreak++;
        tempLossStreak = 0;
        if (tempWinStreak > maxWinStreak) maxWinStreak = tempWinStreak;
      } else if (pnl < 0) {
        lossCount++;
        grossLoss += Math.abs(pnl);
        tempLossStreak++;
        tempWinStreak = 0;
        if (tempLossStreak > maxLossStreak) maxLossStreak = tempLossStreak;
      } else {
        breakevenCount++;
        tempWinStreak = 0;
        tempLossStreak = 0;
      }

      // Equity Curve & Max Drawdown
      runningCumPnl += net;
      if (runningCumPnl > peakEquity) peakEquity = runningCumPnl;
      const dd = peakEquity - runningCumPnl;
      if (dd > maxDrawdown) maxDrawdown = dd;
      equityPoints.push({
        index: index + 1,
        cumPnl: runningCumPnl,
        drawdown: dd,
        symbol: o.symbol,
        net,
      });

      // Directional (Long vs Short)
      const isBuy = (o.side || "").toUpperCase() === "BUY";
      const targetSide = isBuy ? longStats : shortStats;
      targetSide.count++;
      targetSide.netPnl += net;
      if (pnl > 0) targetSide.wins++;
      else if (pnl < 0) targetSide.losses++;

      // Holding Duration in minutes
      if (o.closed_at && (o.filled_at || o.placed_at)) {
        const start = new Date(o.filled_at || o.placed_at).getTime();
        const end = new Date(o.closed_at).getTime();
        if (end > start) {
          const mins = (end - start) / 60000;
          allDurations.push(mins);
          if (pnl > 0) winDurations.push(mins);
          else if (pnl < 0) lossDurations.push(mins);
        }
      }

      // Hourly Session Classification
      const entryDate = new Date(o.filled_at || o.placed_at);
      if (!isNaN(entryDate.getTime())) {
        const h = entryDate.getHours();
        const m = entryDate.getMinutes();
        const timeDecimal = h + m / 60;
        let sessionKey = "10:00 - 11:30";
        if (timeDecimal >= 9.25 && timeDecimal < 10.0) sessionKey = "09:15 - 10:00";
        else if (timeDecimal >= 10.0 && timeDecimal < 11.5) sessionKey = "10:00 - 11:30";
        else if (timeDecimal >= 11.5 && timeDecimal < 13.5) sessionKey = "11:30 - 13:30";
        else if (timeDecimal >= 13.5) sessionKey = "13:30 - 15:30";

        if (hourlyBreakdown[sessionKey]) {
          hourlyBreakdown[sessionKey].count++;
          if (pnl > 0) hourlyBreakdown[sessionKey].wins++;
          hourlyBreakdown[sessionKey].netPnl += net;
        }
      }

      // Exit Reason Resolution
      const notes = (o.notes || "").toUpperCase();
      let exitReason = "Discretionary / Manual";
      if (notes.includes("TARGET") || notes.includes("TP")) {
        exitReason = "Target Hit";
      } else if (notes.includes("TSL") || notes.includes("TRAIL")) {
        exitReason = "Trailing Stop Hit";
      } else if (notes.includes("SL") || notes.includes("STOP")) {
        exitReason = "Stop Loss Hit";
      } else if (notes.includes("EOD") || notes.includes("3:15") || notes.includes("SQUARE")) {
        exitReason = "EOD Square-Off";
      } else if (notes.includes("AI_COPILOT") || notes.includes("AI EXIT")) {
        exitReason = "AI Copilot Signal Exit";
      }
      if (!exitReasonBreakdown[exitReason]) {
        exitReasonBreakdown[exitReason] = { count: 0, wins: 0, netPnl: 0 };
      }
      exitReasonBreakdown[exitReason].count++;
      if (pnl > 0) exitReasonBreakdown[exitReason].wins++;
      exitReasonBreakdown[exitReason].netPnl += net;

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
        sectorBreakdown[sec] = { count: 0, wins: 0, netPnl: 0 };
      }
      sectorBreakdown[sec].count++;
      if (pnl > 0) sectorBreakdown[sec].wins++;
      sectorBreakdown[sec].netPnl += net;

      // Strategy Resolution
      let strat = "MANUAL";
      if (notes.includes("ORB") || notes.includes("C0.5") || notes.includes("C1") || notes.includes("C2")) {
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
        symbolBreakdown[o.symbol] = { count: 0, wins: 0, netPnl: 0, sector: sec };
      }
      symbolBreakdown[o.symbol].count++;
      if (pnl > 0) symbolBreakdown[o.symbol].wins++;
      symbolBreakdown[o.symbol].netPnl += net;
    });

    // Compute Active Current Streak from most recent closed trades
    if (chronological.length > 0) {
      const lastTrade = chronological[chronological.length - 1];
      const lastPnl = Number(lastTrade.realized_pnl) || 0;
      if (lastPnl > 0) {
        currentStreakType = "WIN";
        for (let i = chronological.length - 1; i >= 0; i--) {
          if ((Number(chronological[i].realized_pnl) || 0) > 0) currentStreakCount++;
          else break;
        }
      } else if (lastPnl < 0) {
        currentStreakType = "LOSS";
        for (let i = chronological.length - 1; i >= 0; i--) {
          if ((Number(chronological[i].realized_pnl) || 0) < 0) currentStreakCount++;
          else break;
        }
      }
    }

    const totalTrades = closed.length;
    const winRate = totalTrades ? Math.round((winCount / totalTrades) * 100) : 0;
    const profitFactor =
      grossLoss > 0
        ? Number((grossProfit / grossLoss).toFixed(2))
        : grossProfit > 0
        ? 99.9
        : 0;

    const avgTradePnl = totalTrades ? Math.round(netPnl / totalTrades) : 0;
    const avgWin = winCount > 0 ? grossProfit / winCount : 0;
    const avgLoss = lossCount > 0 ? grossLoss / lossCount : 0;
    const payoffRatio = avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : avgWin > 0 ? 99.9 : 0;

    // Mathematical Expectancy Per Trade
    const winRateDec = totalTrades ? winCount / totalTrades : 0;
    const lossRateDec = totalTrades ? lossCount / totalTrades : 0;
    const expectancy = Math.round(winRateDec * avgWin - lossRateDec * avgLoss);

    // Long & Short Win Rates
    longStats.winRate = longStats.count ? Math.round((longStats.wins / longStats.count) * 100) : 0;
    shortStats.winRate = shortStats.count ? Math.round((shortStats.wins / shortStats.count) * 100) : 0;

    // Average durations
    const avgWinDurationMins = winDurations.length
      ? winDurations.reduce((a, b) => a + b, 0) / winDurations.length
      : 0;
    const avgLossDurationMins = lossDurations.length
      ? lossDurations.reduce((a, b) => a + b, 0) / lossDurations.length
      : 0;
    const overallAvgDurationMins = allDurations.length
      ? allDurations.reduce((a, b) => a + b, 0) / allDurations.length
      : 0;

    return {
      totalTrades,
      winCount,
      lossCount,
      breakevenCount,
      winRate,
      grossProfit,
      grossLoss,
      profitFactor,
      netPnl,
      avgTradePnl,
      avgWin,
      avgLoss,
      payoffRatio,
      expectancy,
      bestTrade,
      worstTrade,
      currentStreak: { type: currentStreakType, count: currentStreakCount },
      maxWinStreak,
      maxLossStreak,
      longStats,
      shortStats,
      hourlyBreakdown,
      exitReasonBreakdown,
      avgWinDurationMins,
      avgLossDurationMins,
      overallAvgDurationMins,
      equityPoints,
      maxDrawdown,
      peakEquity,
      sectorBreakdown,
      strategyBreakdown,
      symbolBreakdown,
      rDistribution,
    };
  }, [orders, stockMap]);

  return (
    <div className="space-y-4">
      {/* ── Key Performance Metrics Banner (6 Core Stats) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
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
              className={stats.winRate >= 50 ? "text-accent-green" : "text-amber-400"}
            />
            Win Rate
          </div>
          <div
            className={`font-mono text-lg font-bold ${
              stats.winRate >= 50 ? "text-accent-green" : "text-amber-400"
            }`}
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
            className={`font-mono text-lg font-bold ${
              stats.profitFactor >= 1.5 ? "text-accent-green" : "text-primary"
            }`}
          >
            {stats.profitFactor}x
          </div>
          <div className="text-[10px] text-faint">Gross W/L Ratio</div>
        </div>

        <div className="rounded-xl border border-subtle bg-surface2/70 p-3 shadow-card">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
            <Activity size={12} className="text-purple-400" />
            Payoff Ratio
          </div>
          <div className="font-mono text-lg font-bold text-primary">
            {stats.payoffRatio}x
          </div>
          <div className="text-[10px] text-faint">Avg Win vs Avg Loss</div>
        </div>

        <div className="rounded-xl border border-subtle bg-surface2/70 p-3 shadow-card">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
            <TrendingUp size={12} className="text-accent-blue" />
            Expectancy
          </div>
          <div
            className={`font-mono text-lg font-bold ${
              stats.expectancy >= 0 ? "text-accent-green" : "text-accent-red"
            }`}
          >
            {formatMoney(stats.expectancy)}
          </div>
          <div className="text-[10px] text-faint">Expected / Trade</div>
        </div>

        <div className="rounded-xl border border-subtle bg-surface2/70 p-3 shadow-card">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
            <ShieldCheck
              size={12}
              className={stats.netPnl >= 0 ? "text-accent-green" : "text-accent-red"}
            />
            Net P&amp;L
          </div>
          <div
            className={`font-mono text-lg font-bold ${
              stats.netPnl >= 0 ? "text-accent-green" : "text-accent-red"
            }`}
          >
            {formatMoney(stats.netPnl)}
          </div>
          <div className="text-[10px] text-faint">After all charges</div>
        </div>
      </div>

      {/* ── Sub-View Switcher Tabs ── */}
      <div className="flex items-center justify-between border-b border-subtle pb-2 overflow-x-auto no-scrollbar gap-1">
        <div className="flex gap-1.5 flex-nowrap">
          <button
            onClick={() => setSelectedView("overview")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              selectedView === "overview"
                ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30"
                : "text-muted hover:text-primary hover:bg-surface3/50"
            }`}
          >
            <PieChart size={13} />
            Overview &amp; Streaks
          </button>
          <button
            onClick={() => setSelectedView("hourly")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              selectedView === "hourly"
                ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30"
                : "text-muted hover:text-primary hover:bg-surface3/50"
            }`}
          >
            <Clock size={13} />
            Hourly Heatmap
          </button>
          <button
            onClick={() => setSelectedView("exits")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              selectedView === "exits"
                ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30"
                : "text-muted hover:text-primary hover:bg-surface3/50"
            }`}
          >
            <Target size={13} />
            Exit Reasons &amp; R:R
          </button>
          <button
            onClick={() => setSelectedView("sector")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              selectedView === "sector"
                ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30"
                : "text-muted hover:text-primary hover:bg-surface3/50"
            }`}
          >
            <Building2 size={13} />
            Sectors
          </button>
          <button
            onClick={() => setSelectedView("strategy")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              selectedView === "strategy"
                ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30"
                : "text-muted hover:text-primary hover:bg-surface3/50"
            }`}
          >
            <Layers size={13} />
            Strategies
          </button>
          <button
            onClick={() => setSelectedView("symbols")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              selectedView === "symbols"
                ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30"
                : "text-muted hover:text-primary hover:bg-surface3/50"
            }`}
          >
            <BarChart3 size={13} />
            Stocks
          </button>
          <button
            onClick={() => setSelectedView("equity")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              selectedView === "equity"
                ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30"
                : "text-muted hover:text-primary hover:bg-surface3/50"
            }`}
          >
            <TrendingUp size={13} />
            Drawdown &amp; Equity
          </button>
        </div>

        <span className="text-[11px] text-faint hidden lg:inline flex-shrink-0">
          PulseHunter Advanced Quantitative Analytics
        </span>
      </div>

      {/* ── View 1: Overview & Directional & Streaks ── */}
      {selectedView === "overview" && (
        <div className="space-y-4">
          {/* Top Row: Long vs Short & Win/Loss Donut & Streaks */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            {/* Long vs Short Directional Card */}
            <div className="rounded-xl border border-subtle bg-surface2/70 p-4 shadow-card space-y-3">
              <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Activity size={14} className="text-accent-blue" />
                  Directional Edge (Long vs Short)
                </span>
              </h4>

              <div className="space-y-3">
                {/* Long (Buy) Row */}
                <div className="p-2.5 rounded-lg bg-surface3/40 border border-subtle space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 font-bold text-emerald-400">
                      <ArrowUpRight size={14} /> LONG (BUY)
                    </span>
                    <span className="font-mono text-muted text-[11px]">
                      {stats.longStats.count} trades · {stats.longStats.winRate}% Win
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-faint">Net P&amp;L:</span>
                    <span
                      className={`font-bold ${
                        stats.longStats.netPnl >= 0 ? "text-accent-green" : "text-accent-red"
                      }`}
                    >
                      {formatMoney(stats.longStats.netPnl)}
                    </span>
                  </div>
                  <div className="w-full bg-surface2 h-1.5 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${stats.longStats.winRate}%` }}
                      className="bg-emerald-500 h-full"
                    />
                  </div>
                </div>

                {/* Short (Sell) Row */}
                <div className="p-2.5 rounded-lg bg-surface3/40 border border-subtle space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 font-bold text-rose-400">
                      <ArrowDownRight size={14} /> SHORT (SELL)
                    </span>
                    <span className="font-mono text-muted text-[11px]">
                      {stats.shortStats.count} trades · {stats.shortStats.winRate}% Win
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-faint">Net P&amp;L:</span>
                    <span
                      className={`font-bold ${
                        stats.shortStats.netPnl >= 0 ? "text-accent-green" : "text-accent-red"
                      }`}
                    >
                      {formatMoney(stats.shortStats.netPnl)}
                    </span>
                  </div>
                  <div className="w-full bg-surface2 h-1.5 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${stats.shortStats.winRate}%` }}
                      className="bg-rose-500 h-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Win / Loss Donut & Distribution */}
            <div className="rounded-xl border border-subtle bg-surface2/70 p-4 shadow-card flex flex-col justify-between">
              <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                <PieChart size={14} className="text-accent-blue" />
                Outcome Proportion
              </h4>

              <div className="flex items-center justify-around py-3">
                {/* SVG Donut */}
                <div className="relative w-28 h-28">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    {/* Background Circle */}
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4"
                      className="text-surface3"
                    />
                    {/* Green Segment (Wins) */}
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="4"
                      strokeDasharray={`${stats.winRate} 100`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="font-mono text-base font-bold text-primary">
                      {stats.winRate}%
                    </span>
                    <span className="text-[9px] text-faint uppercase font-bold">Wins</span>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-muted">Wins:</span>
                    <span className="font-mono font-bold text-primary">{stats.winCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    <span className="text-muted">Losses:</span>
                    <span className="font-mono font-bold text-primary">{stats.lossCount}</span>
                  </div>
                  {stats.breakevenCount > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      <span className="text-muted">Breakeven:</span>
                      <span className="font-mono font-bold text-primary">{stats.breakevenCount}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[11px] text-faint text-center pt-2 border-t border-subtle">
                Gross Profit: <span className="text-emerald-400 font-bold">{formatMoney(stats.grossProfit)}</span> · Gross Loss: <span className="text-rose-400 font-bold">{formatMoney(stats.grossLoss)}</span>
              </div>
            </div>

            {/* Streak Tracker & Discipline */}
            <div className="rounded-xl border border-subtle bg-surface2/70 p-4 shadow-card space-y-3">
              <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                <Flame size={14} className="text-accent-amber" />
                Streak &amp; Discipline Tracker
              </h4>

              <div className="space-y-2.5 text-xs">
                {/* Current Streak */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface3/40 border border-subtle">
                  <span className="text-muted">Current Streak:</span>
                  <div className="flex items-center gap-1.5 font-mono font-bold">
                    {stats.currentStreak.type === "WIN" ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Flame size={13} className="text-amber-400 animate-pulse" />
                        +{stats.currentStreak.count} Win{stats.currentStreak.count > 1 ? "s" : ""}
                      </span>
                    ) : stats.currentStreak.type === "LOSS" ? (
                      <span className="text-rose-400">
                        -{stats.currentStreak.count} Loss{stats.currentStreak.count > 1 ? "es" : ""}
                      </span>
                    ) : (
                      <span className="text-faint">None</span>
                    )}
                  </div>
                </div>

                {/* Best Win Streak */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface3/40 border border-subtle">
                  <span className="text-muted">Best Winning Streak:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {stats.maxWinStreak} consecutive wins
                  </span>
                </div>

                {/* Worst Loss Streak */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface3/40 border border-subtle">
                  <span className="text-muted">Max Drawdown Streak:</span>
                  <span className="font-mono font-bold text-rose-400">
                    {stats.maxLossStreak} consecutive losses
                  </span>
                </div>
              </div>

              {/* Holding Duration Summary */}
              <div className="pt-2 border-t border-subtle flex items-center justify-between text-[11px]">
                <span className="text-faint">Avg Win Hold:</span>
                <span className="font-mono text-emerald-400 font-bold">{formatMinutes(stats.avgWinDurationMins)}</span>
                <span className="text-faint">Avg Loss Hold:</span>
                <span className="font-mono text-rose-400 font-bold">{formatMinutes(stats.avgLossDurationMins)}</span>
              </div>
            </div>
          </div>

          {/* Payoff & Best/Worst Trade Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-subtle bg-surface2/70 p-3 shadow-card space-y-1">
              <div className="text-[10px] uppercase font-bold text-faint">Average Win</div>
              <div className="font-mono text-base font-bold text-emerald-400">
                {formatMoney(stats.avgWin)}
              </div>
              <div className="text-[10px] text-faint">Per profitable trade</div>
            </div>

            <div className="rounded-xl border border-subtle bg-surface2/70 p-3 shadow-card space-y-1">
              <div className="text-[10px] uppercase font-bold text-faint">Average Loss</div>
              <div className="font-mono text-base font-bold text-rose-400">
                {formatMoney(-stats.avgLoss)}
              </div>
              <div className="text-[10px] text-faint">Per losing trade</div>
            </div>

            <div className="rounded-xl border border-subtle bg-surface2/70 p-3 shadow-card space-y-1">
              <div className="text-[10px] uppercase font-bold text-faint">Biggest Winner</div>
              <div className="font-mono text-base font-bold text-emerald-400 truncate">
                {stats.bestTrade ? `${formatMoney(stats.bestTrade.netPnl)} (${stats.bestTrade.symbol})` : "—"}
              </div>
              <div className="text-[10px] text-faint truncate">Top single trade gain</div>
            </div>

            <div className="rounded-xl border border-subtle bg-surface2/70 p-3 shadow-card space-y-1">
              <div className="text-[10px] uppercase font-bold text-faint">Biggest Loser</div>
              <div className="font-mono text-base font-bold text-rose-400 truncate">
                {stats.worstTrade ? `${formatMoney(stats.worstTrade.netPnl)} (${stats.worstTrade.symbol})` : "—"}
              </div>
              <div className="text-[10px] text-faint truncate">Max single trade loss</div>
            </div>
          </div>
        </div>
      )}

      {/* ── View 2: Hourly Time-of-Day Profitability Heatmap ── */}
      {selectedView === "hourly" && (
        <div className="rounded-xl border border-subtle bg-surface2/70 p-4 shadow-card space-y-4">
          <div>
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
              <Clock size={14} className="text-accent-blue" />
              Intraday Session Edge &amp; Hourly Heatmap
            </h4>
            <p className="text-[11px] text-faint mt-0.5">
              Identifies which trading window yields your highest alpha vs where trades tend to chop or stop out.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(stats.hourlyBreakdown).map(([timeRange, session]) => {
              const winRate = session.count > 0 ? Math.round((session.wins / session.count) * 100) : 0;
              const isGreen = session.netPnl >= 0;

              return (
                <div
                  key={timeRange}
                  className={`p-3.5 rounded-xl border transition-all ${
                    session.count === 0
                      ? "bg-surface3/30 border-subtle opacity-70"
                      : isGreen
                      ? "bg-emerald-500/5 border-emerald-500/30"
                      : "bg-rose-500/5 border-rose-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-bold text-primary">{timeRange}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface3 text-faint font-mono">
                      {session.count} trades
                    </span>
                  </div>

                  <div className="text-[11px] text-muted font-medium mb-2.5 truncate">
                    {session.label}
                  </div>

                  <div className="space-y-1.5 text-xs pt-1 border-t border-subtle/60">
                    <div className="flex justify-between">
                      <span className="text-faint">Win Rate:</span>
                      <span className={`font-mono font-bold ${winRate >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
                        {session.count > 0 ? `${winRate}%` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-faint">Net P&amp;L:</span>
                      <span className={`font-mono font-bold ${isGreen ? "text-emerald-400" : "text-rose-400"}`}>
                        {formatMoney(session.netPnl)}
                      </span>
                    </div>
                  </div>

                  {session.count > 0 && (
                    <div className="w-full bg-surface2 h-1.5 rounded-full overflow-hidden mt-3">
                      <div
                        style={{ width: `${winRate}%` }}
                        className={`h-full ${isGreen ? "bg-emerald-500" : "bg-rose-500"}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── View 3: Exit Reasons & R-Multiples ── */}
      {selectedView === "exits" && (
        <div className="rounded-xl border border-subtle bg-surface2/70 p-4 shadow-card space-y-4">
          <div>
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
              <Target size={14} className="text-accent-blue" />
              Exit Triggers &amp; R-Multiple Distribution
            </h4>
            <p className="text-[11px] text-faint mt-0.5">
              Audits execution quality: verifies if gains came from target limits vs trailing stops vs forced EOD square-offs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Exit Triggers Breakdown */}
            <div className="p-3.5 rounded-xl border border-subtle bg-surface3/40 space-y-3">
              <h5 className="text-xs font-bold text-primary uppercase tracking-wider">
                Exit Reason Classification
              </h5>
              <div className="space-y-2">
                {Object.entries(stats.exitReasonBreakdown).map(([reason, data]) => {
                  const pct = Math.round((data.count / stats.totalTrades) * 100);
                  const winRate = Math.round((data.wins / data.count) * 100);
                  return (
                    <div key={reason} className="p-2.5 rounded-lg bg-surface2 border border-subtle text-xs space-y-1.5">
                      <div className="flex justify-between font-medium">
                        <span className="text-primary font-semibold">{reason}</span>
                        <span className="font-mono text-muted text-[11px]">
                          {data.count} ({pct}%)
                        </span>
                      </div>
                      <div className="flex justify-between font-mono text-[11px]">
                        <span className="text-faint">{winRate}% Win Rate</span>
                        <span className={data.netPnl >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                          {formatMoney(data.netPnl)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* R-Multiple Bucketing */}
            <div className="p-3.5 rounded-xl border border-subtle bg-surface3/40 space-y-3">
              <h5 className="text-xs font-bold text-primary uppercase tracking-wider">
                Risk-Reward Multiple (R) Buckets
              </h5>
              <div className="space-y-2.5 text-xs">
                <div className="p-2.5 rounded-lg bg-surface2 border border-subtle flex items-center justify-between">
                  <div>
                    <div className="font-bold text-emerald-400">&ge; +2.0R (Target Hit)</div>
                    <div className="text-[10px] text-faint">Outsized runners</div>
                  </div>
                  <span className="font-mono text-sm font-bold text-primary">{stats.rDistribution.target}</span>
                </div>

                <div className="p-2.5 rounded-lg bg-surface2 border border-subtle flex items-center justify-between">
                  <div>
                    <div className="font-bold text-emerald-300">+0.8R to +1.9R (Partial / TSL)</div>
                    <div className="text-[10px] text-faint">Core trend captures</div>
                  </div>
                  <span className="font-mono text-sm font-bold text-primary">{stats.rDistribution.partial}</span>
                </div>

                <div className="p-2.5 rounded-lg bg-surface2 border border-subtle flex items-center justify-between">
                  <div>
                    <div className="font-bold text-amber-400">0.0R (Breakeven / Cost Exit)</div>
                    <div className="text-[10px] text-faint">Preserved capital</div>
                  </div>
                  <span className="font-mono text-sm font-bold text-primary">{stats.rDistribution.breakeven}</span>
                </div>

                <div className="p-2.5 rounded-lg bg-surface2 border border-subtle flex items-center justify-between">
                  <div>
                    <div className="font-bold text-rose-400">-1.0R (Controlled Stop Loss)</div>
                    <div className="text-[10px] text-faint">Calculated structural invalidations</div>
                  </div>
                  <span className="font-mono text-sm font-bold text-primary">{stats.rDistribution.sl}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── View 4: Sector Breakdown ── */}
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
                  const pctOfTotal = Math.round((data.count / stats.totalTrades) * 100);
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
                            ({data.count} trades • {pctOfTotal}% of volume)
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

      {/* ── View 5: Strategy Alpha Comparison ── */}
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
              {Object.entries(stats.strategyBreakdown).map(([stratName, data]) => {
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
              })}
            </div>
          )}
        </div>
      )}

      {/* ── View 6: Stock Contributors Leaderboard ── */}
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
                      const winRate = Math.round((data.wins / data.count) * 100);
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

      {/* ── View 7: Drawdown & Equity Curve ── */}
      {selectedView === "equity" && (
        <div className="rounded-xl border border-subtle bg-surface2/70 p-4 shadow-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                <TrendingUp size={14} className="text-accent-blue" />
                Cumulative Realized Equity &amp; Drawdown Trace
              </h4>
              <p className="text-[11px] text-faint mt-0.5">
                Displays account equity trajectory trade-by-trade along with maximum depth of drawdown from peak.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-faint">
                Max DD: <strong className="text-rose-400">-{formatMoney(stats.maxDrawdown)}</strong>
              </span>
              <span className="text-faint">
                Peak: <strong className="text-emerald-400">{formatMoney(stats.peakEquity)}</strong>
              </span>
            </div>
          </div>

          {stats.equityPoints.length < 2 ? (
            <div className="py-12 text-center text-xs text-faint">
              Need at least 2 closed trades to chart the equity trajectory curve.
            </div>
          ) : (
            <div className="space-y-3">
              {/* SVG Sparkline Curve */}
              <div className="h-44 w-full bg-surface3/40 rounded-xl p-3 border border-subtle flex flex-col justify-between">
                <div className="flex justify-between text-[10px] text-faint font-mono">
                  <span>Start (Trade #1)</span>
                  <span>Latest (Trade #{stats.equityPoints.length})</span>
                </div>
                <div className="relative h-28 w-full flex items-end">
                  <svg viewBox={`0 0 ${stats.equityPoints.length - 1} 100`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
                    {/* Zero line */}
                    <line x1="0" y1="50" x2={stats.equityPoints.length - 1} y2="50" stroke="currentColor" strokeDasharray="3 3" className="text-subtle" />
                    {/* Path */}
                    {(() => {
                      const maxVal = Math.max(1, ...stats.equityPoints.map((p) => Math.abs(p.cumPnl)));
                      const coords = stats.equityPoints.map((p, i) => {
                        const y = 50 - (p.cumPnl / (maxVal * 1.25)) * 45;
                        return `${i},${Math.max(5, Math.min(95, y))}`;
                      });
                      const isWinning = stats.netPnl >= 0;
                      return (
                        <polyline
                          fill="none"
                          stroke={isWinning ? "#10b981" : "#f43f5e"}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={coords.join(" ")}
                        />
                      );
                    })()}
                  </svg>
                </div>
                <div className="flex justify-between text-[10px] text-faint font-mono">
                  <span>Net P&amp;L: {formatMoney(stats.netPnl)}</span>
                  <span>Watermark: {formatMoney(stats.peakEquity)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

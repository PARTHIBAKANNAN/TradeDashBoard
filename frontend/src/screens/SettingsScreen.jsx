import React, { useState, useEffect } from "react";
import {
  Settings,
  Wallet,
  Shield,
  Bot,
  Zap,
  Radio,
  RefreshCw,
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Sliders,
  Cpu,
  Activity,
  Layers,
  Palette,
  Sun,
  Moon,
  Monitor,
  Sparkles,
  Paintbrush,
} from "lucide-react";
import { useTheme, CHART_PALETTES } from "../contexts/ThemeContext.jsx";
import Card from "../components/ui/Card.jsx";
import {
  usePnlSummary,
  depositToWallet,
  resetWallet,
  usePaperTradingSync,
} from "../hooks/useOrders.js";

const SUB_TABS = [
  {
    key: "risk",
    label: "Risk & Allocation",
    sublabel: "Loss limits & capital discipline",
    icon: Shield,
    badge: "Active",
  },
  {
    key: "strategies",
    label: "Trading Strategies",
    sublabel: "5 quantitative engines",
    icon: Zap,
    badge: "5 Live",
  },
  {
    key: "copilot",
    label: "AI Copilot & Automation",
    sublabel: "Gemini 3.6 Flash & triggers",
    icon: Bot,
    badge: "Autonomous",
  },
  {
    key: "broker",
    label: "Broker & Data Feed",
    sublabel: "AliceBlue & WebSocket feeds",
    icon: Radio,
    badge: null,
  },
  {
    key: "wallet",
    label: "Paper Wallet & Capital",
    sublabel: "Virtual balance & margin",
    icon: Wallet,
    badge: null,
  },
  {
    key: "appearance",
    label: "Appearance & Themes",
    sublabel: "App palettes & chart styling",
    icon: Palette,
    badge: "New",
  },
];

export default function SettingsScreen({ onOpenBrokerModal }) {
  usePaperTradingSync();
  const summary = usePnlSummary();
  const {
    theme,
    setTheme,
    chartTheme,
    setChartTheme,
    customChartColors,
    setCustomChartColors,
  } = useTheme();

  const [activeSection, setActiveSection] = useState("risk");
  const [depositAmount, setDepositAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Configuration state
  const [configData, setConfigData] = useState({
    max_risk_per_trade: 1000,
    max_margin_per_trade: 10000,
    daily_max_risk: 5000,
    max_daily_trades: 5,
    min_ai_confidence: 70,
    auto_trading_enabled: true,
    telegram_alerts_enabled: true,
    execution_mode: "QUANT_AUTONOMOUS",
    tsl_breakeven_threshold: 0.8,
    tsl_profit_harvest: 1.5,
    tsl_runner_buffer: 0.9,
    broker: "aliceblue",
    strategy_states: {
      ORB_BREAKOUT: "RUNNING",
      VWAP_RETEST: "RUNNING",
      OI_SQUEEZE: "RUNNING",
      SECTOR_SYMPATHY: "RUNNING",
      MOMENTUM_RUNNER: "RUNNING",
    },
  });

  const [brokerStatus, setBrokerStatus] = useState(null);
  const [aiStatus, setAiStatus] = useState({
    status: "LIVE",
    model: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash Live",
  });

  // Fetch backend configs & broker status on mount
  useEffect(() => {
    fetch("/api/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setConfigData((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {});

    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setBrokerStatus(data);
      })
      .catch(() => {});

    fetch("/api/ai/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setAiStatus(data);
      })
      .catch(() => {});
  }, []);

  const isMarketOpen = Boolean(brokerStatus?.market_open);

  const saveConfig = async (newConfig) => {
    setConfigData(newConfig);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) {
        setStatusMsg({ type: "success", text: "Settings saved to backend." });
      } else {
        setStatusMsg({ type: "error", text: "Server rejected configuration." });
      }
    } catch {
      setStatusMsg({ type: "error", text: "Failed to connect to backend configuration API." });
    }
  };

  const handleRiskPerTradeChange = (val) => {
    const risk = Number(val);
    const trades = configData.max_daily_trades;
    const minBudget = risk * trades;
    const newBudget = Math.max(configData.daily_max_risk, minBudget);
    saveConfig({
      ...configData,
      max_risk_per_trade: risk,
      daily_max_risk: newBudget,
    });
  };

  const handleMaxTradesChange = (val) => {
    const trades = Number(val);
    const risk = configData.max_risk_per_trade;
    const minBudget = risk * trades;
    const newBudget = Math.max(configData.daily_max_risk, minBudget);
    saveConfig({
      ...configData,
      max_daily_trades: trades,
      daily_max_risk: newBudget,
    });
  };

  const handleDailyBudgetChange = (val) => {
    const budget = Number(val);
    const risk = configData.max_risk_per_trade;
    const allowedTrades = Math.max(1, Math.floor(budget / risk));
    const newTrades = Math.min(configData.max_daily_trades, allowedTrades);
    saveConfig({
      ...configData,
      daily_max_risk: budget,
      max_daily_trades: newTrades,
    });
  };

  const handleMarginPerTradeChange = (val) => {
    const margin = Number(val);
    saveConfig({
      ...configData,
      max_margin_per_trade: margin,
    });
  };

  const handleStrategyStateChange = (stratKey, newState) => {
    const updatedStates = {
      ...(configData.strategy_states || {}),
      [stratKey]: newState,
    };
    saveConfig({
      ...configData,
      strategy_states: updatedStates,
    });
  };

  const STRATEGIES = [
    { key: "ORB_BREAKOUT", name: "ORB Breakout", defaultRisk: 1000, desc: "Opening 15m/30m high-low breach with 2-sided gate" },
    { key: "VWAP_RETEST", name: "VWAP Retest", defaultRisk: 1000, desc: "Pullback to dynamic session volume-weighted average price" },
    { key: "OI_SQUEEZE", name: "OI Squeeze", defaultRisk: 1000, desc: "Option strike build-up & short covering momentum" },
    { key: "SECTOR_SYMPATHY", name: "Sector Sympathy", defaultRisk: 1000, desc: "Laggard catch-up within surging industry sectors" },
    { key: "MOMENTUM_RUNNER", name: "Momentum Runner", defaultRisk: 1000, desc: "Multi-timeframe trend continuation with ATR trail" },
  ];

  const handleDeposit = async () => {
    const val = Number(depositAmount);
    if (!val || val <= 0) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      await depositToWallet(val);
      setDepositAmount("");
      setStatusMsg({ type: "success", text: `Successfully added ₹${val.toLocaleString("en-IN")} to paper wallet!` });
    } catch {
      setStatusMsg({ type: "error", text: "Failed to deposit funds." });
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Are you sure you want to reset your paper wallet balance to ₹1,00,000? Existing orders will not be touched.")) {
      return;
    }
    setBusy(true);
    setStatusMsg(null);
    try {
      await resetWallet();
      setStatusMsg({ type: "success", text: "Wallet reset to ₹1,00,000 starting capital." });
    } catch {
      setStatusMsg({ type: "error", text: "Failed to reset wallet." });
    } finally {
      setBusy(false);
    }
  };

  const handleAliceBlueLogin = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/aliceblue/auto-login", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        setStatusMsg({ type: "success", text: "AliceBlue session token generated successfully!" });
        setBrokerStatus((prev) => ({ ...prev, authenticated: true, connected: true }));
      } else {
        setStatusMsg({ type: "error", text: data.detail || "Authentication failed." });
      }
    } catch {
      setStatusMsg({ type: "error", text: "Could not trigger broker login." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-[1400px] w-full px-3 sm:px-6 py-4 space-y-6">
        {/* Title & Header */}
        <div className="flex items-center justify-between pb-2 border-b border-subtle">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-accent-violet/15 text-accent-violet border border-accent-violet/30 shadow-sm">
              <Settings size={18} />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-primary font-display">
                Trading Desk Configuration &amp; Controls
              </h2>
              <p className="text-xs text-faint">
                Manage risk parameters, autonomous strategies, AI copilot engine, and broker integrations
              </p>
            </div>
          </div>
        </div>

        {statusMsg && (
          <div
            className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-semibold ${
              statusMsg.type === "success"
                ? "bg-emerald-950/70 border-emerald-800 text-emerald-400"
                : "bg-rose-950/70 border-rose-800 text-rose-400"
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMsg.type === "success" ? (
                <CheckCircle2 size={15} />
              ) : (
                <AlertTriangle size={15} />
              )}
              <span>{statusMsg.text}</span>
            </div>
            <button
              onClick={() => setStatusMsg(null)}
              className="text-xs opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* Multi Sub-tabs Layout: Left Sidebar + Right Active Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Vertical Sub-tabs Sidebar */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-2">
            <div className="p-2 bg-[#10141e]/80 rounded-2xl border border-subtle shadow-sm space-y-1">
              <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-faint font-bold">
                Configuration Sections
              </div>
              {SUB_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeSection === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveSection(tab.key)}
                    className={`w-full text-left p-3 rounded-xl transition-all cursor-pointer flex items-center justify-between group ${
                      isActive
                        ? "bg-blue-600/15 border border-blue-500/40 text-primary shadow-sm"
                        : "hover:bg-white/5 text-muted hover:text-primary border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-8 h-8 rounded-lg grid place-items-center transition-colors ${
                          isActive
                            ? "bg-blue-600/20 text-blue-400"
                            : "bg-surface3/60 text-muted group-hover:text-primary"
                        }`}
                      >
                        <Icon size={16} />
                      </span>
                      <div>
                        <div className={`text-xs font-bold leading-tight ${isActive ? "text-blue-400" : "text-primary"}`}>
                          {tab.label}
                        </div>
                        <div className="text-[10px] text-faint leading-tight mt-0.5">
                          {tab.sublabel}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {tab.badge && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surface3 text-muted border border-white/5">
                          {tab.badge}
                        </span>
                      )}
                      <ChevronRight
                        size={14}
                        className={`transition-transform ${
                          isActive ? "text-blue-400 translate-x-0.5" : "text-faint opacity-40"
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Quick Status Pill */}
            <div className="p-3 bg-surface3/40 rounded-xl border border-subtle text-xs font-mono space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted">Auto-Trading:</span>
                <span className={`font-bold ${configData.auto_trading_enabled ? "text-emerald-400" : "text-amber-400"}`}>
                  {configData.auto_trading_enabled ? "ARMED" : "PAUSED"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted">Market Session:</span>
                <span className={`font-bold ${brokerStatus?.market_open ? "text-emerald-400" : "text-faint"}`}>
                  {brokerStatus?.market_open ? "OPEN" : "CLOSED"}
                </span>
              </div>
            </div>
          </div>

          {/* Right Active Configuration Canvas */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-6">
            {/* SUB-TAB 1: Risk & Allocation */}
            {activeSection === "risk" && (
              <Card
                title="Risk Ceiling & Capital Discipline"
                subtitle="Coupled mathematical parameters guaranteeing total loss prevention"
                icon={Shield}
                className="shadow-sm"
              >
                <div className="space-y-5 text-xs font-mono">
                  {isMarketOpen && (
                    <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 flex items-start gap-2.5 font-sans">
                      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-400" />
                      <div>
                        <div className="font-bold text-xs">Market Hours Freeze Active</div>
                        <div className="text-[11px] leading-tight text-amber-400/90 mt-0.5">
                          Risk parameters are locked between 09:15 and 15:30 IST to prevent runtime order collisions with live position sizing.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mathematical Coupling Formula Bar */}
                  <div className="p-3.5 bg-gradient-to-r from-blue-950/30 to-emerald-950/20 rounded-xl border border-blue-500/20 text-xs font-sans">
                    <div className="flex items-center justify-between text-muted text-xs">
                      <span className="font-semibold text-primary">Coupled Risk Budget Formula:</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        ✓ {configData.max_daily_trades} Trades × ₹{configData.max_risk_per_trade} = ₹{configData.max_daily_trades * configData.max_risk_per_trade} Min Budget
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-faint font-mono">
                      Current Daily Loss Limit: ₹{configData.daily_max_risk} (
                      {configData.daily_max_risk >= configData.max_daily_trades * configData.max_risk_per_trade
                        ? "Safe & Fully Covered"
                        : "Deficit Buffer Warning"}
                      )
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
                    {/* Max Risk Per Trade */}
                    <div className="p-4 bg-surface3/40 rounded-xl border border-subtle space-y-2">
                      <div className="flex justify-between font-sans font-semibold">
                        <span className="text-primary">Strict Max Risk (SL) Per Trade</span>
                        <span className="font-mono font-bold text-accent-blue">
                          ₹{configData.max_risk_per_trade}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="500"
                        max="2000"
                        step="50"
                        disabled={isMarketOpen}
                        value={configData.max_risk_per_trade}
                        onChange={(e) => handleRiskPerTradeChange(e.target.value)}
                        className="w-full accent-accent-blue disabled:opacity-40 cursor-pointer"
                      />
                      <div className="text-[10px] text-faint font-sans">
                        Position sizing hard ceiling: maximum risk never exceeds ₹{configData.max_risk_per_trade} if SL is hit.
                      </div>
                    </div>

                    {/* Max Cash Margin Per Trade */}
                    <div className="p-4 bg-surface3/40 rounded-xl border border-subtle space-y-2">
                      <div className="flex justify-between font-sans font-semibold">
                        <span className="text-primary">Max Cash Margin Per Trade</span>
                        <span className="font-mono font-bold text-accent-cyan">
                          ₹{(configData.max_margin_per_trade || 10000).toLocaleString("en-IN")}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="5000"
                        max="25000"
                        step="1000"
                        disabled={isMarketOpen}
                        value={configData.max_margin_per_trade || 10000}
                        onChange={(e) => handleMarginPerTradeChange(e.target.value)}
                        className="w-full accent-accent-cyan disabled:opacity-40 cursor-pointer"
                      />
                      <div className="text-[10px] text-faint font-sans">
                        5.0x MIS Leverage allows up to ~₹{((configData.max_margin_per_trade || 10000) * 5).toLocaleString("en-IN")} position exposure per trade.
                      </div>
                    </div>

                    {/* Max Daily Auto Trades */}
                    <div className="p-4 bg-surface3/40 rounded-xl border border-subtle space-y-2">
                      <div className="flex justify-between font-sans font-semibold">
                        <span className="text-primary">Max Daily Auto Trades</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {configData.max_daily_trades} Trades / Day
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="6"
                        step="1"
                        disabled={isMarketOpen}
                        value={configData.max_daily_trades}
                        onChange={(e) => handleMaxTradesChange(e.target.value)}
                        className="w-full accent-emerald-500 disabled:opacity-40 cursor-pointer"
                      />
                      <div className="text-[10px] text-faint font-sans">
                        Total daily execution limit across all 5 strategies combined.
                      </div>
                    </div>

                    {/* Daily Stop Loss Budget */}
                    <div className="p-4 bg-surface3/40 rounded-xl border border-subtle space-y-2">
                      <div className="flex justify-between font-sans font-semibold">
                        <span className="text-primary">Daily Stop Loss Circuit-Breaker</span>
                        <span className="font-mono font-bold text-accent-amber">
                          ₹{configData.daily_max_risk}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={Math.max(1500, configData.max_risk_per_trade * configData.max_daily_trades)}
                        max="10000"
                        step="100"
                        disabled={isMarketOpen}
                        value={configData.daily_max_risk}
                        onChange={(e) => handleDailyBudgetChange(e.target.value)}
                        className="w-full accent-accent-amber disabled:opacity-40 cursor-pointer"
                      />
                      <div className="text-[10px] text-faint font-sans">
                        If session loss reaches ₹{configData.daily_max_risk}, the automated system immediately halts all further entries.
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* SUB-TAB 2: Trading Strategies */}
            {activeSection === "strategies" && (
              <Card
                title="Quantitative Strategy Matrix"
                subtitle="Live status, risk quotas, and independent runtime switches for each algorithm"
                icon={Zap}
                className="shadow-sm"
              >
                <div className="space-y-4">
                  <div className="text-xs text-faint">
                    Individually pause, resume, or restart any of the 5 quantitative intraday engines. Pausing releases trade allocations without restarting the backend service.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {STRATEGIES.map((strat) => {
                      const state = configData.strategy_states?.[strat.key] || "RUNNING";
                      return (
                        <div
                          key={strat.key}
                          className="p-4 bg-surface3/40 rounded-xl border border-subtle hover:border-white/15 transition-all flex flex-col justify-between space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-bold text-sm text-primary flex items-center gap-2">
                                <span>{strat.name}</span>
                                <span
                                  className={`w-2 h-2 rounded-full ${
                                    state === "RUNNING"
                                      ? "bg-emerald-400 animate-pulse"
                                      : state === "PAUSED"
                                        ? "bg-amber-400"
                                        : "bg-rose-500"
                                  }`}
                                />
                              </div>
                              <div className="text-[11px] text-faint leading-relaxed mt-1">
                                {strat.desc}
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-bold flex-shrink-0 ${
                                state === "RUNNING"
                                  ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                                  : state === "PAUSED"
                                    ? "bg-amber-950/80 text-amber-400 border border-amber-800"
                                    : "bg-rose-950/80 text-rose-400 border border-rose-800"
                              }`}
                            >
                              {state}
                            </span>
                          </div>

                          <div className="pt-2 border-t border-subtle/50 flex items-center justify-between text-xs font-mono">
                            <div className="flex flex-col text-[10px] space-y-0.5">
                              <span className="text-emerald-400 font-bold">
                                Max SL Risk: ₹{strat.defaultRisk}
                              </span>
                              <span className="text-faint">
                                Margin: ₹{(configData.max_margin_per_trade || 10000).toLocaleString("en-IN")} (5x ~₹{((configData.max_margin_per_trade || 10000) * 5).toLocaleString("en-IN")})
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 font-sans">
                              {state === "RUNNING" ? (
                                <button
                                  type="button"
                                  onClick={() => handleStrategyStateChange(strat.key, "PAUSED")}
                                  className="px-2.5 py-1 rounded-lg bg-amber-950/40 hover:bg-amber-950/80 text-amber-400 border border-amber-800/60 font-bold text-xs transition-colors cursor-pointer"
                                >
                                  Pause
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleStrategyStateChange(strat.key, "RUNNING")}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-950/40 hover:bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-bold text-xs transition-colors cursor-pointer"
                                >
                                  Resume
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  handleStrategyStateChange(
                                    strat.key,
                                    state === "STOPPED" ? "RUNNING" : "STOPPED",
                                  )
                                }
                                className={`px-2.5 py-1 rounded-lg font-bold text-xs border transition-colors cursor-pointer ${
                                  state === "STOPPED"
                                    ? "bg-blue-950/40 text-blue-400 border-blue-800/60 hover:bg-blue-950/80"
                                    : "bg-rose-950/40 text-rose-400 border-rose-800/60 hover:bg-rose-950/80"
                                }`}
                              >
                                {state === "STOPPED" ? "Restart" : "Stop"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            )}

            {/* SUB-TAB 3: AI Copilot & Automation */}
            {activeSection === "copilot" && (
              <Card
                title="AI Copilot & Autonomous Execution"
                subtitle="Google Gemini 3.6 Flash reasoning and automated execution safeguards"
                icon={Bot}
                className="shadow-sm"
              >
                <div className="space-y-5 text-xs font-sans">
                  {/* Gemini AI Status Header */}
                  <div className="p-4 bg-accent-blue/10 rounded-xl border border-accent-blue/30 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-accent-blue flex items-center gap-2 text-sm">
                        <span className="w-2.5 h-2.5 rounded-full bg-accent-blue animate-pulse" />
                        <span>Google Gemini 3.6 Flash</span>
                      </div>
                      <div className="text-xs text-faint mt-0.5">
                        Real-time market sentiment & multi-timeframe trade validation
                      </div>
                    </div>
                    <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-accent-blue/20 text-accent-blue font-bold border border-accent-blue/30">
                      {aiStatus?.status || "LIVE"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-surface3/50 rounded-xl border border-subtle">
                    <div>
                      <div className="font-bold text-sm text-primary">Auto-Execution Master Switch</div>
                      <div className="text-xs text-faint mt-0.5">
                        Automatically places paper orders when quantitative strategies fire with high conviction.
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        saveConfig({
                          ...configData,
                          auto_trading_enabled: !configData.auto_trading_enabled,
                        })
                      }
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        configData.auto_trading_enabled
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800 shadow-sm"
                          : "bg-surface text-muted border border-subtle"
                      }`}
                    >
                      {configData.auto_trading_enabled ? "ENABLED" : "PAUSED"}
                    </button>
                  </div>

                  <div className="p-4 bg-surface3/40 rounded-xl border border-subtle space-y-2">
                    <div className="flex justify-between font-semibold">
                      <span className="text-primary text-xs">Minimum AI / Quant Conviction Threshold</span>
                      <span className="font-mono font-bold text-accent-blue text-sm">
                        {configData.min_ai_confidence}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="85"
                      step="1"
                      value={configData.min_ai_confidence}
                      onChange={(e) =>
                        saveConfig({
                          ...configData,
                          min_ai_confidence: Number(e.target.value),
                        })
                      }
                      className="w-full accent-accent-blue cursor-pointer"
                    />
                    <div className="text-[10px] text-faint">
                      Orders scoring below this threshold require manual user confirmation in the Trade Terminal.
                    </div>
                  </div>

                  <div className="p-4 bg-surface3/40 rounded-xl border border-subtle space-y-2 text-xs">
                    <div className="font-bold text-primary">Execution Time Cutoffs &amp; Safeguards:</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div className="p-2.5 bg-surface3/60 rounded-lg border border-white/5 font-mono">
                        <div className="text-[10px] text-faint uppercase font-sans">ORB Breakouts</div>
                        <div className="font-bold text-primary mt-0.5">10:45 AM Cutoff</div>
                      </div>
                      <div className="p-2.5 bg-surface3/60 rounded-lg border border-white/5 font-mono">
                        <div className="text-[10px] text-faint uppercase font-sans">VWAP Reclaims</div>
                        <div className="font-bold text-primary mt-0.5">11:00 AM Cutoff</div>
                      </div>
                      <div className="p-2.5 bg-surface3/60 rounded-lg border border-white/5 font-mono">
                        <div className="text-[10px] text-faint uppercase font-sans">Scanner Freeze</div>
                        <div className="font-bold text-primary mt-0.5">11:00 AM Daily</div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* SUB-TAB 4: Broker & Feeds */}
            {activeSection === "broker" && (
              <Card
                title="Broker Connectivity & Feed Diagnostics"
                subtitle="Live status of AliceBlue credentials, WebSocket data stream, and alerting pipelines"
                icon={Radio}
                className="shadow-sm"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                  <div className="p-4 bg-surface3/60 rounded-xl border border-subtle space-y-2">
                    <span className="text-[10px] uppercase font-bold text-muted font-sans">
                      Primary Broker (AliceBlue)
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          brokerStatus?.authenticated ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                        }`}
                      />
                      <span className="text-primary font-bold">
                        User: {brokerStatus?.client_id || "2628887"}
                      </span>
                    </div>
                    <div className="text-[11px] text-faint">
                      Status: {brokerStatus?.authenticated ? "Token Active" : "Token Expired"}
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={onOpenBrokerModal}
                        className="text-xs font-sans font-bold px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all cursor-pointer"
                      >
                        Connect Broker
                      </button>
                      <button
                        onClick={handleAliceBlueLogin}
                        disabled={busy}
                        className="text-xs font-sans font-bold px-3 py-1.5 bg-surface3 hover:bg-surface2 text-primary border border-subtle rounded-lg transition-all cursor-pointer"
                      >
                        Auto-Login
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-surface3/60 rounded-xl border border-subtle space-y-2">
                    <span className="text-[10px] uppercase font-bold text-muted font-sans">
                      Market Data Feed
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          brokerStatus?.market_open ? "bg-emerald-500 animate-pulse" : "bg-faint"
                        }`}
                      />
                      <span className="text-primary font-bold">
                        {brokerStatus?.market_open ? "Market Open" : "Market Closed"}
                      </span>
                    </div>
                    <div className="text-[11px] text-faint">
                      WebSocket: Ready on /ws/stream
                    </div>
                    <div className="text-[10px] text-muted font-sans pt-1">
                      Historical 1m &amp; 5m candle cache persisted to SQLite.
                    </div>
                  </div>

                  <div className="p-4 bg-surface3/60 rounded-xl border border-subtle space-y-2">
                    <span className="text-[10px] uppercase font-bold text-muted font-sans">
                      Telegram Alert Bot
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          configData.telegram_alerts_enabled ? "bg-emerald-500" : "bg-faint"
                        }`}
                      />
                      <span className="text-primary font-bold">
                        {configData.telegram_alerts_enabled ? "Active" : "Disabled"}
                      </span>
                    </div>
                    <div className="text-[11px] text-faint">
                      Instant execution broadcasts
                    </div>
                    <div className="pt-2">
                      <button
                        onClick={() =>
                          saveConfig({
                            ...configData,
                            telegram_alerts_enabled: !configData.telegram_alerts_enabled,
                          })
                        }
                        className="text-xs font-sans font-semibold text-blue-400 hover:underline cursor-pointer"
                      >
                        {configData.telegram_alerts_enabled ? "Disable Alerts" : "Enable Alerts"}
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* SUB-TAB 5: Paper Wallet & Capital */}
            {activeSection === "wallet" && (
              <Card
                title="Paper Wallet & Virtual Capital"
                subtitle="Manage starting capital, deposit test funds, or reset balance without wiping trade history"
                icon={Wallet}
                className="shadow-sm"
              >
                <div className="space-y-5 text-xs font-mono">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-surface3/60 rounded-xl border border-subtle">
                      <span className="text-[10px] uppercase font-bold text-muted font-sans">
                        Available Cash Balance
                      </span>
                      <div className="text-xl font-bold text-primary tabular-nums mt-1">
                        ₹{Number(summary?.balance || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-faint font-sans mt-0.5">
                        Free capital available for new margin allocations
                      </div>
                    </div>
                    <div className="p-4 bg-surface3/60 rounded-xl border border-subtle">
                      <span className="text-[10px] uppercase font-bold text-muted font-sans">
                        Intraday Leverage
                      </span>
                      <div className="text-xl font-bold text-accent-blue mt-1">
                        5.0x MIS
                      </div>
                      <div className="text-[10px] text-faint font-sans mt-0.5">
                        ₹1,000 cash buys up to ₹5,000 intraday exposure
                      </div>
                    </div>
                  </div>

                  {/* Deposit funds */}
                  <div className="p-4 bg-surface3/40 rounded-xl border border-subtle space-y-3">
                    <label className="text-xs font-sans font-bold text-primary">
                      Add Virtual Capital (₹)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="e.g. 50000"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        className="flex-1 bg-surface3/80 border border-subtle rounded-xl px-3 py-2 text-xs text-primary focus:outline-none focus:border-accent-blue"
                      />
                      <button
                        onClick={handleDeposit}
                        disabled={busy || !depositAmount}
                        className="px-4 py-2 bg-accent-blue/20 hover:bg-accent-blue/30 text-accent-blue border border-accent-blue/40 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        <PlusCircle size={14} /> Add Funds
                      </button>
                    </div>
                  </div>

                  {/* Reset wallet */}
                  <div className="p-4 bg-surface3/40 rounded-xl border border-subtle flex items-center justify-between">
                    <div>
                      <div className="font-sans font-bold text-primary text-xs">Reset Account Balance</div>
                      <div className="text-[10px] text-faint font-sans mt-0.5">
                        Restores starting virtual cash balance to ₹1,00,000. Existing order history will be preserved.
                      </div>
                    </div>
                    <button
                      onClick={handleReset}
                      disabled={busy}
                      className="px-3.5 py-2 bg-rose-950/40 hover:bg-rose-950/60 text-rose-400 border border-rose-800/40 rounded-xl font-bold transition-all text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw size={13} /> Reset Balance
                    </button>
                  </div>
                </div>
              </Card>
            )}

            {/* SUB-TAB 6: Appearance & Themes */}
            {activeSection === "appearance" && (
              <div className="space-y-6">
                {/* 1. Application-Level Themes */}
                <Card
                  title="Application Color Themes"
                  subtitle="System appearance across the dashboard, analytics, heatmaps, and tables"
                  icon={Palette}
                  className="shadow-sm"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                    {/* Obsidian Navy (Default Dark) */}
                    <button
                      type="button"
                      onClick={() => setTheme("obsidian")}
                      className={`relative p-4 rounded-xl border text-left transition-all cursor-pointer ${
                        theme === "obsidian" || theme === "dark"
                          ? "bg-blue-600/10 border-blue-500 shadow-md ring-1 ring-blue-500/30"
                          : "bg-surface3/40 border-subtle hover:border-strong"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-primary font-display">
                          Obsidian Navy
                        </span>
                        {theme === "obsidian" || theme === "dark" ? (
                          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        ) : null}
                      </div>
                      <p className="text-[11px] text-faint mb-3">
                        Modern fintech blue-slate tone with deep terminal depth.
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-[#06070c] border border-white/10" title="Canvas #06070c" />
                        <span className="w-5 h-5 rounded-md bg-[#0d0f17] border border-white/10" title="Card #0d0f17" />
                        <span className="w-5 h-5 rounded-md bg-[#3b82f6]" title="Accent Blue" />
                        <span className="w-5 h-5 rounded-md bg-[#10b981]" title="Bull Emerald" />
                      </div>
                    </button>

                    {/* OLED Midnight Black */}
                    <button
                      type="button"
                      onClick={() => setTheme("oled")}
                      className={`relative p-4 rounded-xl border text-left transition-all cursor-pointer ${
                        theme === "oled"
                          ? "bg-blue-600/10 border-blue-500 shadow-md ring-1 ring-blue-500/30"
                          : "bg-surface3/40 border-subtle hover:border-strong"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-primary font-display">
                          OLED Midnight Black
                        </span>
                        {theme === "oled" && (
                          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        )}
                      </div>
                      <p className="text-[11px] text-faint mb-3">
                        True #000000 pitch black canvas for pure contrast and battery saving.
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-[#000000] border border-white/20" title="Canvas #000000" />
                        <span className="w-5 h-5 rounded-md bg-[#090d16] border border-white/15" title="Card #090d16" />
                        <span className="w-5 h-5 rounded-md bg-[#3b82f6]" title="Accent Blue" />
                        <span className="w-5 h-5 rounded-md bg-[#10b981]" title="Bull Emerald" />
                      </div>
                    </button>

                    {/* Soft Slate / Cashmere (Glare-Free Light) */}
                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      className={`relative p-4 rounded-xl border text-left transition-all cursor-pointer ${
                        theme === "light"
                          ? "bg-blue-600/10 border-blue-500 shadow-md ring-1 ring-blue-500/30"
                          : "bg-surface3/40 border-subtle hover:border-strong"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-primary font-display">
                          Soft Slate Light
                        </span>
                        {theme === "light" && (
                          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        )}
                      </div>
                      <p className="text-[11px] text-faint mb-3">
                        Calm cashmere matte slate. No harsh #FFFFFF blinding glare.
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-[#edf0f5] border border-slate-300" title="Canvas #edf0f5" />
                        <span className="w-5 h-5 rounded-md bg-[#f7f8fa] border border-slate-300" title="Card #f7f8fa" />
                        <span className="w-5 h-5 rounded-md bg-[#2563eb]" title="Accent Blue" />
                        <span className="w-5 h-5 rounded-md bg-[#059669]" title="Bull Emerald" />
                      </div>
                    </button>

                    {/* Cyber Terminal */}
                    <button
                      type="button"
                      onClick={() => setTheme("cyber")}
                      className={`relative p-4 rounded-xl border text-left transition-all cursor-pointer ${
                        theme === "cyber"
                          ? "bg-emerald-600/10 border-emerald-500 shadow-md ring-1 ring-emerald-500/30"
                          : "bg-surface3/40 border-subtle hover:border-strong"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-primary font-display">
                          Cyber Terminal
                        </span>
                        {theme === "cyber" && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        )}
                      </div>
                      <p className="text-[11px] text-faint mb-3">
                        Institutional Matrix Jade &amp; High-Voltage Emerald glow.
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-[#040807] border border-emerald-900/40" title="Canvas #040807" />
                        <span className="w-5 h-5 rounded-md bg-[#0a1210] border border-emerald-900/40" title="Card #0a1210" />
                        <span className="w-5 h-5 rounded-md bg-[#10b981]" title="Accent Jade" />
                        <span className="w-5 h-5 rounded-md bg-[#34d399]" title="Bull Mint" />
                      </div>
                    </button>
                  </div>
                </Card>

                {/* 2. TradingView Candlestick Chart Palettes */}
                <Card
                  title="TradingView Candlestick Color Palettes"
                  subtitle="Color presets and customizable bull/bear candle styles applied to all charts"
                  icon={Paintbrush}
                  className="shadow-sm"
                >
                  <div className="space-y-4 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {Object.values(CHART_PALETTES).map((pal) => (
                        <button
                          key={pal.id}
                          type="button"
                          onClick={() => setChartTheme(pal.id)}
                          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                            chartTheme === pal.id
                              ? "bg-blue-600/10 border-blue-500 ring-1 ring-blue-500/30"
                              : "bg-surface3/40 border-subtle hover:border-strong"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-primary">{pal.name}</span>
                            {chartTheme === pal.id && (
                              <span className="w-2 h-2 rounded-full bg-blue-400" />
                            )}
                          </div>
                          <p className="text-[10px] text-faint mb-3">{pal.desc}</p>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <span
                                className="w-4 h-6 rounded-sm inline-block shadow-sm"
                                style={{ backgroundColor: pal.upColor }}
                              />
                              <span className="text-[10px] font-mono text-faint">Bull</span>
                            </div>
                            <div className="flex items-center gap-1 ml-2">
                              <span
                                className="w-4 h-6 rounded-sm inline-block shadow-sm"
                                style={{ backgroundColor: pal.downColor }}
                              />
                              <span className="text-[10px] font-mono text-faint">Bear</span>
                            </div>
                          </div>
                        </button>
                      ))}

                      {/* Custom Palette Option */}
                      <button
                        type="button"
                        onClick={() => setChartTheme("custom")}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                          chartTheme === "custom"
                            ? "bg-blue-600/10 border-blue-500 ring-1 ring-blue-500/30"
                            : "bg-surface3/40 border-subtle hover:border-strong"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-primary">Custom Palette</span>
                          {chartTheme === "custom" && (
                            <span className="w-2 h-2 rounded-full bg-blue-400" />
                          )}
                        </div>
                        <p className="text-[10px] text-faint mb-3">Define your own candle colors</p>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <span
                              className="w-4 h-6 rounded-sm inline-block shadow-sm"
                              style={{ backgroundColor: customChartColors.upColor }}
                            />
                            <span className="text-[10px] font-mono text-faint">Bull</span>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <span
                              className="w-4 h-6 rounded-sm inline-block shadow-sm"
                              style={{ backgroundColor: customChartColors.downColor }}
                            />
                            <span className="text-[10px] font-mono text-faint">Bear</span>
                          </div>
                        </div>
                      </button>
                    </div>

                    {/* Custom Color Pickers (when Custom is selected) */}
                    {chartTheme === "custom" && (
                      <div className="p-4 bg-surface3/60 rounded-xl border border-subtle space-y-3">
                        <div className="text-xs font-bold text-primary">
                          Custom Candlestick Color Controls
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-muted mb-1.5">
                              Bullish Candle (Up)
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={customChartColors.upColor}
                                onChange={(e) =>
                                  setCustomChartColors((prev) => ({
                                    ...prev,
                                    upColor: e.target.value,
                                  }))
                                }
                                className="w-8 h-8 rounded border border-subtle cursor-pointer bg-transparent"
                              />
                              <span className="font-mono text-xs text-primary">
                                {customChartColors.upColor}
                              </span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase font-bold text-muted mb-1.5">
                              Bearish Candle (Down)
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={customChartColors.downColor}
                                onChange={(e) =>
                                  setCustomChartColors((prev) => ({
                                    ...prev,
                                    downColor: e.target.value,
                                  }))
                                }
                                className="w-8 h-8 rounded border border-subtle cursor-pointer bg-transparent"
                              />
                              <span className="font-mono text-xs text-primary">
                                {customChartColors.downColor}
                              </span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase font-bold text-muted mb-1.5">
                              Chart Canvas Base
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={
                                  customChartColors.bgColor === "transparent"
                                    ? "#090d16"
                                    : customChartColors.bgColor
                                }
                                onChange={(e) =>
                                  setCustomChartColors((prev) => ({
                                    ...prev,
                                    bgColor: e.target.value,
                                  }))
                                }
                                className="w-8 h-8 rounded border border-subtle cursor-pointer bg-transparent"
                              />
                              <span className="font-mono text-xs text-primary">
                                {customChartColors.bgColor}
                              </span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase font-bold text-muted mb-1.5">
                              Reset to Default
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setCustomChartColors({
                                  upColor: "#10b981",
                                  downColor: "#ef4444",
                                  bgColor: "#090d16",
                                  gridColor: "rgba(255, 255, 255, 0.06)",
                                });
                              }}
                              className="px-3 py-1.5 text-xs bg-surface2 hover:bg-surface3 border border-subtle text-primary rounded-lg font-semibold transition-colors"
                            >
                              Reset Colors
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

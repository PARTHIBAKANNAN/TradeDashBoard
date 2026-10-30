import React, { useState, useEffect } from "react";
import {
  Settings,
  Wallet,
  Shield,
  Bot,
  Zap,
  TrendingUp,
  Bell,
  Radio,
  RefreshCw,
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import Card from "../components/ui/Card.jsx";
import {
  usePnlSummary,
  usePositions,
  depositToWallet,
  resetWallet,
  usePaperTradingSync,
} from "../hooks/useOrders.js";

export default function SettingsScreen() {
  usePaperTradingSync();
  const summary = usePnlSummary();
  const positions = usePositions();

  const [depositAmount, setDepositAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Configuration state
  const [configData, setConfigData] = useState({
    max_risk_per_trade: 1000,
    daily_max_risk: 3400,
    max_daily_trades: 4,
    min_ai_confidence: 70,
    auto_trading_enabled: true,
    telegram_alerts_enabled: true,
    execution_mode: "QUANT_AUTONOMOUS",
    tsl_breakeven_threshold: 0.8,
    tsl_profit_harvest: 1.5,
    tsl_runner_buffer: 0.9,
    broker: "aliceblue",
  });

  const [brokerStatus, setBrokerStatus] = useState(null);

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
  }, []);

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

  const saveConfig = async (newConfig) => {
    setConfigData(newConfig);
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      setStatusMsg({ type: "success", text: "Settings saved to backend." });
    } catch {
      setStatusMsg({ type: "error", text: "Failed to save configuration." });
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
        {/* Title */}
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-accent-violet/15 text-accent-violet border border-accent-violet/30 shadow-sm">
            <Settings size={18} />
          </span>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-primary font-display">
              Trading Desk Configuration &amp; Controls
            </h2>
            <p className="text-xs text-faint">
              Manage virtual capital, risk allocator budgets, auto-execution parameters, and feed diagnostics
            </p>
          </div>
        </div>

        {statusMsg && (
          <div
            className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
              statusMsg.type === "success"
                ? "bg-emerald-950/70 border-emerald-800 text-emerald-400"
                : "bg-rose-950/70 border-rose-800 text-rose-400"
            }`}
          >
            {statusMsg.type === "success" ? (
              <CheckCircle2 size={15} />
            ) : (
              <AlertTriangle size={15} />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Section 1: Paper Wallet & Capital */}
          <Card title="Paper Wallet & Capital Controls" icon={Wallet} className="shadow-sm">
            <div className="space-y-4 text-xs font-mono">
              <div className="p-3 bg-surface3/60 rounded-xl border border-subtle flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted">
                    Available Cash Balance
                  </span>
                  <div className="text-lg font-bold text-primary tabular-nums mt-0.5">
                    ₹{Number(summary?.balance || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-muted">
                    Intraday Leverage
                  </span>
                  <div className="text-sm font-bold text-accent-blue mt-0.5">
                    5.0x MIS
                  </div>
                </div>
              </div>

              {/* Deposit funds */}
              <div className="space-y-2">
                <label className="text-[11px] font-sans font-bold text-muted">
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
                    className="px-4 py-2 bg-accent-blue/20 hover:bg-accent-blue/30 text-accent-blue border border-accent-blue/40 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <PlusCircle size={14} /> Add Funds
                  </button>
                </div>
              </div>

              {/* Reset wallet */}
              <div className="pt-2 border-t border-subtle/60 flex items-center justify-between">
                <div>
                  <div className="font-sans font-bold text-primary">Reset Account</div>
                  <div className="text-[10px] text-faint">
                    Restores starting balance to ₹1,00,000.
                  </div>
                </div>
                <button
                  onClick={handleReset}
                  disabled={busy}
                  className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-950/60 text-rose-400 border border-rose-800/40 rounded-xl font-bold transition-all text-[11px] flex items-center gap-1"
                >
                  <RefreshCw size={12} /> Reset Balance
                </button>
              </div>
            </div>
          </Card>

          {/* Section 2: Risk Ceiling & Budget Allocator */}
          <Card title="Risk Ceiling & Capital Discipline" icon={Shield} className="shadow-sm">
            <div className="space-y-4 text-xs font-mono">
              <div>
                <div className="flex justify-between font-sans font-semibold mb-1">
                  <span>Strict Max Risk Per Trade</span>
                  <span className="font-mono font-bold text-accent-blue">
                    ₹{configData.max_risk_per_trade} (Strict Ceiling)
                  </span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="1500"
                  step="50"
                  value={configData.max_risk_per_trade}
                  onChange={(e) =>
                    saveConfig({
                      ...configData,
                      max_risk_per_trade: Number(e.target.value),
                    })
                  }
                  className="w-full accent-accent-blue"
                />
                <span className="text-[10px] text-faint font-sans">
                  Clamps position quantity so potential loss never exceeds this limit.
                </span>
              </div>

              <div>
                <div className="flex justify-between font-sans font-semibold mb-1">
                  <span>Daily Stop Loss Budget</span>
                  <span className="font-mono font-bold text-accent-amber">
                    ₹{configData.daily_max_risk}
                  </span>
                </div>
                <input
                  type="range"
                  min="2000"
                  max="6000"
                  step="200"
                  value={configData.daily_max_risk}
                  onChange={(e) =>
                    saveConfig({
                      ...configData,
                      daily_max_risk: Number(e.target.value),
                    })
                  }
                  className="w-full accent-accent-amber"
                />
                <span className="text-[10px] text-faint font-sans">
                  Total loss circuit-breaker across all automated strategies.
                </span>
              </div>

              <div>
                <div className="flex justify-between font-sans font-semibold mb-1">
                  <span>Max Daily Auto Trades</span>
                  <span className="font-mono font-bold text-primary">
                    {configData.max_daily_trades} Trades / Day
                  </span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="8"
                  step="1"
                  value={configData.max_daily_trades}
                  onChange={(e) =>
                    saveConfig({
                      ...configData,
                      max_daily_trades: Number(e.target.value),
                    })
                  }
                  className="w-full accent-emerald-500"
                />
              </div>

              <div className="p-2.5 bg-surface3/40 rounded-xl border border-subtle text-[11px] font-sans text-muted">
                <span className="font-bold text-primary">Strategy Family Allocations:</span>
                <div className="grid grid-cols-2 gap-2 mt-1.5 text-[10px] font-mono">
                  <div>ORB: 1 Trade · ₹1,000 Risk</div>
                  <div>VWAP Retest: 1 Trade · ₹800 Risk</div>
                  <div>OI Squeeze: 1 Trade · ₹800 Risk</div>
                  <div>Sector Lag: 1 Trade · ₹800 Risk</div>
                </div>
              </div>
            </div>
          </Card>

          {/* Section 3: Automation & AI Engine */}
          <Card title="Automation & AI Copilot Engine" icon={Bot} className="shadow-sm">
            <div className="space-y-4 text-xs font-sans">
              <div className="flex items-center justify-between p-3 bg-surface3/50 rounded-xl border border-subtle">
                <div>
                  <div className="font-bold text-primary">Auto-Execution Master Switch</div>
                  <div className="text-[10px] text-faint">
                    Automatically executes paper trades when strategies trigger.
                  </div>
                </div>
                <button
                  onClick={() =>
                    saveConfig({
                      ...configData,
                      auto_trading_enabled: !configData.auto_trading_enabled,
                    })
                  }
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    configData.auto_trading_enabled
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                      : "bg-surface text-muted border border-subtle"
                  }`}
                >
                  {configData.auto_trading_enabled ? "ENABLED" : "PAUSED"}
                </button>
              </div>

              <div>
                <div className="flex justify-between font-semibold mb-1">
                  <span>Minimum AI / Quant Conviction</span>
                  <span className="font-mono font-bold text-accent-blue">
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
                  className="w-full accent-accent-blue"
                />
              </div>

              <div className="p-3 bg-surface3/40 rounded-xl border border-subtle space-y-2 text-[11px]">
                <div className="font-bold text-primary">Execution Time Cutoffs:</div>
                <div className="flex justify-between text-muted font-mono">
                  <span>ORB Breakouts:</span>
                  <span className="text-primary font-bold">10:45 AM (Session min 90)</span>
                </div>
                <div className="flex justify-between text-muted font-mono">
                  <span>VWAP Reclaims:</span>
                  <span className="text-primary font-bold">11:00 AM (Session min 105)</span>
                </div>
                <div className="flex justify-between text-muted font-mono">
                  <span>Scanner Halt:</span>
                  <span className="text-primary font-bold">11:00 AM</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Section 4: Staged Trailing Stop Rungs */}
          <Card title="Staged Trailing Rungs (Harvesting Rules)" icon={TrendingUp} className="shadow-sm">
            <div className="space-y-3 text-xs font-sans">
              <div className="p-2.5 bg-surface3/50 rounded-xl border border-subtle flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-950 text-blue-400 border border-blue-800 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <div className="font-bold text-primary">Stage 1: Auto-Breakeven at +0.80R</div>
                  <div className="text-[10px] text-faint">
                    Once peak price reaches +0.80R gain, Stop Loss automatically ratchets to Entry + Brokerage buffer (100% risk-free trade).
                  </div>
                </div>
              </div>

              <div className="p-2.5 bg-surface3/50 rounded-xl border border-subtle flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-amber-950 text-amber-400 border border-amber-800 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <div className="font-bold text-primary">Stage 2: Profit Harvest at +1.50R</div>
                  <div className="text-[10px] text-faint">
                    When peak reaches +1.50R, locks in at least +0.75R guaranteed profit, preventing winning trades from evaporating.
                  </div>
                </div>
              </div>

              <div className="p-2.5 bg-surface3/50 rounded-xl border border-subtle flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <div className="font-bold text-primary">Stage 3: Swing Runner Beyond +2.0R</div>
                  <div className="text-[10px] text-faint">
                    Locks +1.20R floor and trails behind completed 5m candle swing structures to harvest multi-hour macro trends.
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Section 5: Broker Diagnostics */}
          <Card title="Broker & Market Feed Diagnostics" icon={Radio} className="md:col-span-2 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
              <div className="p-3 bg-surface3/60 rounded-xl border border-subtle space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted font-sans">
                  Primary Broker (AliceBlue)
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      brokerStatus?.authenticated ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                  <span className="text-primary font-bold">
                    User: {brokerStatus?.client_id || "2628887"}
                  </span>
                </div>
                <div className="text-[10px] text-faint">
                  Status: {brokerStatus?.authenticated ? "Token Active" : "Token Expired"}
                </div>
                <button
                  onClick={handleAliceBlueLogin}
                  disabled={busy}
                  className="mt-2 text-[10px] font-sans font-bold px-2 py-1 bg-accent-blue/15 hover:bg-accent-blue/25 text-accent-blue border border-accent-blue/30 rounded-lg transition-all"
                >
                  Trigger Morning Re-login
                </button>
              </div>

              <div className="p-3 bg-surface3/60 rounded-xl border border-subtle space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted font-sans">
                  Market Data Feed
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      brokerStatus?.market_open ? "bg-emerald-500 animate-pulse" : "bg-faint"
                    }`}
                  />
                  <span className="text-primary font-bold">
                    {brokerStatus?.market_open ? "Market Open" : "Market Closed"}
                  </span>
                </div>
                <div className="text-[10px] text-faint">
                  WebSocket: Ready on /ws/stream
                </div>
              </div>

              <div className="p-3 bg-surface3/60 rounded-xl border border-subtle space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted font-sans">
                  Telegram Alert Bot
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      configData.telegram_alerts_enabled ? "bg-emerald-500" : "bg-faint"
                    }`}
                  />
                  <span className="text-primary font-bold">
                    {configData.telegram_alerts_enabled ? "Active" : "Disabled"}
                  </span>
                </div>
                <div className="text-[10px] text-faint">
                  Instant real-time execution broadcast
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

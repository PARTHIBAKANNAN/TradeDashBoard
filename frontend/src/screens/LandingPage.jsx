import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Shield,
  TrendingUp,
  Cpu,
  Zap,
  Globe,
  Layers,
  ArrowRight,
  Lock,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Flame,
  LineChart,
  Sparkles,
  ChevronRight,
  X,
  Mail,
  UserCheck,
  Building,
  DollarSign,
  PieChart,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient.js";
import ThemeToggle from "../components/ThemeToggle.jsx";

export default function LandingPage({ onLoginSuccess }) {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [activeFeatureTab, setActiveFeatureTab] = useState("quant");
  const [summaryData, setSummaryData] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  // Access request form state
  const [requestName, setRequestName] = useState("");
  const [requestEmail, setRequestEmail] = useState("");
  const [requestExperience, setRequestExperience] = useState("Pro Trader");
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function fetchPublicSummary() {
      try {
        const res = await fetch("/api/public/summary");
        if (res.ok && mounted) {
          const data = await res.json();
          setSummaryData(data);
        }
      } catch (err) {
        console.warn("Could not load public market summary", err);
      } finally {
        if (mounted) setLoadingSummary(false);
      }
    }
    fetchPublicSummary();
    const interval = setInterval(fetchPublicSummary, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError || !data.session) {
        setLoginError("Invalid credentials. Please verify your email and password.");
        return;
      }
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ access_token: data.session.access_token }),
      });
      if (r.ok) {
        setShowLoginModal(false);
        onLoginSuccess();
      } else {
        setLoginError("Could not establish terminal session. Contact administrator.");
      }
    } catch {
      setLoginError("Server communication failed.");
    } finally {
      setLoginBusy(false);
    }
  };

  const handleRequestSubmit = (e) => {
    e.preventDefault();
    setRequestSubmitted(true);
  };

  const nifty = summaryData?.nifty || {
    ltp: 24252.0,
    pct_change: 0.21,
    symbol: "NIFTY 50",
  };
  const breadth = summaryData?.market_breadth || {
    advancing: 134,
    declining: 76,
    total: 210,
    advance_pct: 63.8,
  };
  const topGainers = summaryData?.top_gainers || [];
  const topLosers = summaryData?.top_losers || [];
  const cues = summaryData?.global_cues || {};

  return (
    <div className="min-h-screen bg-[#070709] text-primary font-sans selection:bg-accent-blue selection:text-white overflow-x-hidden">
      {/* Dynamic Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-accent-blue/10 blur-[130px]" />
        <div className="absolute top-[20%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-accent-violet/10 blur-[140px]" />
        <div className="absolute bottom-[-10%] left-[25%] w-[40vw] h-[40vw] rounded-full bg-emerald-500/5 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* ── Top Navbar ── */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#070709]/80 border-b border-subtle transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-blue via-accent-indigo to-accent-violet grid place-items-center font-black text-white shadow-glow-sm">
              T
            </div>
            <div>
              <span className="font-bold text-base tracking-tight bg-gradient-to-r from-white via-text to-muted bg-clip-text text-transparent font-display">
                TradeDashBoard
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20 font-bold">
                Quant Terminal
              </span>
            </div>
          </div>

          {/* Quick links & Actions */}
          <div className="flex items-center gap-2.5 sm:gap-4">
            <a
              href="#market-radar"
              className="hidden md:inline-flex text-xs font-semibold text-muted hover:text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-surface3/60"
            >
              Live Radar
            </a>
            <a
              href="#superpowers"
              className="hidden md:inline-flex text-xs font-semibold text-muted hover:text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-surface3/60"
            >
              Superpowers
            </a>
            <a
              href="#architecture"
              className="hidden lg:inline-flex text-xs font-semibold text-muted hover:text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-surface3/60"
            >
              Architecture
            </a>

            <button
              onClick={() => setShowAccessModal(true)}
              className="text-xs font-bold px-3.5 py-1.5 rounded-xl border border-strong bg-surface2 hover:bg-surface3 text-primary transition-all shadow-sm"
            >
              Request Access
            </button>

            <button
              onClick={() => setShowLoginModal(true)}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-1.5 rounded-xl bg-gradient-to-r from-accent-blue to-accent-violet hover:opacity-95 text-white transition-all shadow-glow-sm"
            >
              <Lock size={12} />
              <span>Client Sign In</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section className="relative z-10 pt-12 pb-16 sm:pt-20 sm:pb-24 px-4 sm:px-6 max-w-7xl mx-auto text-center">
        {/* Pulsing Status Pill */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-mono font-bold mb-6 shadow-sm"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>INSTITUTIONAL QUANT ENGINE · 210 F&O STOCKS LIVE</span>
        </motion.div>

        {/* Hero Title */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight font-display text-white max-w-5xl mx-auto leading-[1.1] mb-6"
        >
          Trade the Indian Markets with{" "}
          <span className="bg-gradient-to-r from-accent-blue via-cyan-400 to-accent-violet bg-clip-text text-transparent">
            Autonomous AI &amp; Quantitative
          </span>{" "}
          Precision.
        </motion.h1>

        {/* Hero Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-base sm:text-xl text-muted max-w-3xl mx-auto leading-relaxed mb-8 sm:mb-10 font-normal"
        >
          Sub-second tick processing across 210 F&amp;O symbols, 5-tier quantitative momentum
          filters, Google Gemini 3.6 Flash risk auditing, and automated paper trade execution.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-wrap items-center justify-center gap-3.5 mb-14"
        >
          <button
            onClick={() => setShowLoginModal(true)}
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-accent-blue via-accent-indigo to-accent-violet hover:opacity-90 text-white font-bold text-sm shadow-glow transition-all transform hover:-translate-y-0.5"
          >
            <span>Launch Live Terminal</span>
            <ArrowRight size={16} />
          </button>
          <a
            href="#market-radar"
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-surface2/80 hover:bg-surface3 border border-strong text-primary font-bold text-sm transition-all"
          >
            <Activity size={16} className="text-accent-blue" />
            <span>Explore Free Market Radar</span>
          </a>
        </motion.div>

        {/* Key Numerical Metrics Bar */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto"
        >
          <div className="bg-surface2/60 backdrop-blur-md border border-subtle rounded-2xl p-4 text-center">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white mb-1">
              210+
            </div>
            <div className="text-[11px] text-faint uppercase font-bold tracking-wider">
              Tracked F&amp;O Equities
            </div>
          </div>
          <div className="bg-surface2/60 backdrop-blur-md border border-subtle rounded-2xl p-4 text-center">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-accent-blue mb-1">
              250ms
            </div>
            <div className="text-[11px] text-faint uppercase font-bold tracking-wider">
              Delta Diff Stream
            </div>
          </div>
          <div className="bg-surface2/60 backdrop-blur-md border border-subtle rounded-2xl p-4 text-center">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-cyan-400 mb-1">
              5-Tier
            </div>
            <div className="text-[11px] text-faint uppercase font-bold tracking-wider">
              Quant Gatekeeper
            </div>
          </div>
          <div className="bg-surface2/60 backdrop-blur-md border border-subtle rounded-2xl p-4 text-center">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400 mb-1">
              +1.0R
            </div>
            <div className="text-[11px] text-faint uppercase font-bold tracking-wider">
              Auto-Breakeven Protection
            </div>
          </div>
        </motion.div>

        {/* Hero Visual Preview Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-12 rounded-3xl overflow-hidden border border-strong/80 shadow-glow relative max-w-5xl mx-auto group"
        >
          <div className="relative aspect-video w-full overflow-hidden bg-surface3">
            <img
              src="/assets/hero-bg.jpg"
              alt="Institutional Quantitative Trading Terminal"
              className="w-full h-full object-cover transform group-hover:scale-102 transition-transform duration-700 opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#070709] via-transparent to-transparent opacity-80" />
            <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between flex-wrap gap-4 text-left">
              <div>
                <span className="text-xs font-mono font-bold text-accent-blue block mb-1">
                  CORE TERMINAL INTERFACE
                </span>
                <h3 className="text-lg sm:text-2xl font-bold text-white">
                  Real-time Cross-Sectional Heatmaps &amp; 5m CVD Delta Engine
                </h3>
              </div>
              <button
                onClick={() => setShowLoginModal(true)}
                className="px-4 py-2 rounded-xl bg-white text-black font-bold text-xs hover:bg-neutral-200 transition-all shadow-lg flex items-center gap-1.5"
              >
                <span>Enter Terminal</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── PUBLIC LIVE MARKET RADAR SECTION (FREE INSIGHTS) ── */}
      <section id="market-radar" className="relative z-10 py-16 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-accent-blue uppercase tracking-wider mb-2">
            <Activity size={14} />
            <span>Public Market Overview</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-white font-display">
            Live Market Radar &amp; Macro Pulse
          </h2>
          <p className="text-sm text-muted max-w-2xl mx-auto mt-2">
            Real-time public benchmarks updated every 15 seconds directly from our in-memory engine.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Nifty Benchmark & Breadth Card */}
          <div className="bg-surface2/80 backdrop-blur-xl border border-subtle rounded-3xl p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-faint uppercase font-mono tracking-wider">
                  BENCHMARK
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  LIVE STREAM
                </span>
              </div>
              <div className="flex items-baseline gap-3 mb-2">
                <h3 className="text-3xl font-extrabold font-mono text-white">
                  ₹{Number(nifty.ltp).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </h3>
                <span
                  className={`text-sm font-mono font-bold ${
                    nifty.pct_change >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {nifty.pct_change >= 0 ? "+" : ""}
                  {Number(nifty.pct_change).toFixed(2)}%
                </span>
              </div>
              <p className="text-xs text-muted mb-6">
                NIFTY 50 Index reference quote for intraday relative strength calculations.
              </p>
            </div>

            {/* Market Breadth Bar */}
            <div className="border-t border-subtle pt-4">
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <span className="text-emerald-400 font-bold">
                  ▲ {breadth.advancing} Advancing ({breadth.advance_pct}%)
                </span>
                <span className="text-rose-400 font-bold">
                  ▼ {breadth.declining} Declining
                </span>
              </div>
              <div className="w-full h-2.5 bg-surface3 rounded-full overflow-hidden flex">
                <div
                  className="bg-emerald-500 transition-all duration-500"
                  style={{ width: `${breadth.advance_pct}%` }}
                />
                <div
                  className="bg-rose-500 transition-all duration-500"
                  style={{ width: `${100 - breadth.advance_pct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Top Gainers & Losers Card */}
          <div className="bg-surface2/80 backdrop-blur-xl border border-subtle rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-faint uppercase font-mono tracking-wider">
                TOP MOVERS SPOTLIGHT
              </span>
              <Flame size={14} className="text-amber-400" />
            </div>

            <div className="space-y-2.5">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                🟢 Top Momentum Leaders
              </span>
              <div className="grid grid-cols-2 gap-2">
                {topGainers.slice(0, 2).map((stk, idx) => (
                  <div key={idx} className="bg-surface3/60 border border-subtle rounded-xl p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs font-mono text-white">{stk.symbol}</span>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">
                        +{Number(stk.pct_change).toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-[10px] text-faint">₹{Number(stk.ltp).toFixed(1)}</div>
                  </div>
                ))}
              </div>

              <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider block pt-2">
                🔴 Top Sector Laggards
              </span>
              <div className="grid grid-cols-2 gap-2">
                {topLosers.slice(0, 2).map((stk, idx) => (
                  <div key={idx} className="bg-surface3/60 border border-subtle rounded-xl p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs font-mono text-white">{stk.symbol}</span>
                      <span className="text-[10px] font-mono text-rose-400 font-bold">
                        {Number(stk.pct_change).toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-[10px] text-faint">₹{Number(stk.ltp).toFixed(1)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Global Macro & AI Synthesis */}
          <div className="bg-surface2/80 backdrop-blur-xl border border-subtle rounded-3xl p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-faint uppercase font-mono tracking-wider">
                  GLOBAL MACRO CUES
                </span>
                <Globe size={14} className="text-accent-blue" />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-4">
                {cues.gift_nifty && (
                  <div className="bg-surface3/60 p-2.5 rounded-xl border border-subtle">
                    <span className="text-[9px] text-faint uppercase block">GIFT NIFTY</span>
                    <span className="font-bold text-white">{cues.gift_nifty}</span>
                  </div>
                )}
                {cues.crude_oil && (
                  <div className="bg-surface3/60 p-2.5 rounded-xl border border-subtle">
                    <span className="text-[9px] text-faint uppercase block">BRENT CRUDE</span>
                    <span className="font-bold text-white">{cues.crude_oil}</span>
                  </div>
                )}
                {cues.gold_commodities && (
                  <div className="bg-surface3/60 p-2.5 rounded-xl border border-subtle">
                    <span className="text-[9px] text-faint uppercase block">GOLD / METALS</span>
                    <span className="font-bold text-white truncate block">
                      {cues.gold_commodities}
                    </span>
                  </div>
                )}
                {cues.dollar_index && (
                  <div className="bg-surface3/60 p-2.5 rounded-xl border border-subtle">
                    <span className="text-[9px] text-faint uppercase block">DXY DOLLAR</span>
                    <span className="font-bold text-white">{cues.dollar_index}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-accent-blue/5 border border-accent-blue/20 rounded-2xl p-3.5">
              <span className="text-[10px] font-mono text-accent-blue font-bold flex items-center gap-1 mb-1">
                <Sparkles size={11} /> AI MARKET SYNTHESIS
              </span>
              <p className="text-xs text-muted leading-relaxed line-clamp-3">
                {summaryData?.ai_summary}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5 SUPERPOWERS SECTION ── */}
      <section id="superpowers" className="relative z-10 py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-subtle">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-accent-violet uppercase tracking-wider mb-2">
            <Cpu size={14} />
            <span>Institutional Terminal Capabilities</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold text-white font-display">
            Built for Systematic Edge
          </h2>
          <p className="text-sm sm:text-base text-muted max-w-2xl mx-auto mt-3">
            Five synchronized algorithmic layers eliminate guesswork, noise, and emotional bias.
          </p>
        </div>

        {/* Feature Interactive Showcase Tabs */}
        <div className="flex justify-center gap-2 mb-10 overflow-x-auto pb-2">
          {[
            { id: "quant", label: "5-Tier Quant Gatekeeper", icon: Shield },
            { id: "ai", label: "Gemini 3.6 Flash AI Copilot", icon: Sparkles },
            { id: "smart", label: "Smart Money & CVD", icon: BarChart3 },
            { id: "paper", label: "Auto-Breakeven Paper Terminal", icon: TrendingUp },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeFeatureTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFeatureTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                  active
                    ? "bg-accent-blue text-white shadow-glow-sm"
                    : "bg-surface2/80 text-muted hover:text-white border border-subtle"
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Feature Detail Card */}
        <div className="bg-surface2/60 backdrop-blur-2xl border border-strong rounded-3xl p-6 sm:p-10 shadow-glow">
          {activeFeatureTab === "quant" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-mono text-accent-blue font-bold uppercase tracking-wider block mb-2">
                  TIER 1 TO TIER 5 FILTERING
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-white font-display mb-4">
                  Multi-Factor Quant Gatekeeper
                </h3>
                <p className="text-sm text-muted leading-relaxed mb-6">
                  98% of intraday breakout signals fail because traders buy overextended tops or
                  against sector trends. Our math engine enforces 5 mathematical checkpoints before
                  a trade is ever considered:
                </p>
                <div className="space-y-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-accent-blue flex-shrink-0 mt-0.5" />
                    <span>
                      <b>Sector Breadth &ge; 65%</b>: Guarantees broad sector tailwinds rather than
                      isolated stock pumps.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-accent-blue flex-shrink-0 mt-0.5" />
                    <span>
                      <b>Wilder's RSI-14 Momentum Zone</b>: Must sit strictly in [55, 72] for Buys,
                      preventing overbought exhaustion.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-accent-blue flex-shrink-0 mt-0.5" />
                    <span>
                      <b>VWAP Retest Zone (0.10%–0.65%)</b>: Catches institutional pullbacks near
                      the average price.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-accent-blue flex-shrink-0 mt-0.5" />
                    <span>
                      <b>14-Day ADR Room Check</b>: Asserts day range used is &lt; 85% of Average
                      Daily Range.
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-surface3/80 border border-subtle rounded-2xl p-6 font-mono text-xs text-muted space-y-3">
                <div className="text-accent-blue font-bold">// MATHEMATICAL CONSTRAINTS</div>
                <div className="bg-surface/80 p-3 rounded-xl border border-subtle text-text">
                  RS = (%Δ Stock) − (%Δ NIFTY 50) &ge; 1.0%
                </div>
                <div className="bg-surface/80 p-3 rounded-xl border border-subtle text-text">
                  0.10% &le; |LTP − VWAP| / VWAP &le; 0.65%
                </div>
                <div className="bg-surface/80 p-3 rounded-xl border border-subtle text-text">
                  Sector Advancers / Total &ge; 65.0%
                </div>
                <div className="bg-surface/80 p-3 rounded-xl border border-subtle text-emerald-400">
                  STATUS: 1-3 HIGH CONVICTION CANDIDATES / DAY
                </div>
              </div>
            </div>
          )}

          {activeFeatureTab === "ai" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-mono text-accent-violet font-bold uppercase tracking-wider block mb-2">
                  INTELLIGENCE MATRIX
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-white font-display mb-4">
                  Google Gemini 3.6 Flash AI Copilot
                </h3>
                <p className="text-sm text-muted leading-relaxed mb-6">
                  Gemini acts as an adversarial risk auditor. It continuously ingests 4 live real-time
                  news wire streams (US Tech, Commodities, Tariffs/SEBI, Indian Corporate) to disqualify
                  traps before execution:
                </p>
                <div className="space-y-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-accent-violet flex-shrink-0 mt-0.5" />
                    <span>
                      <b>4-Stream Global Wire</b>: Live sentiment on Nasdaq, Brent Crude, Gold, SEBI
                      circulars, and earnings.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-accent-violet flex-shrink-0 mt-0.5" />
                    <span>
                      <b>Adversarial Red-Flag Filter</b>: Actively looks for reasons <i>NOT</i> to take a
                      trade (overhead resistance, chopsy liquidity).
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-accent-violet flex-shrink-0 mt-0.5" />
                    <span>
                      <b>Live Header Status Badge</b>: Real-time 30s status polling (
                      <span className="text-emerald-400">🟢 Gemini 3.6 Flash Live</span> vs{" "}
                      <span className="text-amber-400">⚡ Institutional Model</span>).
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl overflow-hidden border border-subtle shadow-lg">
                <img
                  src="/assets/ai-copilot.jpg"
                  alt="AI Copilot Neural Matrix"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}

          {activeFeatureTab === "smart" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider block mb-2">
                  INSTITUTIONAL ORDER FLOW
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-white font-display mb-4">
                  Smart Money Engine &amp; CVD Delta
                </h3>
                <p className="text-sm text-muted leading-relaxed mb-6">
                  Tracks institutional footprint across 210 F&amp;O stocks by benchmarking current
                  volume velocity against a 20-day historical time-slot database:
                </p>
                <div className="space-y-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-cyan-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <b>20-Day Fresh Turnover Ratio</b>: Identifies true institutional participation vs
                      retail noise.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-cyan-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <b>Cumulative Volume Delta (CVD)</b>: Tick-rule delta pane visualizes net aggressive
                      market buyers vs sellers.
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-surface3/80 border border-subtle rounded-2xl p-6 font-mono text-xs space-y-3">
                <div className="text-cyan-400 font-bold">// SMART MONEY SCORING FORMULA</div>
                <div className="bg-surface/80 p-3 rounded-xl border border-subtle text-text">
                  Score = (0.40 × RVOL_pct) + (0.35 × FreshTurnover_pct) + (0.25 × RS_pct)
                </div>
                <div className="bg-surface/80 p-3 rounded-xl border border-subtle text-emerald-400">
                  OUTPUT: Top-10 Institutional Flow Ranking updated every 5 mins
                </div>
              </div>
            </div>
          )}

          {activeFeatureTab === "paper" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-mono text-emerald-400 font-bold uppercase tracking-wider block mb-2">
                  RISK PRESERVATION
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-white font-display mb-4">
                  Auto-Breakeven Paper Terminal
                </h3>
                <p className="text-sm text-muted leading-relaxed mb-6">
                  Full-featured paper trading simulation terminal with institutional risk protection
                  features:
                </p>
                <div className="space-y-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <b>Auto-Breakeven at +1.0R</b>: The moment a trade reaches 1x risk profit, the stop
                      loss automatically moves to Entry (risk-free trade guarantee).
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <b>Dynamic 1.5x ATR Stops</b>: Anchors stop losses to true market structure
                      rather than arbitrary percentages.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <b>Interactive Visual Chart Lines</b>: Blue Entry, Red SL, Green Breakeven, and
                      Green Target lines drawn directly on 5m charts.
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-surface3/80 border border-subtle rounded-2xl p-6 font-mono text-xs space-y-3">
                <div className="text-emerald-400 font-bold">// RISK-ADJUSTED SIZING FORMULA</div>
                <div className="bg-surface/80 p-3 rounded-xl border border-subtle text-text">
                  Max Daily Risk = ₹2,000 | Max Auto Trades = 3
                </div>
                <div className="bg-surface/80 p-3 rounded-xl border border-subtle text-text">
                  Quantity = int((₹2,000 / 3) / SL_distance_inr)
                </div>
                <div className="bg-surface/80 p-3 rounded-xl border border-subtle text-emerald-400">
                  Target = Entry ± (2.0 × SL_distance) [1:2 Risk-Reward]
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── INVITE-ONLY ACCESS CALLOUT ── */}
      <section id="architecture" className="relative z-10 py-20 px-4 sm:px-6 max-w-5xl mx-auto text-center">
        <div className="bg-gradient-to-b from-surface2 to-surface border border-strong rounded-3xl p-8 sm:p-14 shadow-glow relative overflow-hidden">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/30 text-xs font-mono font-bold mb-4">
            <Lock size={12} />
            <span>INVITE-ONLY ACCESS</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white font-display mb-4">
            Ready for Institutional Execution?
          </h2>
          <p className="text-sm sm:text-base text-muted max-w-xl mx-auto mb-8">
            TradeDashBoard is reserved for verified algorithmic and systematic traders. Request your
            access token or contact our institutional onboarding team.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setShowAccessModal(true)}
              className="px-6 py-3 rounded-2xl bg-white text-black font-bold text-sm hover:bg-neutral-200 transition-all shadow-md"
            >
              Request Access Onboarding
            </button>
            <button
              onClick={() => setShowLoginModal(true)}
              className="px-6 py-3 rounded-2xl bg-surface3 border border-strong text-white font-bold text-sm hover:bg-surface4 transition-all"
            >
              Client Sign In
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t border-subtle py-10 px-4 sm:px-6 max-w-7xl mx-auto text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-faint">
        <div>
          <span>&copy; {new Date().getFullYear()} TradeDashBoard. Institutional Quantitative Terminal.</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="/docs/architecture.html"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors font-mono"
          >
            System Architecture Spec ↗
          </a>
          <ThemeToggle />
        </div>
      </footer>

      {/* ── CLIENT LOGIN MODAL ── */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/75 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-surface2/95 border border-strong rounded-3xl p-7 sm:p-8 shadow-glow"
            >
              <button
                onClick={() => setShowLoginModal(false)}
                className="absolute top-5 right-5 text-muted hover:text-white p-1 rounded-lg hover:bg-surface3 transition-colors"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-blue to-accent-violet grid place-items-center font-black text-white shadow-glow-sm">
                  T
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-display">Client Terminal Login</h3>
                  <p className="text-xs text-muted">Enter authorized credentials to continue</p>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
                    Terminal Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="trader@institution.com"
                    className="w-full bg-surface3 border border-strong rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-accent-blue transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-surface3 border border-strong rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-accent-blue transition-colors"
                  />
                </div>

                {loginError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loginBusy}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-accent-blue to-accent-violet hover:opacity-90 disabled:opacity-50 text-white font-bold text-sm shadow-glow-sm transition-all"
                >
                  {loginBusy ? "Authenticating Session..." : "Sign In to Terminal"}
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-subtle text-center text-xs text-faint">
                Don't have credentials?{" "}
                <button
                  onClick={() => {
                    setShowLoginModal(false);
                    setShowAccessModal(true);
                  }}
                  className="text-accent-blue font-bold hover:underline"
                >
                  Request Onboarding Access
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── REQUEST ACCESS MODAL ── */}
      <AnimatePresence>
        {showAccessModal && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/75 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-surface2/95 border border-strong rounded-3xl p-7 sm:p-8 shadow-glow"
            >
              <button
                onClick={() => {
                  setShowAccessModal(false);
                  setRequestSubmitted(false);
                }}
                className="absolute top-5 right-5 text-muted hover:text-white p-1 rounded-lg hover:bg-surface3 transition-colors"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 grid place-items-center font-black">
                  <UserCheck size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-display">
                    Request Terminal Access
                  </h3>
                  <p className="text-xs text-muted">Invite-only institutional onboarding</p>
                </div>
              </div>

              {!requestSubmitted ? (
                <form onSubmit={handleRequestSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={requestName}
                      onChange={(e) => setRequestName(e.target.value)}
                      placeholder="Parthiba Kannan"
                      className="w-full bg-surface3 border border-strong rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-accent-blue transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      required
                      value={requestEmail}
                      onChange={(e) => setRequestEmail(e.target.value)}
                      placeholder="trader@domain.com"
                      className="w-full bg-surface3 border border-strong rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-accent-blue transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
                      Trading Profile
                    </label>
                    <select
                      value={requestExperience}
                      onChange={(e) => setRequestExperience(e.target.value)}
                      className="w-full bg-surface3 border border-strong rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-accent-blue transition-colors"
                    >
                      <option value="Quantitative Trader">Quantitative / Algorithmic Trader</option>
                      <option value="Prop Desk / Institutional">Prop Desk / Institutional Trader</option>
                      <option value="Active F&O Trader">Active F&amp;O Derivatives Trader</option>
                      <option value="Individual Systematic">Individual Systematic Trader</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white font-bold text-sm shadow-md transition-all mt-2"
                  >
                    Submit Onboarding Request
                  </button>
                </form>
              ) : (
                <div className="text-center py-6 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 grid place-items-center mx-auto">
                    <CheckCircle2 size={24} />
                  </div>
                  <h4 className="font-bold text-base text-white">Request Received</h4>
                  <p className="text-xs text-muted leading-relaxed">
                    Thank you, <b>{requestName}</b>. Our onboarding team has received your details (
                    {requestEmail}). We will contact you via email to provision your terminal credentials.
                  </p>
                  <button
                    onClick={() => {
                      setShowAccessModal(false);
                      setRequestSubmitted(false);
                    }}
                    className="mt-4 px-5 py-2 rounded-xl bg-surface3 border border-strong text-white font-bold text-xs hover:bg-surface4 transition-all"
                  >
                    Done
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

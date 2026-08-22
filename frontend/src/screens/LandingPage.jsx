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
  ChevronDown,
  X,
  Mail,
  UserCheck,
  Building,
  Target,
  Clock,
  Compass,
  Eye,
  Sliders,
  Award,
  HelpCircle,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient.js";
import ThemeToggle from "../components/ThemeToggle.jsx";

export default function LandingPage({ onLoginSuccess }) {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [activeScreenTab, setActiveScreenTab] = useState("ranking");
  const [activeFeatureTab, setActiveFeatureTab] = useState("quant");
  const [openFaq, setOpenFaq] = useState(null);
  const [summaryData, setSummaryData] = useState(null);

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  // Access request form state
  const [requestName, setRequestName] = useState("");
  const [requestEmail, setRequestEmail] = useState("");
  const [requestRole, setRequestRole] = useState("Proprietary / Quant Trader");
  const [requestNote, setRequestNote] = useState("");
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
        console.warn("Could not fetch public market data", err);
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
      const { data, error: authError } = await supabase.auth.signInWithPassword(
        {
          email,
          password,
        },
      );
      if (authError || !data.session) {
        setLoginError(
          "Invalid credentials. Please check your email and password.",
        );
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
        setLoginError(
          "Session verification failed. Contact onboarding administrator.",
        );
      }
    } catch {
      setLoginError(
        "Network error. Unable to reach terminal authentication server.",
      );
    } finally {
      setLoginBusy(false);
    }
  };

  const handleRequestSubmit = (e) => {
    e.preventDefault();
    setRequestSubmitted(true);
<<<<<<< HEAD
    // Create mailto link for direct transmission
    const subject = encodeURIComponent(
      `PulseHunter Terminal Access Request - ${requestName}`,
    );
=======
    const subject = encodeURIComponent(`PulseHunter Terminal Access Request - ${requestName}`);
>>>>>>> 6e815ff (feat: enhance and integrate bull logo, expand landing page with 7 screen walkthroughs and FAQ, and remove architecture link)
    const body = encodeURIComponent(
      `Applicant Name: ${requestName}\n` +
        `Applicant Email: ${requestEmail}\n` +
        `Trading Profile: ${requestRole}\n` +
        `Trading Objectives: ${requestNote || "N/A"}\n\n` +
        `Request submitted for PulseHunter Institutional Quantitative Terminal.`,
    );
    window.open(
      `mailto:parthisivaram45@gmail.com?subject=${subject}&body=${body}`,
      "_blank",
    );
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

  const screens = [
    {
      id: "ranking",
      title: "Live Ranking Matrix",
      badge: "Real-Time 250ms",
      desc: "Cross-sectional market scanner dynamically ranking 210 F&O stocks by relative strength against NIFTY 50, day range position, and momentum velocity.",
      highlights: ["Relative Strength outperformance tracking", "Day range expansion tracking", "Instant filter by sector & signal state"],
    },
    {
      id: "heatmap",
      title: "Market Breadth & Sector Heatmap",
      badge: "Visual Hierarchy",
      desc: "Instant bird's-eye view of capital flow across all major Indian sectors: Banking, IT, Auto, Metals, FMCG, Energy, and Pharma.",
      highlights: ["Sector-level money flow concentration", "Color-coded market breadth ratios", "Constituent stock drilldown"],
    },
    {
      id: "insights",
      title: "AI Pre-Market Wire & Catalyst Feed",
      badge: "Gemini 3.6 Flash",
      desc: "Multi-stream global news wire synthesis distilling US Tech cues, commodity shifts, regulatory circulars, and quarterly earnings into actionable market bias.",
      highlights: ["4-stream macro wire synthesis", "Thematic focus stock catalyst mapping", "Adversarial red-flag risk evaluation"],
    },
    {
      id: "smart",
      title: "Smart Money & Order Flow Scanner",
      badge: "Institutional Footprint",
      desc: "Identifies institutional block accumulation by comparing real-time volume velocity against 20-day historical trading time slots.",
      highlights: ["Abnormal turnover surge detection", "Cumulative Volume Delta (CVD) integration", "Smart Money institutional ranking score"],
    },
    {
      id: "charts",
      title: "Lightweight Candlestick Charts",
      badge: "Sub-Second Rendering",
      desc: "Hardware-accelerated 5-minute candlestick charts with real-time tick aggregation, VWAP bands, prior day highs/lows, and order flow delta panes.",
      highlights: ["Volume-Weighted Average Price (VWAP)", "CVD tick-rule sub-chart indicator", "Interactive multi-timeframe candle navigation"],
    },
    {
      id: "watchlist",
      title: "Tactical Watchlist & Alerts",
      badge: "Custom Pinning",
      desc: "Curated high-conviction watchlist with real-time alert tags for opening range breakouts, VWAP pullbacks, and abnormal volume expansions.",
      highlights: ["Personalized symbol pinning", "Real-time catalyst badges", "One-click charting and execution routing"],
    },
    {
      id: "positions",
      title: "Auto-Breakeven Paper Terminal",
      badge: "Capital Preservation",
      desc: "Institutional paper execution simulator with automated position sizing, dynamic ATR volatility stop-losses, and automatic breakeven ratcheting at +1.0R profit.",
      highlights: ["Zero-risk Auto-Breakeven floor at +1R", "Dynamic 1:2 Risk-Reward profit targets", "Real-time P&L mark-to-market ledger"],
    },
  ];

  const faqs = [
    {
      q: "What is PulseHunter?",
      a: "PulseHunter is an institutional quantitative trading terminal and market intelligence workstation designed specifically for active Indian equity and F&O derivatives market participants. It merges high-frequency tick aggregation, multi-factor algorithmic screening, and Google Gemini AI risk synthesis into a unified command center.",
    },
    {
      q: "How does the Auto-Breakeven protection work?",
      a: "When an active paper trading position achieves +1.0R in profit (equivalent to 1x the initial stop-loss risk distance), PulseHunter automatically ratchets the stop-loss floor up to the entry price. This mathematically guarantees that a profitable winning trade will never turn into a losing trade.",
    },
    {
      q: "What makes the Smart Money engine different from regular volume?",
      a: "Regular volume indicators only show total shares traded without context. PulseHunter's Smart Money Engine benchmarks volume velocity against a 20-day historical time-slot database, revealing whether current turnover represents genuine institutional block accumulation or retail noise.",
    },
    {
      q: "How can I get access to PulseHunter?",
      a: "PulseHunter operates on an invite-only onboarding model. Prospective quantitative traders and institutional desks can request access credentials directly from PARTHIBAKANNAN S using the 'Request Access' onboarding form or via email at parthisivaram45@gmail.com.",
    },
    {
      q: "Can I use PulseHunter without live capital risk?",
      a: "Yes. PulseHunter includes a fully integrated institutional Paper Trading Terminal with a realistic ₹1,00,000 simulated account, automated bracket order execution, and full margin tracking to test quantitative strategies safely.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#07080c] text-white font-sans selection:bg-cyan-500 selection:text-black overflow-x-hidden antialiased">
      {/* Dynamic Ambient Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-15%] left-[-10%] w-[55vw] h-[55vw] rounded-full bg-cyan-500/8 blur-[140px]" />
        <div className="absolute top-[25%] right-[-12%] w-[50vw] h-[50vw] rounded-full bg-indigo-600/10 blur-[150px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[45vw] h-[45vw] rounded-full bg-emerald-500/6 blur-[130px]" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.6) 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      {/* ── TOP HEADER NAVBAR ── */}
      <header className="sticky top-0 z-40 backdrop-blur-2xl bg-[#07080c]/85 border-b border-white/[0.06] transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/assets/logo.jpg"
              alt="PulseHunter Logo"
              className="w-9 h-9 rounded-xl object-cover border border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.35)]"
            />
            <div className="flex items-baseline gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent font-display">
                PulseHunter
              </span>
              <span className="hidden sm:inline-flex text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold tracking-wider">
                Since 2026
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <a
              href="#market-radar"
              className="hidden md:inline-flex text-xs font-medium text-neutral-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/[0.04]"
            >
              Market Radar
            </a>
            <a
              href="#screens"
              className="hidden md:inline-flex text-xs font-medium text-neutral-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/[0.04]"
            >
              Terminal Screens
            </a>
            <a
              href="#capabilities"
              className="hidden md:inline-flex text-xs font-medium text-neutral-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/[0.04]"
            >
              Superpowers
            </a>
            <a
              href="#faq"
              className="hidden lg:inline-flex text-xs font-medium text-neutral-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/[0.04]"
            >
              FAQ
            </a>

            <button
              onClick={() => setShowAccessModal(true)}
              className="text-xs font-semibold px-3.5 py-1.5 rounded-xl border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] text-neutral-200 hover:text-white transition-all shadow-sm"
            >
              Request Access
            </button>

            <button
              onClick={() => setShowLoginModal(true)}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)]"
            >
              <Lock size={12} className="stroke-[2.5]" />
              <span>Client Sign In</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section className="relative z-10 pt-14 pb-16 sm:pt-20 sm:pb-24 px-4 sm:px-6 max-w-7xl mx-auto text-center">
        {/* Brand Emblem Pill */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs font-mono font-bold mb-8 shadow-sm"
        >
          <img src="/assets/logo.jpg" alt="Logo" className="w-4 h-4 rounded-full object-cover" />
          <span>PULSEHUNTER · SYSTEMATIC TRADING &amp; AI WORKSTATION</span>
        </motion.div>

        {/* Hero Title */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight font-display text-white max-w-5xl mx-auto leading-[1.08] mb-6"
        >
          Hunt the Market Pulse with{" "}
          <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
            Systematic Alpha &amp; AI
          </span>{" "}
          Precision.
        </motion.h1>

        {/* Hero Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-base sm:text-xl text-neutral-300 max-w-3xl mx-auto leading-relaxed mb-10 font-normal"
        >
<<<<<<< HEAD
          Continuous sub-second order flow tracking across 210 F&amp;O symbols,
          5-tier quantitative momentum gating, Google Gemini 3.6 Flash risk
          auditing, and automated paper trade management.
=======
          The institutional quantitative intelligence command center for active Indian equity traders.
          Real-time order flow scanning, 5-tier systematic screening, Gemini AI catalyst analysis, and
          automated paper trade execution.
>>>>>>> 6e815ff (feat: enhance and integrate bull logo, expand landing page with 7 screen walkthroughs and FAQ, and remove architecture link)
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-wrap items-center justify-center gap-4 mb-16"
        >
          <button
            onClick={() => setShowLoginModal(true)}
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-teal-400 to-blue-500 hover:opacity-95 text-black font-extrabold text-sm shadow-[0_0_25px_rgba(6,182,212,0.35)] transition-all transform hover:-translate-y-0.5"
          >
            <span>Launch PulseHunter Terminal</span>
            <ArrowRight size={16} className="stroke-[2.5]" />
          </button>
          <button
            onClick={() => setShowAccessModal(true)}
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.12] text-white font-bold text-sm transition-all"
          >
            <UserCheck size={16} className="text-cyan-400" />
            <span>Request Access from PARTHIBAKANNAN S</span>
          </button>
        </motion.div>

        {/* Numerical Metrics Bar */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4 max-w-4xl mx-auto"
        >
          <div className="bg-white/[0.025] backdrop-blur-xl border border-white/[0.07] rounded-2xl p-4 text-center">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white mb-1">
              210+
            </div>
            <div className="text-[11px] text-neutral-400 uppercase font-semibold tracking-wider">
              Tracked F&amp;O Equities
            </div>
          </div>
          <div className="bg-white/[0.025] backdrop-blur-xl border border-white/[0.07] rounded-2xl p-4 text-center">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-cyan-400 mb-1">
              250ms
            </div>
            <div className="text-[11px] text-neutral-400 uppercase font-semibold tracking-wider">
              State Delta Stream
            </div>
          </div>
          <div className="bg-white/[0.025] backdrop-blur-xl border border-white/[0.07] rounded-2xl p-4 text-center">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-indigo-400 mb-1">
              7 Screens
            </div>
            <div className="text-[11px] text-neutral-400 uppercase font-semibold tracking-wider">
              Integrated Workstation
            </div>
          </div>
          <div className="bg-white/[0.025] backdrop-blur-xl border border-white/[0.07] rounded-2xl p-4 text-center">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400 mb-1">
              +1.0R
            </div>
            <div className="text-[11px] text-neutral-400 uppercase font-semibold tracking-wider">
              Auto-Breakeven Floor
            </div>
          </div>
        </motion.div>

        {/* Hero Visual Preview Showcase Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-14 rounded-3xl overflow-hidden border border-white/[0.1] shadow-[0_20px_60px_rgba(0,0,0,0.7)] relative max-w-5xl mx-auto group"
        >
          <div className="relative aspect-video w-full overflow-hidden bg-neutral-950">
            <img
              src="/assets/hero-bg.jpg"
              alt="PulseHunter Systematic Terminal Interface"
              className="w-full h-full object-cover transform group-hover:scale-102 transition-transform duration-700 opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#07080c] via-transparent to-transparent opacity-80" />
            <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between flex-wrap gap-4 text-left">
              <div>
                <span className="text-xs font-mono font-bold text-cyan-400 block mb-1">
                  SYSTEMATIC QUANT WORKSTATION
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

<<<<<<< HEAD
      {/* ── PUBLIC LIVE MARKET RADAR SECTION (FREE INSIGHTS) ── */}
      <section
        id="market-radar"
        className="relative z-10 py-16 px-4 sm:px-6 max-w-7xl mx-auto"
      >
=======
      {/* ── PUBLIC LIVE MARKET RADAR SECTION ── */}
      <section id="market-radar" className="relative z-10 py-16 px-4 sm:px-6 max-w-7xl mx-auto">
>>>>>>> 6e815ff (feat: enhance and integrate bull logo, expand landing page with 7 screen walkthroughs and FAQ, and remove architecture link)
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider mb-2">
            <Activity size={14} />
            <span>Public Market Overview</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-white font-display">
            Live Market Radar &amp; Macro Pulse
          </h2>
          <p className="text-sm text-neutral-400 max-w-2xl mx-auto mt-2">
<<<<<<< HEAD
            Real-time public benchmarks updated continuously from PulseHunter's
            in-memory stream.
=======
            Real-time public benchmarks refreshed continuously directly from PulseHunter's in-memory engine.
>>>>>>> 6e815ff (feat: enhance and integrate bull logo, expand landing page with 7 screen walkthroughs and FAQ, and remove architecture link)
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Nifty Benchmark & Breadth */}
          <div className="bg-white/[0.025] backdrop-blur-xl border border-white/[0.08] rounded-3xl p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-neutral-400 uppercase font-mono tracking-wider">
                  BENCHMARK
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  LIVE STREAM
                </span>
              </div>
              <div className="flex items-baseline gap-3 mb-2">
                <h3 className="text-3xl font-extrabold font-mono text-white">
                  ₹
                  {Number(nifty.ltp).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                  })}
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
              <p className="text-xs text-neutral-400 mb-6">
                NIFTY 50 reference anchor for cross-sectional relative strength
                calculations.
              </p>
            </div>

            {/* Breadth Indicator */}
            <div className="border-t border-white/[0.06] pt-4">
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <span className="text-emerald-400 font-bold">
                  ▲ {breadth.advancing} Advancing ({breadth.advance_pct}%)
                </span>
                <span className="text-rose-400 font-bold">
                  ▼ {breadth.declining} Declining
                </span>
              </div>
              <div className="w-full h-2.5 bg-neutral-900 rounded-full overflow-hidden flex">
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

          {/* Top Movers Spotlight */}
          <div className="bg-white/[0.025] backdrop-blur-xl border border-white/[0.08] rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-neutral-400 uppercase font-mono tracking-wider">
                MARKET MOVERS SPOTLIGHT
              </span>
              <Flame size={14} className="text-amber-400" />
            </div>

            <div className="space-y-3">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                🟢 Momentum Leaders
              </span>
              <div className="grid grid-cols-2 gap-2">
                {topGainers.slice(0, 2).map((stk, idx) => (
                  <div
                    key={idx}
                    className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs font-mono text-white">
                        {stk.symbol}
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">
                        +{Number(stk.pct_change).toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      ₹{Number(stk.ltp).toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>

              <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider block pt-1">
                🔴 Sector Laggards
              </span>
              <div className="grid grid-cols-2 gap-2">
                {topLosers.slice(0, 2).map((stk, idx) => (
                  <div
                    key={idx}
                    className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs font-mono text-white">
                        {stk.symbol}
                      </span>
                      <span className="text-[10px] font-mono text-rose-400 font-bold">
                        {Number(stk.pct_change).toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      ₹{Number(stk.ltp).toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Global Cues & AI Synthesis */}
          <div className="bg-white/[0.025] backdrop-blur-xl border border-white/[0.08] rounded-3xl p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-neutral-400 uppercase font-mono tracking-wider">
                  GLOBAL MACRO CUES
                </span>
                <Globe size={14} className="text-cyan-400" />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-4">
                {cues.gift_nifty && (
                  <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/[0.06]">
                    <span className="text-[9px] text-neutral-400 uppercase block">
                      GIFT NIFTY
                    </span>
                    <span className="font-bold text-white">
                      {cues.gift_nifty}
                    </span>
                  </div>
                )}
                {cues.crude_oil && (
                  <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/[0.06]">
                    <span className="text-[9px] text-neutral-400 uppercase block">
                      BRENT CRUDE
                    </span>
                    <span className="font-bold text-white">
                      {cues.crude_oil}
                    </span>
                  </div>
                )}
                {cues.gold_commodities && (
                  <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/[0.06]">
                    <span className="text-[9px] text-neutral-400 uppercase block">
                      GOLD / METALS
                    </span>
                    <span className="font-bold text-white truncate block">
                      {cues.gold_commodities}
                    </span>
                  </div>
                )}
                {cues.dollar_index && (
                  <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/[0.06]">
                    <span className="text-[9px] text-neutral-400 uppercase block">
                      DXY DOLLAR
                    </span>
                    <span className="font-bold text-white">
                      {cues.dollar_index}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-3.5">
              <span className="text-[10px] font-mono text-cyan-400 font-bold flex items-center gap-1 mb-1">
                <Sparkles size={11} /> AI MARKET SYNTHESIS
              </span>
              <p className="text-xs text-neutral-300 leading-relaxed line-clamp-3">
                {summaryData?.ai_summary}
              </p>
            </div>
          </div>
        </div>
      </section>

<<<<<<< HEAD
      {/* ── 5 CORE CAPABILITIES (PROFESSIONAL SENIOR UX PRESENTATION) ── */}
      <section
        id="capabilities"
        className="relative z-10 py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-white/[0.06]"
      >
=======
      {/* ── THE 7 TERMINAL SCREENS WALKTHROUGH ── */}
      <section id="screens" className="relative z-10 py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-white/[0.06]">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider mb-2">
            <Layers size={14} />
            <span>Complete Platform Walkthrough</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold text-white font-display">
            The 7 Integrated Workstations
          </h2>
          <p className="text-sm sm:text-base text-neutral-400 max-w-2xl mx-auto mt-3">
            A comprehensive suite of institutional tools tailored for rapid intraday decision-making.
          </p>
        </div>

        {/* Screen Switcher Tabs */}
        <div className="flex justify-start lg:justify-center gap-2 mb-10 overflow-x-auto pb-2">
          {screens.map((sc) => {
            const active = activeScreenTab === sc.id;
            return (
              <button
                key={sc.id}
                onClick={() => setActiveScreenTab(sc.id)}
                className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                  active
                    ? "bg-white text-black font-extrabold shadow-lg"
                    : "bg-white/[0.03] text-neutral-400 hover:text-white border border-white/[0.08]"
                }`}
              >
                {sc.title}
              </button>
            );
          })}
        </div>

        {/* Active Screen Detail */}
        {screens.map((sc) => {
          if (sc.id !== activeScreenTab) return null;
          return (
            <motion.div
              key={sc.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-white/[0.025] backdrop-blur-2xl border border-white/[0.1] rounded-3xl p-6 sm:p-10 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider">
                  SCREEN SPOTLIGHT
                </span>
                <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
                  {sc.badge}
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-white font-display mb-3">
                {sc.title}
              </h3>
              <p className="text-sm sm:text-base text-neutral-300 max-w-3xl leading-relaxed mb-6">
                {sc.desc}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/[0.06]">
                {sc.highlights.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-neutral-300">
                    <CheckCircle2 size={15} className="text-cyan-400 flex-shrink-0" />
                    <span>{h}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </section>

      {/* ── 4-STEP SYSTEMATIC WORKFLOW ── */}
      <section className="relative z-10 py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-white/[0.06]">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-teal-400 uppercase tracking-wider mb-2">
            <Compass size={14} />
            <span>Execution Protocol</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold text-white font-display">
            The 4-Step Quantitative Pipeline
          </h2>
          <p className="text-sm sm:text-base text-neutral-400 max-w-2xl mx-auto mt-3">
            How systematic momentum traders utilize PulseHunter from pre-market preparation to trade execution.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white/[0.025] border border-white/[0.08] rounded-3xl p-6 relative">
            <div className="text-xs font-mono font-bold text-cyan-400 mb-2">01 · 08:45 AM IST</div>
            <h4 className="font-bold text-base text-white mb-2">Pre-Market Wire Synthesis</h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Gemini AI digests global macro cues, Brent crude, metals, and Indian corporate catalysts to set the daily sector bias.
            </p>
          </div>
          <div className="bg-white/[0.025] border border-white/[0.08] rounded-3xl p-6 relative">
            <div className="text-xs font-mono font-bold text-cyan-400 mb-2">02 · 09:15 AM IST</div>
            <h4 className="font-bold text-base text-white mb-2">Intraday Momentum Scan</h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
              210 F&amp;O symbols are continuously scanned for relative strength outperformance and day range expansion.
            </p>
          </div>
          <div className="bg-white/[0.025] border border-white/[0.08] rounded-3xl p-6 relative">
            <div className="text-xs font-mono font-bold text-cyan-400 mb-2">03 · 09:45 AM IST</div>
            <h4 className="font-bold text-base text-white mb-2">Order Flow Validation</h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Candidate setups are cross-checked against 20-day fresh turnover velocity and Cumulative Volume Delta (CVD) aggression.
            </p>
          </div>
          <div className="bg-white/[0.025] border border-white/[0.08] rounded-3xl p-6 relative">
            <div className="text-xs font-mono font-bold text-cyan-400 mb-2">04 · Execution</div>
            <h4 className="font-bold text-base text-white mb-2">Protected Execution</h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Orders are placed with automated 1.5x ATR stops and automatically ratcheted to Breakeven at +1.0R profit.
            </p>
          </div>
        </div>
      </section>

      {/* ── 5 SUPERPOWERS SECTION ── */}
      <section id="capabilities" className="relative z-10 py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-white/[0.06]">
>>>>>>> 6e815ff (feat: enhance and integrate bull logo, expand landing page with 7 screen walkthroughs and FAQ, and remove architecture link)
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider mb-2">
            <Cpu size={14} />
            <span>Institutional Superpowers</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold text-white font-display">
            Built for Systematic Edge
          </h2>
          <p className="text-sm sm:text-base text-neutral-400 max-w-2xl mx-auto mt-3">
            Five synchronized algorithmic layers eliminate emotional bias,
            noise, and execution friction.
          </p>
        </div>

        {/* Feature Tabs */}
        <div className="flex justify-center gap-2 mb-10 overflow-x-auto pb-2">
          {[
            {
              id: "quant",
              label: "Multi-Factor Quant Gatekeeper",
              icon: Shield,
            },
            { id: "ai", label: "Gemini 3.6 Flash AI Copilot", icon: Sparkles },
            { id: "smart", label: "Smart Money & CVD Engine", icon: BarChart3 },
            {
              id: "paper",
              label: "Auto-Breakeven Paper Terminal",
              icon: TrendingUp,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeFeatureTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFeatureTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                  active
                    ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-extrabold shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                    : "bg-white/[0.03] text-neutral-400 hover:text-white border border-white/[0.08]"
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Feature Display Card */}
        <div className="bg-white/[0.025] backdrop-blur-2xl border border-white/[0.1] rounded-3xl p-6 sm:p-10 shadow-2xl">
          {activeFeatureTab === "quant" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider block mb-2">
                  5-TIER ADAPTIVE FILTERING
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-white font-display mb-4">
                  Multi-Factor Quant Gatekeeper
                </h3>
                <p className="text-sm text-neutral-300 leading-relaxed mb-6">
                  98% of intraday breakout signals fail because traders chase
                  overbought momentum or trade against prevailing sector
                  currents. PulseHunter's algorithmic gatekeeper verifies
                  structural market conditions before any signal qualifies:
                </p>
                <div className="space-y-3 text-xs text-neutral-300">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      size={16}
                      className="text-cyan-400 flex-shrink-0 mt-0.5"
                    />
                    <span>
                      <b>Sector Breadth Alignment</b>: Requires institutional
                      participation across constituent stocks to confirm genuine
                      sector tailwinds.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      size={16}
                      className="text-cyan-400 flex-shrink-0 mt-0.5"
                    />
                    <span>
                      <b>RSI Momentum Calibration</b>: Filters out exhausted
                      tops while ensuring active buying pressure is confirmed.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      size={16}
                      className="text-cyan-400 flex-shrink-0 mt-0.5"
                    />
                    <span>
                      <b>VWAP Retest Confirmation</b>: Captures institutional
                      support bounces near intraday volume weighted averages.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      size={16}
                      className="text-cyan-400 flex-shrink-0 mt-0.5"
                    />
                    <span>
                      <b>Average Daily Range (ADR) Room</b>: Asserts sufficient
                      remaining daily room to achieve 1:2 risk-reward profit
                      targets.
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-950/80 border border-white/[0.08] rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <span className="text-xs font-mono font-bold text-cyan-400">
                    QUANT GATE CHECKPOINT STATUS
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    LIVE GATED
                  </span>
                </div>
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/[0.05]">
                    <span className="text-neutral-300">
                      Intraday Relative Strength
                    </span>
                    <span className="text-emerald-400 font-bold font-mono">
                      ✓ Outperforming Index
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/[0.05]">
                    <span className="text-neutral-300">
                      Sector Breadth Confirmation
                    </span>
                    <span className="text-emerald-400 font-bold font-mono">
                      ✓ Institutional Tailwinds
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/[0.05]">
                    <span className="text-neutral-300">
                      VWAP Retest Proximity
                    </span>
                    <span className="text-emerald-400 font-bold font-mono">
                      ✓ Retest Zone Active
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/[0.05]">
                    <span className="text-neutral-300">
                      14-Day ADR Expansion Room
                    </span>
                    <span className="text-emerald-400 font-bold font-mono">
                      ✓ Expansion Room OK
                    </span>
                  </div>
                </div>
                <div className="text-[11px] text-neutral-400 text-center pt-2">
                  Filters 210 watchlist equities into{" "}
                  <b>1–3 high-conviction candidates per day</b>.
                </div>
              </div>
            </div>
          )}

          {activeFeatureTab === "ai" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-mono text-indigo-400 font-bold uppercase tracking-wider block mb-2">
                  ADVERSARIAL RISK AUDITING
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-white font-display mb-4">
                  Google Gemini 3.6 Flash AI Copilot
                </h3>
                <p className="text-sm text-neutral-300 leading-relaxed mb-6">
                  Gemini acts as an adversarial risk auditor. Ingesting 4
                  real-time global news feeds (Global Macro, Commodities/Forex,
                  Regulatory/SEBI, and Indian Corporate earnings), it actively
                  looks for trap catalysts before trade execution:
                </p>
                <div className="space-y-3 text-xs text-neutral-300">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      size={16}
                      className="text-indigo-400 flex-shrink-0 mt-0.5"
                    />
                    <span>
                      <b>Multi-Stream Global Wire</b>: Real-time sentiment on
                      Nasdaq, Brent Crude, Gold, SEBI circulars, and quarterly
                      earnings.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      size={16}
                      className="text-indigo-400 flex-shrink-0 mt-0.5"
                    />
                    <span>
                      <b>Adversarial Red-Flag Defense</b>: Detects overhead
                      resistance clusters, exhausted liquidity, and unexpected
                      macro headwinds.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      size={16}
                      className="text-indigo-400 flex-shrink-0 mt-0.5"
                    />
                    <span>
                      <b>Real-time Engine Health</b>: Top-header live status
                      badge indicating active AI models with automatic fallback.
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl">
                <img
                  src="/assets/ai-copilot.jpg"
                  alt="PulseHunter AI Copilot Neural Matrix"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}

          {activeFeatureTab === "smart" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider block mb-2">
                  ORDER FLOW PRECISION
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-white font-display mb-4">
                  Smart Money &amp; CVD Delta Engine
                </h3>
                <p className="text-sm text-neutral-300 leading-relaxed mb-6">
                  Uncovers institutional accumulation and distribution
                  footprints across 210 F&amp;O equities by tracking volume
                  velocity and real-time tick aggressive order flow:
                </p>
                <div className="space-y-3 text-xs text-neutral-300">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      size={16}
                      className="text-cyan-400 flex-shrink-0 mt-0.5"
                    />
                    <span>
                      <b>20-Day Historical Velocity Benchmarking</b>: Identifies
                      abnormal fresh turnover bursts representing institutional
                      block positioning.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      size={16}
                      className="text-cyan-400 flex-shrink-0 mt-0.5"
                    />
                    <span>
                      <b>Cumulative Volume Delta (CVD)</b>: Sub-chart pane
                      visualizing net aggressive market buying vs selling
                      pressure on 5m candles.
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-950/80 border border-white/[0.08] rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <span className="text-xs font-mono font-bold text-cyan-400">
                    INSTITUTIONAL FLOW HEATMAP
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    CVD TICK-RULE
                  </span>
                </div>
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/[0.05]">
                    <span className="text-neutral-300 font-mono">
                      TATASTEEL
                    </span>
                    <span className="text-emerald-400 font-bold font-mono">
                      +12.4M CVD (Aggressive Buys)
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/[0.05]">
                    <span className="text-neutral-300 font-mono">MARUTI</span>
                    <span className="text-emerald-400 font-bold font-mono">
                      +8.1M CVD (Accumulation)
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/[0.05]">
                    <span className="text-neutral-300 font-mono">INFY</span>
                    <span className="text-rose-400 font-bold font-mono">
                      -9.2M CVD (Distribution)
                    </span>
                  </div>
                </div>
                <div className="text-[11px] text-neutral-400 text-center pt-2">
                  Real-time delta classification separating market orders from
                  limit liquidity.
                </div>
              </div>
            </div>
          )}

          {activeFeatureTab === "paper" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-mono text-emerald-400 font-bold uppercase tracking-wider block mb-2">
                  CAPITAL PRESERVATION &amp; SAFETY
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-white font-display mb-4">
                  Auto-Breakeven Paper Terminal
                </h3>
                <p className="text-sm text-neutral-300 leading-relaxed mb-6">
                  Complete paper trading terminal engineered to instill
                  institutional execution discipline with zero capital risk:
                </p>
                <div className="space-y-3 text-xs text-neutral-300">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      size={16}
                      className="text-emerald-400 flex-shrink-0 mt-0.5"
                    />
                    <span>
                      <b>Auto-Breakeven at +1.0R Profit</b>: The instant a
                      position reaches 1x risk distance, the stop loss is
                      ratcheted to Entry, ensuring a winning trade never turns
                      into a loss.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      size={16}
                      className="text-emerald-400 flex-shrink-0 mt-0.5"
                    />
                    <span>
                      <b>Dynamic ATR Structural Stops</b>: Anchors stops to real
                      volatility structure instead of arbitrary fixed
                      percentages.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      size={16}
                      className="text-emerald-400 flex-shrink-0 mt-0.5"
                    />
                    <span>
                      <b>Visual Chart Order Lines</b>: Live Entry, Stop Loss,
                      Breakeven, and 1:2 RR Target levels rendered directly on
                      Lightweight Charts.
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-950/80 border border-white/[0.08] rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    ACTIVE TRADE PROTECTION MONITOR
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    PROTECTED
                  </span>
                </div>
                <div className="space-y-2.5 text-xs font-mono">
                  <div className="flex items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/[0.05]">
                    <span className="text-cyan-400">Entry (Long)</span>
                    <span className="text-white">₹1,240.00</span>
                  </div>
                  <div className="flex items-center justify-between bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/30">
                    <span className="text-emerald-400 font-bold">
                      🛡️ Breakeven SL Ratchet
                    </span>
                    <span className="text-emerald-400 font-bold">
                      ₹1,240.00 (Risk: ₹0.00)
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/[0.05]">
                    <span className="text-emerald-400">Target 1:2 RR</span>
                    <span className="text-white">₹1,270.00</span>
                  </div>
                </div>
                <div className="text-[11px] text-neutral-400 text-center pt-2">
                  Automatic trailing stop loss with institutional risk-reward
                  symmetry.
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── FREQUENTLY ASKED QUESTIONS (FAQ) ── */}
      <section id="faq" className="relative z-10 py-20 px-4 sm:px-6 max-w-4xl mx-auto border-t border-white/[0.06]">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider mb-2">
            <HelpCircle size={14} />
            <span>Knowledge Base</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white font-display">
            Frequently Asked Questions
          </h2>
          <p className="text-sm text-neutral-400 max-w-xl mx-auto mt-2">
            Everything you need to know about the PulseHunter quantitative terminal.
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="bg-white/[0.025] border border-white/[0.08] rounded-2xl overflow-hidden transition-all"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-sm text-white hover:text-cyan-400 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    size={16}
                    className={`flex-shrink-0 text-neutral-400 transition-transform duration-300 ${
                      isOpen ? "rotate-180 text-cyan-400" : ""
                    }`}
                  />
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="px-5 pb-5 text-xs text-neutral-300 leading-relaxed border-t border-white/[0.04] pt-3"
                    >
                      {faq.a}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── ONBOARDING ACCESS CALLOUT ── */}
      <section className="relative z-10 py-20 px-4 sm:px-6 max-w-5xl mx-auto text-center">
        <div className="bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/[0.1] rounded-3xl p-8 sm:p-14 shadow-2xl relative overflow-hidden">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-xs font-mono font-bold mb-4">
            <Lock size={12} />
            <span>INVITE-ONLY QUANTITATIVE ACCESS</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white font-display mb-4">
            Request Access to PulseHunter
          </h2>
          <p className="text-sm sm:text-base text-neutral-300 max-w-xl mx-auto mb-8 leading-relaxed">
            PulseHunter is reserved for qualified systematic traders and
            institutional market participants. Contact <b>PARTHIBAKANNAN S</b>{" "}
            to request authorized access credentials.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3.5">
            <button
              onClick={() => setShowAccessModal(true)}
              className="px-6 py-3 rounded-2xl bg-white text-black font-bold text-sm hover:bg-neutral-200 transition-all shadow-lg flex items-center gap-2"
            >
              <Mail size={15} />
              <span>Request Access from PARTHIBAKANNAN S</span>
            </button>
            <button
              onClick={() => setShowLoginModal(true)}
              className="px-6 py-3 rounded-2xl bg-white/[0.06] border border-white/[0.12] text-white font-bold text-sm hover:bg-white/[0.1] transition-all"
            >
              Client Sign In
            </button>
          </div>
        </div>
      </section>

      {/* ── SANITIZED FOOTER (NO ARCHITECTURE SPEC REFERENCE) ── */}
      <footer className="relative z-10 border-t border-white/[0.06] py-12 px-4 sm:px-6 max-w-7xl mx-auto text-xs text-neutral-400">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div className="space-y-1">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <img
                src="/assets/logo.jpg"
                alt="PulseHunter"
                className="w-5 h-5 rounded-md object-cover"
              />
              <span className="font-bold text-white text-sm">PulseHunter</span>
            </div>
            <p className="text-neutral-400">
              &copy; {new Date().getFullYear()} PulseHunter. All Rights
              Reserved.
            </p>
            <p className="text-neutral-400">
              Created, Engineered &amp; Owned by{" "}
              <b className="text-neutral-300">PARTHIBAKANNAN S</b>.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-mono">
            <a
              href="mailto:parthisivaram45@gmail.com"
              className="text-cyan-400 hover:underline flex items-center gap-1"
            >
              <Mail size={12} />
              <span>parthisivaram45@gmail.com</span>
            </a>
            <span className="text-neutral-700">|</span>
            <span className="text-neutral-400">Systematic Quant Terminal</span>
            <span className="text-neutral-700">|</span>
            <ThemeToggle />
          </div>
        </div>
      </footer>

      {/* ── CLIENT LOGIN MODAL ── */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-[#0d0f15] border border-white/[0.12] rounded-3xl p-7 sm:p-8 shadow-2xl"
            >
              <button
                onClick={() => setShowLoginModal(false)}
                className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <img
                  src="/assets/logo.jpg"
                  alt="PulseHunter"
                  className="w-10 h-10 rounded-xl object-cover border border-cyan-500/30 shadow-md"
                />
                <div>
                  <h3 className="text-lg font-bold text-white font-display">
                    PulseHunter Client Sign In
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Enter authorized credentials to continue
                  </p>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">
                    Terminal Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="trader@domain.com"
                    className="w-full bg-neutral-900 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-neutral-900 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-400 transition-colors"
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
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-black font-extrabold text-sm shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all"
                >
                  {loginBusy
                    ? "Authenticating Session..."
                    : "Sign In to Terminal"}
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-white/[0.06] text-center text-xs text-neutral-400">
                Don't have credentials?{" "}
                <button
                  onClick={() => {
                    setShowLoginModal(false);
                    setShowAccessModal(true);
                  }}
                  className="text-cyan-400 font-bold hover:underline"
                >
                  Request Access from PARTHIBAKANNAN S
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── REQUEST ACCESS MODAL ── */}
      <AnimatePresence>
        {showAccessModal && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-[#0d0f15] border border-white/[0.12] rounded-3xl p-7 sm:p-8 shadow-2xl"
            >
              <button
                onClick={() => {
                  setShowAccessModal(false);
                  setRequestSubmitted(false);
                }}
                className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <img
                  src="/assets/logo.jpg"
                  alt="PulseHunter"
                  className="w-10 h-10 rounded-xl object-cover border border-cyan-500/30 shadow-md"
                />
                <div>
                  <h3 className="text-lg font-bold text-white font-display">
                    Request Terminal Access
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Direct enquiry to <b>PARTHIBAKANNAN S</b>
                  </p>
                </div>
              </div>

              {!requestSubmitted ? (
                <form onSubmit={handleRequestSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={requestName}
                      onChange={(e) => setRequestName(e.target.value)}
                      placeholder="Your Full Name"
                      className="w-full bg-neutral-900 border border-white/[0.1] rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      required
                      value={requestEmail}
                      onChange={(e) => setRequestEmail(e.target.value)}
                      placeholder="trader@domain.com"
                      className="w-full bg-neutral-900 border border-white/[0.1] rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                      Trading Profile
                    </label>
                    <select
                      value={requestRole}
                      onChange={(e) => setRequestRole(e.target.value)}
                      className="w-full bg-neutral-900 border border-white/[0.1] rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-400 transition-colors"
                    >
                      <option value="Proprietary / Quant Trader">
                        Proprietary / Quantitative Trader
                      </option>
                      <option value="Institutional Asset Manager">
                        Institutional / Desk Trader
                      </option>
                      <option value="Active F&O Derivatives Trader">
                        Active F&amp;O Derivatives Trader
                      </option>
                      <option value="Systematic Individual Trader">
                        Systematic Individual Trader
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                      Trading Focus / Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={requestNote}
                      onChange={(e) => setRequestNote(e.target.value)}
                      placeholder="Key strategy requirements..."
                      className="w-full bg-neutral-900 border border-white/[0.1] rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-400 transition-colors resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:opacity-95 text-black font-extrabold text-sm shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all mt-2 flex items-center justify-center gap-2"
                  >
                    <Mail size={15} />
                    <span>Send Onboarding Request</span>
                  </button>
                </form>
              ) : (
                <div className="text-center py-6 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 grid place-items-center mx-auto">
                    <CheckCircle2 size={24} />
                  </div>
                  <h4 className="font-bold text-base text-white">
                    Access Request Dispatched
                  </h4>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    Thank you, <b>{requestName}</b>. Your access request has
                    been routed directly to <b>PARTHIBAKANNAN S</b> (
                    <a
                      href="mailto:parthisivaram45@gmail.com"
                      className="text-cyan-400 underline"
                    >
                      parthisivaram45@gmail.com
                    </a>
                    ). You will be contacted via email regarding terminal
                    onboarding.
                  </p>
                  <button
                    onClick={() => {
                      setShowAccessModal(false);
                      setRequestSubmitted(false);
                    }}
                    className="mt-4 px-5 py-2 rounded-xl bg-white/[0.08] border border-white/[0.12] text-white font-bold text-xs hover:bg-white/[0.12] transition-all"
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

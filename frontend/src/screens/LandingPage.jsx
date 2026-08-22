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
  Command,
  Search,
  Maximize2,
  Check,
  Server,
  KeyRound,
  FileText,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient.js";
import ThemeToggle from "../components/ThemeToggle.jsx";

export default function LandingPage({ onLoginSuccess }) {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [activeScreenTab, setActiveScreenTab] = useState("ranking");
  const [activeFeatureTab, setActiveFeatureTab] = useState("quant");
  const [sandboxStock, setSandboxStock] = useState("TATASTEEL");
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
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError || !data.session) {
        setLoginError("Invalid credentials. Please check your email and password.");
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
        setLoginError("Session verification failed. Contact onboarding administrator.");
      }
    } catch {
      setLoginError("Network error. Unable to reach terminal authentication server.");
    } finally {
      setLoginBusy(false);
    }
  };

  const handleRequestSubmit = (e) => {
    e.preventDefault();
    setRequestSubmitted(true);
    const subject = encodeURIComponent(`PulseHunter Terminal Access Request - ${requestName}`);
    const body = encodeURIComponent(
      `Applicant Name: ${requestName}\n` +
      `Applicant Email: ${requestEmail}\n` +
      `Trading Profile: ${requestRole}\n` +
      `Trading Objectives: ${requestNote || "N/A"}\n\n` +
      `Request submitted for PulseHunter Institutional Quantitative Terminal.`
    );
    window.open(`mailto:parthisivaram45@gmail.com?subject=${subject}&body=${body}`, "_blank");
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

  // Ticker ribbon stocks
  const tickerItems = [
    { s: "NIFTY 50", p: "24,252.00", c: "+0.21%", up: true },
    { s: "RELIANCE", p: "2,980.50", c: "+1.24%", up: true },
    { s: "HDFCBANK", p: "1,652.10", c: "+0.45%", up: true },
    { s: "TCS", p: "4,124.00", c: "-0.32%", up: false },
    { s: "ICICIBANK", p: "1,184.20", c: "+1.52%", up: true },
    { s: "INFY", p: "1,822.40", c: "-0.85%", up: false },
    { s: "TATASTEEL", p: "156.40", c: "+2.15%", up: true },
    { s: "MARUTI", p: "12,450.00", c: "+1.10%", up: true },
    { s: "BHARTIARTL", p: "1,480.00", c: "+0.75%", up: true },
    { s: "SBIN", p: "824.50", c: "+0.95%", up: true },
    { s: "LT", p: "3,620.00", c: "+1.40%", up: true },
    { s: "KOTAKBANK", p: "1,780.00", c: "+0.30%", up: true },
  ];

  // Sandbox data definitions
  const sandboxConfigs = {
    TATASTEEL: {
      symbol: "TATASTEEL",
      name: "Tata Steel Ltd",
      ltp: "₹156.40",
      change: "+2.15%",
      isBullish: true,
      tag: "Momentum Breakout",
      sector: "Metals & Mining",
      vwap: "₹154.20",
      cvd: "+12.4M",
      cvdDesc: "Aggressive Buy Accumulation",
      signal: "QUALIFIED ALPHA SETUP",
      signalColor: "emerald",
      entry: "₹155.00",
      sl: "🛡️ ₹155.00 (Risk Free)",
      target: "₹159.00 (1:2 RR)",
      aiVerdict: "Strong sector tailwinds in Metals. Sustained institutional volume above VWAP with zero overhead resistance.",
    },
    MARUTI: {
      symbol: "MARUTI",
      name: "Maruti Suzuki India",
      ltp: "₹12,450.00",
      change: "+1.10%",
      isBullish: true,
      tag: "VWAP Support Retest",
      sector: "Automobile",
      vwap: "₹12,380.00",
      cvd: "+8.1M",
      cvdDesc: "Steady Tick Inflow",
      signal: "PULLBACK CONFIRMED",
      signalColor: "cyan",
      entry: "₹12,400.00",
      sl: "🛡️ ₹12,400.00 (Breakeven Active)",
      target: "₹12,680.00 (1:2 RR)",
      aiVerdict: "Auto sector breadth advancing. High Relative Strength against benchmark with dynamic ATR buffer intact.",
    },
    INFY: {
      symbol: "INFY",
      name: "Infosys Limited",
      ltp: "₹1,822.40",
      change: "-0.85%",
      isBullish: false,
      tag: "Sector Headwind Filter",
      sector: "Information Tech",
      vwap: "₹1,840.00",
      cvd: "-9.2M",
      cvdDesc: "Aggressive Sell Pressure",
      signal: "BLOCKED BY QUANT GATE",
      signalColor: "rose",
      entry: "N/A",
      sl: "N/A",
      target: "N/A",
      aiVerdict: "Adversarial filter triggered: US Nasdaq tech weakness and persistent negative CVD tick flow.",
    },
  };

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

  const comparisonData = [
    {
      feature: "Data Stream Speed",
      retail: "1–5 second polling delay",
      pulse: "250ms sub-second in-memory state delta stream",
    },
    {
      feature: "Capital Preservation",
      retail: "Manual, emotional stop adjustments",
      pulse: "Automated +1.0R Breakeven ratchet guarantee",
    },
    {
      feature: "Market Coverage",
      retail: "Manual stock-by-stock browsing",
      pulse: "Simultaneous 210 F&O cross-sectional scanning",
    },
    {
      feature: "Catalyst Intelligence",
      retail: "Delayed public news headlines",
      pulse: "Google Gemini 3.6 Flash adversarial risk auditor",
    },
    {
      feature: "Order Flow Delta",
      retail: "Standard total volume bars",
      pulse: "Cumulative Volume Delta (CVD) aggression meter",
    },
    {
      feature: "Execution Sizing",
      retail: "Arbitrary percentage stop losses",
      pulse: "Dynamic ATR-calibrated 1:2 risk-reward sizing",
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
              href="#sandbox"
              className="hidden md:inline-flex text-xs font-medium text-neutral-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/[0.04]"
            >
              Live Demo
            </a>
            <a
              href="#screens"
              className="hidden md:inline-flex text-xs font-medium text-neutral-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/[0.04]"
            >
              Screens
            </a>
            <a
              href="#comparison"
              className="hidden lg:inline-flex text-xs font-medium text-neutral-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/[0.04]"
            >
              Edge
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

        {/* ── LIVE INFINITE TICKER MARQUEE RIBBON ── */}
        <div className="border-t border-white/[0.04] bg-neutral-950/60 overflow-hidden py-1.5 relative flex items-center">
          <div className="flex gap-8 whitespace-nowrap animate-marquee font-mono text-[11px]">
            {tickerItems.concat(tickerItems).map((item, idx) => (
              <div key={idx} className="inline-flex items-center gap-2">
                <span className="text-neutral-400 font-bold">{item.s}</span>
                <span className="text-white">₹{item.p}</span>
                <span className={`font-bold ${item.up ? "text-emerald-400" : "text-rose-400"}`}>
                  {item.c}
                </span>
                <span className="text-neutral-700">·</span>
              </div>
            ))}
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
          The institutional quantitative intelligence command center for active Indian equity traders.
          Real-time order flow scanning, 5-tier systematic screening, Gemini AI catalyst analysis, and
          automated paper trade execution.
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

      {/* ── PUBLIC LIVE MARKET RADAR SECTION ── */}
      <section id="market-radar" className="relative z-10 py-16 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider mb-2">
            <Activity size={14} />
            <span>Public Market Overview</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-white font-display">
            Live Market Radar &amp; Macro Pulse
          </h2>
          <p className="text-sm text-neutral-400 max-w-2xl mx-auto mt-2">
            Real-time public benchmarks refreshed continuously directly from PulseHunter's in-memory engine.
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
              <p className="text-xs text-neutral-400 mb-6">
                NIFTY 50 reference anchor for cross-sectional relative strength calculations.
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
                  <div key={idx} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs font-mono text-white">{stk.symbol}</span>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">
                        +{Number(stk.pct_change).toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-[10px] text-neutral-400">₹{Number(stk.ltp).toFixed(1)}</div>
                  </div>
                ))}
              </div>

              <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider block pt-1">
                🔴 Sector Laggards
              </span>
              <div className="grid grid-cols-2 gap-2">
                {topLosers.slice(0, 2).map((stk, idx) => (
                  <div key={idx} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs font-mono text-white">{stk.symbol}</span>
                      <span className="text-[10px] font-mono text-rose-400 font-bold">
                        {Number(stk.pct_change).toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-[10px] text-neutral-400">₹{Number(stk.ltp).toFixed(1)}</div>
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
                    <span className="text-[9px] text-neutral-400 uppercase block">GIFT NIFTY</span>
                    <span className="font-bold text-white">{cues.gift_nifty}</span>
                  </div>
                )}
                {cues.crude_oil && (
                  <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/[0.06]">
                    <span className="text-[9px] text-neutral-400 uppercase block">BRENT CRUDE</span>
                    <span className="font-bold text-white">{cues.crude_oil}</span>
                  </div>
                )}
                {cues.gold_commodities && (
                  <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/[0.06]">
                    <span className="text-[9px] text-neutral-400 uppercase block">GOLD / METALS</span>
                    <span className="font-bold text-white truncate block">
                      {cues.gold_commodities}
                    </span>
                  </div>
                )}
                {cues.dollar_index && (
                  <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/[0.06]">
                    <span className="text-[9px] text-neutral-400 uppercase block">DXY DOLLAR</span>
                    <span className="font-bold text-white">{cues.dollar_index}</span>
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

      {/* ── INTERACTIVE TERMINAL SANDBOX PREVIEW (HANDS-ON MOCKUP) ── */}
      <section id="sandbox" className="relative z-10 py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-white/[0.06]">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider mb-2">
            <Eye size={14} />
            <span>Interactive Terminal Sandbox</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold text-white font-display">
            Experience PulseHunter in Action
          </h2>
          <p className="text-sm sm:text-base text-neutral-400 max-w-2xl mx-auto mt-3">
            Select a candidate setup below to observe how PulseHunter's quant gate, order flow, and risk protection interact in real-time.
          </p>
        </div>

        {/* Stock Selector Pill Bar */}
        <div className="flex justify-center gap-3 mb-8">
          {["TATASTEEL", "MARUTI", "INFY"].map((sym) => {
            const cfg = sandboxConfigs[sym];
            const active = sandboxStock === sym;
            return (
              <button
                key={sym}
                onClick={() => setSandboxStock(sym)}
                className={`px-5 py-2.5 rounded-2xl text-xs font-bold font-mono transition-all flex items-center gap-2 ${
                  active
                    ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-extrabold shadow-[0_0_20px_rgba(6,182,212,0.35)]"
                    : "bg-white/[0.03] text-neutral-400 hover:text-white border border-white/[0.08]"
                }`}
              >
                <span>{cfg.symbol}</span>
                <span className={`text-[10px] ${cfg.isBullish ? "text-emerald-400" : "text-rose-400"} ${active ? "!text-black font-black" : ""}`}>
                  {cfg.change}
                </span>
              </button>
            );
          })}
        </div>

        {/* Interactive Live Card Container */}
        {(() => {
          const cfg = sandboxConfigs[sandboxStock];
          return (
            <motion.div
              key={sandboxStock}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="bg-white/[0.025] backdrop-blur-2xl border border-white/[0.1] rounded-3xl p-6 sm:p-10 shadow-2xl max-w-5xl mx-auto"
            >
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-6 border-b border-white/[0.06]">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <h3 className="text-2xl font-bold font-mono text-white">{cfg.symbol}</h3>
                    <span className="text-xs text-neutral-400">· {cfg.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.1] text-neutral-300">
                      {cfg.sector}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-extrabold font-mono text-white">{cfg.ltp}</span>
                    <span className={`text-sm font-mono font-bold ${cfg.isBullish ? "text-emerald-400" : "text-rose-400"}`}>
                      {cfg.change}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold border ${
                    cfg.signalColor === "emerald"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : cfg.signalColor === "cyan"
                      ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                      : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                  }`}>
                    {cfg.signal}
                  </span>
                </div>
              </div>

              {/* Dynamic Feature Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
                <div className="bg-neutral-950/70 border border-white/[0.06] rounded-2xl p-4">
                  <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block mb-1">
                    Intraday Order Flow (CVD)
                  </span>
                  <div className="text-lg font-bold font-mono text-white mb-0.5">{cfg.cvd}</div>
                  <span className="text-xs text-cyan-400 font-medium">{cfg.cvdDesc}</span>
                </div>

                <div className="bg-neutral-950/70 border border-white/[0.06] rounded-2xl p-4">
                  <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block mb-1">
                    VWAP Reference Level
                  </span>
                  <div className="text-lg font-bold font-mono text-white mb-0.5">{cfg.vwap}</div>
                  <span className="text-xs text-neutral-400">Institutional Volume Anchor</span>
                </div>

                <div className="bg-neutral-950/70 border border-white/[0.06] rounded-2xl p-4">
                  <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block mb-1">
                    Risk Protection Status
                  </span>
                  <div className="text-sm font-bold font-mono text-emerald-400 mb-0.5">{cfg.sl}</div>
                  <span className="text-xs text-neutral-400">Target: {cfg.target}</span>
                </div>
              </div>

              {/* AI Copilot Verdict Box */}
              <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4 flex items-start gap-3">
                <Sparkles size={18} className="text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-[11px] font-mono font-bold text-cyan-400 uppercase tracking-wider block mb-1">
                    GEMINI 3.6 FLASH VERDICT &amp; CATALYST AUDIT
                  </span>
                  <p className="text-xs text-neutral-300 leading-relaxed">{cfg.aiVerdict}</p>
                </div>
              </div>
            </motion.div>
          );
        })()}
      </section>

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

      {/* ── COMPARISON MATRIX SECTION ── */}
      <section id="comparison" className="relative z-10 py-20 px-4 sm:px-6 max-w-5xl mx-auto border-t border-white/[0.06]">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider mb-2">
            <Sliders size={14} />
            <span>The Quantitative Edge</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold text-white font-display">
            Conventional Retail vs PulseHunter
          </h2>
          <p className="text-sm sm:text-base text-neutral-400 max-w-xl mx-auto mt-3">
            Why systematic momentum trading outperforms manual chart-by-chart browsing.
          </p>
        </div>

        <div className="bg-white/[0.025] border border-white/[0.1] rounded-3xl overflow-hidden shadow-2xl">
          <div className="grid grid-cols-3 bg-white/[0.04] border-b border-white/[0.08] p-4 text-xs font-mono font-bold">
            <span className="text-neutral-400 uppercase">Capability</span>
            <span className="text-neutral-400 uppercase">Conventional Retail</span>
            <span className="text-cyan-400 uppercase">PulseHunter Terminal</span>
          </div>
          {comparisonData.map((row, idx) => (
            <div
              key={idx}
              className={`grid grid-cols-3 p-4 text-xs items-center gap-3 border-b border-white/[0.04] ${
                idx % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent"
              }`}
            >
              <span className="font-bold text-white">{row.feature}</span>
              <span className="text-neutral-400">{row.retail}</span>
              <span className="text-cyan-300 font-semibold flex items-center gap-1.5">
                <Check size={14} className="text-cyan-400 flex-shrink-0" />
                <span>{row.pulse}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── WHO PULSEHUNTER IS BUILT FOR ── */}
      <section className="relative z-10 py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-white/[0.06]">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider mb-2">
            <UserCheck size={14} />
            <span>Target Profiles</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold text-white font-display">
            Who Is PulseHunter Built For?
          </h2>
          <p className="text-sm sm:text-base text-neutral-400 max-w-2xl mx-auto mt-3">
            Engineered for high-frequency discipline and systematic execution across three key participant profiles.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/[0.025] border border-white/[0.08] rounded-3xl p-7 flex flex-col justify-between shadow-sm">
            <div>
              <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 grid place-items-center mb-4">
                <BarChart3 size={20} />
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Quantitative &amp; Systematic Traders</h4>
              <p className="text-xs text-neutral-400 leading-relaxed mb-6">
                Traders seeking statistical outperformance who want to trade strictly with the trend,
                filtered by sector relative strength and confirmed volume accumulation.
              </p>
            </div>
            <div className="text-xs text-cyan-400 font-mono font-bold flex items-center gap-1">
              <span>Statistical Edge Focus</span>
              <ArrowRight size={13} />
            </div>
          </div>

          <div className="bg-white/[0.025] border border-white/[0.08] rounded-3xl p-7 flex flex-col justify-between shadow-sm">
            <div>
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 grid place-items-center mb-4">
                <Flame size={20} />
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Active F&amp;O Derivatives Desks</h4>
              <p className="text-xs text-neutral-400 leading-relaxed mb-6">
                Proprietary intraday scalpers who need sub-second Cumulative Volume Delta (CVD) order
                flow to detect aggressive market participants in 210 F&amp;O stocks.
              </p>
            </div>
            <div className="text-xs text-indigo-400 font-mono font-bold flex items-center gap-1">
              <span>Order Flow Precision</span>
              <ArrowRight size={13} />
            </div>
          </div>

          <div className="bg-white/[0.025] border border-white/[0.08] rounded-3xl p-7 flex flex-col justify-between shadow-sm">
            <div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 grid place-items-center mb-4">
                <Shield size={20} />
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Disciplined Risk-First Traders</h4>
              <p className="text-xs text-neutral-400 leading-relaxed mb-6">
                Traders committed to eliminating revenge trading and emotional exits with automated
                bracket order execution and automatic +1.0R Breakeven ratchets.
              </p>
            </div>
            <div className="text-xs text-emerald-400 font-mono font-bold flex items-center gap-1">
              <span>Zero-Loss Guarantee on 1R</span>
              <ArrowRight size={13} />
            </div>
          </div>
        </div>
      </section>

      {/* ── KEYBOARD SHORTCUTS & INFRASTRUCTURE RIBBON ── */}
      <section className="relative z-10 py-16 px-4 sm:px-6 max-w-7xl mx-auto border-t border-white/[0.06]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider mb-2">
              <Command size={14} />
              <span>Keyboard-First Architecture</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-white font-display mb-4">
              Engineered for Terminal Velocity
            </h3>
            <p className="text-sm text-neutral-300 leading-relaxed mb-6">
              Navigate all 7 screens, search symbols, toggle themes, and expand charts with zero latency hotkeys.
            </p>
            <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
              <div className="bg-white/[0.03] p-3 rounded-xl border border-white/[0.06] flex items-center justify-between">
                <span className="text-neutral-400">Switch Screens</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.1] text-white font-bold">[1 - 7]</kbd>
              </div>
              <div className="bg-white/[0.03] p-3 rounded-xl border border-white/[0.06] flex items-center justify-between">
                <span className="text-neutral-400">Universal Search</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.1] text-white font-bold">[/]</kbd>
              </div>
              <div className="bg-white/[0.03] p-3 rounded-xl border border-white/[0.06] flex items-center justify-between">
                <span className="text-neutral-400">Focus Chart Pane</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.1] text-white font-bold">[Space]</kbd>
              </div>
              <div className="bg-white/[0.03] p-3 rounded-xl border border-white/[0.06] flex items-center justify-between">
                <span className="text-neutral-400">Toggle Theme</span>
                <kbd className="px-2 py-0.5 rounded bg-white/[0.1] text-white font-bold">[T]</kbd>
              </div>
            </div>
          </div>

          <div className="bg-white/[0.025] border border-white/[0.08] rounded-3xl p-6 space-y-4">
            <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider block">
              ENTERPRISE CLOUD INFRASTRUCTURE
            </span>
            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-3">
                <Server size={18} className="text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block">In-Memory High Frequency Python Engine</span>
                  <span className="text-neutral-400">Sub-second tick aggregation across 210 watchlist equities.</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <KeyRound size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block">Encrypted Session Authentication</span>
                  <span className="text-neutral-400">Zero open self-registration with invite-only authorization tokens.</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Sparkles size={18} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block">Google Gemini 3.6 Flash Cloud Intelligence</span>
                  <span className="text-neutral-400">Adversarial catalyst auditing with automatic quota fallback.</span>
                </div>
              </div>
            </div>
          </div>
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
            PulseHunter is reserved for qualified systematic traders and institutional market participants.
            Contact <b>PARTHIBAKANNAN S</b> to request authorized access credentials.
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
              <img src="/assets/logo.jpg" alt="PulseHunter" className="w-5 h-5 rounded-md object-cover" />
              <span className="font-bold text-white text-sm">PulseHunter</span>
            </div>
            <p className="text-neutral-400">
              &copy; {new Date().getFullYear()} PulseHunter. All Rights Reserved.
            </p>
            <p className="text-neutral-400">
              Created, Engineered &amp; Owned by <b className="text-neutral-300">PARTHIBAKANNAN S</b>.
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
                  <h3 className="text-lg font-bold text-white font-display">PulseHunter Client Sign In</h3>
                  <p className="text-xs text-neutral-400">Enter authorized credentials to continue</p>
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
                  {loginBusy ? "Authenticating Session..." : "Sign In to Terminal"}
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
                      <option value="Proprietary / Quant Trader">Proprietary / Quantitative Trader</option>
                      <option value="Institutional Asset Manager">Institutional / Desk Trader</option>
                      <option value="Active F&O Derivatives Trader">Active F&amp;O Derivatives Trader</option>
                      <option value="Systematic Individual Trader">Systematic Individual Trader</option>
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
                  <h4 className="font-bold text-base text-white">Access Request Dispatched</h4>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    Thank you, <b>{requestName}</b>. Your access request has been routed directly to{" "}
                    <b>PARTHIBAKANNAN S</b> (
                    <a href="mailto:parthisivaram45@gmail.com" className="text-cyan-400 underline">
                      parthisivaram45@gmail.com
                    </a>
                    ). You will be contacted via email regarding terminal onboarding.
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

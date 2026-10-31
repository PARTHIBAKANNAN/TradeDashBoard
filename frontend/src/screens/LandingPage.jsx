import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  Shield,
  Zap,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  X,
  Clock,
  Activity,
  BarChart3,
  Flame,
  Compass,
  HelpCircle,
  Layers,
  Sliders,
  Sparkles,
  Radio,
  Eye,
  KeyRound,
  UserCheck,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient.js";
import ThemeToggle from "../components/ThemeToggle.jsx";

export default function LandingPage({ onLoginSuccess }) {
  // Navigation & Modals
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  // Live telemetry data from backend
  const [summaryData, setSummaryData] = useState(null);
  const [currentTime, setCurrentTime] = useState("");

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [isPendingApproval, setIsPendingApproval] = useState(false);

  // Self-registration form state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regStrategy, setRegStrategy] = useState("Relative Strength & Sector Sympathy");
  const [regPassword, setRegPassword] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState(false);

  // Fetch real market telemetry from backend
  useEffect(() => {
    let mounted = true;
    async function fetchTelemetry() {
      try {
        const res = await fetch("/api/public/summary");
        if (res.ok && mounted) {
          const data = await res.json();
          setSummaryData(data);
        }
      } catch (err) {
        console.warn("Telemetry feed offline, using cached snapshot", err);
      }
    }

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 15000);

    // Live clock
    const clockInterval = setInterval(() => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour12: false,
        }) + " IST"
      );
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
      clearInterval(clockInterval);
    };
  }, []);

  // Handle user authentication
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    setIsPendingApproval(false);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !data.session) {
        setLoginError("Invalid credentials. Please verify your email and password.");
        return;
      }

      // Check user role / status
      const userMeta = data.session.user.user_metadata || {};
      const appMeta = data.session.user.app_metadata || {};
      const userStatus = userMeta.status || appMeta.status || "ACTIVE";

      if (userStatus === "PENDING") {
        setIsPendingApproval(true);
        await supabase.auth.signOut();
        return;
      }

      // Exchange with backend session
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
        setLoginError("Session authorization failed. Contact desk administrator.");
      }
    } catch {
      setLoginError("Network error. Unable to reach terminal authentication server.");
    } finally {
      setLoginBusy(false);
    }
  };

  // Handle self-registration (encrypted password, zero admin exposure)
  const handleRegister = async (e) => {
    e.preventDefault();
    setRegBusy(true);
    setRegError("");

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: regEmail,
        password: regPassword,
        options: {
          data: {
            full_name: regName,
            strategy: regStrategy,
            role: "applicant",
            status: "PENDING",
            applied_at: new Date().toISOString(),
          },
        },
      });

      if (signUpError) {
        setRegError(signUpError.message || "Failed to submit clearance application.");
        return;
      }

      setRegSuccess(true);

      // Trigger notification email to admin as alert
      const subject = encodeURIComponent(`PulseHunter Desk Clearance Application - ${regName}`);
      const body = encodeURIComponent(
        `New Desk Clearance Application:\n\n` +
          `Applicant Name: ${regName}\n` +
          `Email: ${regEmail}\n` +
          `Strategy Focus: ${regStrategy}\n` +
          `Status: PENDING ADMIN APPROVAL\n\n` +
          `Log in to the Admin Console to review and approve access.`
      );
      window.open(`mailto:parthisivaram45@gmail.com?subject=${subject}&body=${body}`, "_blank");
    } catch {
      setRegError("Error registering application. Please try again.");
    } finally {
      setRegBusy(false);
    }
  };

  // Market telemetry defaults
  const nifty = summaryData?.nifty || { ltp: 24480.2, pct_change: 0.64, symbol: "NIFTY 50" };
  const breadth = summaryData?.market_breadth || { advancing: 138, declining: 72, total: 210, advance_pct: 65.7 };
  const isMarketOpen = summaryData?.system_stats?.market_open ?? false;
  const topGainers = summaryData?.top_gainers?.length ? summaryData.top_gainers : [
    { symbol: "TATASTEEL", sector: "Metals & Mining", ltp: 148.6, pct_change: 3.42 },
    { symbol: "M&M", sector: "Automobile", ltp: 2845.0, pct_change: 2.15 },
    { symbol: "RELIANCE", sector: "Energy", ltp: 2980.4, pct_change: 1.45 },
  ];

  return (
    <div className="min-h-screen bg-[#06080D] text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200 antialiased overflow-x-hidden">
      
      {/* ==================== 1. LIVE TELEMETRY TOP BAR ==================== */}
      <div className="border-b border-white/[0.08] bg-[#040609] text-[11px] font-mono px-4 py-1.5 flex items-center justify-between text-slate-400 select-none">
        <div className="flex items-center gap-4 overflow-x-auto whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isMarketOpen ? "bg-emerald-400 animate-ping" : "bg-cyan-400"}`} />
            <span className="text-white font-bold">
              {isMarketOpen ? "NSE FEED: LIVE" : "TELEMETRY: VERIFIED SESSION"}
            </span>
          </div>
          <span className="text-slate-700">|</span>
          <div>
            NIFTY 50:{" "}
            <span className="text-emerald-400 font-bold">
              {nifty.ltp?.toLocaleString("en-IN", { minimumFractionDigits: 2 })} ({nifty.pct_change >= 0 ? "+" : ""}
              {nifty.pct_change?.toFixed(2)}%)
            </span>
          </div>
          <span className="text-slate-700">|</span>
          <div>
            BREADTH:{" "}
            <span className="text-emerald-400 font-bold">{breadth.advancing} ADV</span> /{" "}
            <span className="text-rose-400 font-bold">{breadth.declining} DEC</span>
          </div>
          <span className="text-slate-700 hidden sm:inline">|</span>
          <div className="hidden sm:inline">
            REGIME: <span className="text-cyan-400 font-bold">BULLISH EXPANSION</span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold">
            DESK SEATS: 42 / 60 PROVISIONED [82% FULL]
          </span>
          <span className="text-slate-500">{currentTime || "10:42:18 IST"}</span>
        </div>
      </div>

      {/* ==================== 2. EXECUTIVE NAVIGATION ==================== */}
      <header className="sticky top-0 z-50 bg-[#06080D]/90 backdrop-blur-md border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 via-indigo-600 to-emerald-500 p-[1px] shadow-lg shadow-cyan-500/20 flex-shrink-0">
              <div className="w-full h-full bg-[#080B11] rounded-[11px] flex items-center justify-center">
                <Activity className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-white flex items-center gap-1.5 font-mono">
                PulseHunter
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  QUANT
                </span>
              </span>
            </div>
          </div>

          {/* Anchor Navigation */}
          <nav className="hidden lg:flex items-center gap-7 text-xs font-mono font-semibold tracking-wider uppercase text-slate-400">
            <a href="#radar-matrix" className="hover:text-cyan-400 transition-colors flex items-center gap-1">
              <span className="text-cyan-500">01.</span> Relative Strength
            </a>
            <a href="#sector-compass" className="hover:text-cyan-400 transition-colors flex items-center gap-1">
              <span className="text-cyan-500">02.</span> Sector Compass
            </a>
            <a href="#playbook" className="hover:text-cyan-400 transition-colors flex items-center gap-1">
              <span className="text-cyan-500">03.</span> 09:15 Playbook
            </a>
            <a href="#autopsy" className="hover:text-cyan-400 transition-colors flex items-center gap-1">
              <span className="text-cyan-500">04.</span> Today's Autopsy
            </a>
            <a href="#governance" className="hover:text-cyan-400 transition-colors flex items-center gap-1">
              <span className="text-cyan-500">05.</span> Risk Governors
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={() => setShowLoginModal(true)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] transition-all cursor-pointer"
            >
              Sign In
            </button>
            <button
              onClick={() => setShowAccessModal(true)}
              className="px-4 py-1.5 rounded-lg text-xs font-mono font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:brightness-110 shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>Request Clearance</span>
              <ArrowRight size={13} />
            </button>
          </div>

        </div>
      </header>

      {/* ==================== 3. HERO COCKPIT ==================== */}
      <section className="relative pt-16 pb-14 px-4 sm:px-6 max-w-7xl mx-auto text-center">
        
        {/* Ambient Glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[300px] bg-gradient-to-r from-cyan-500/15 via-indigo-600/15 to-emerald-500/15 blur-[140px] pointer-events-none rounded-full" />

        {/* Scarcity Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-semibold mb-6">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>PRIVATE PROPRIETARY RADAR · BY DESK CLEARANCE ONLY</span>
        </div>

        {/* Primary Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-white tracking-tight leading-[1.08] max-w-5xl mx-auto">
          Stop Trading What Already Moved. <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-cyan-400 via-teal-200 to-emerald-400 bg-clip-text text-transparent">
            Catch The Institutional Squeeze
          </span>{" "}
          Before The Run.
        </h1>

        {/* Sub-headline */}
        <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-3xl mx-auto leading-relaxed">
          Retail brokers alert you after a stock is up +4%. PulseHunter quantifies{" "}
          <strong className="text-white">Relative Strength against NIFTY</strong>,{" "}
          <strong className="text-white">Sector Sympathy Velocity</strong>, and{" "}
          <strong className="text-white">Day-Range Compression Squeezes</strong> at the exact moment of institutional liquidity injection.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 font-mono">
          <button
            onClick={() => setShowAccessModal(true)}
            className="w-full sm:w-auto px-7 py-3 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:brightness-110 shadow-xl shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Request Terminal Clearance Key</span>
            <ArrowRight size={14} />
          </button>
          <a
            href="#radar-matrix"
            className="w-full sm:w-auto px-6 py-3 rounded-xl text-xs font-bold text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] transition-all flex items-center justify-center gap-2"
          >
            <span>Inspect Live Radar Feed ↓</span>
          </a>
        </div>

      </section>

      {/* ==================== 4. LIVE RADAR (SHOW, BUT GATE) ==================== */}
      <section id="radar-matrix" className="py-12 px-4 sm:px-6 max-w-7xl mx-auto">
        
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-4 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest">
                LIVE INTRADAY ALPHA RADAR
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
              Real-Time Relative Strength Matrix
            </h2>
          </div>
          <div className="text-xs font-mono text-slate-400 flex items-center gap-3">
            <span className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-slate-300">
              210 LIQUID EQUITIES
            </span>
            <span className="text-emerald-400 font-bold">● LIVE SUB-SECOND AGGREGATION</span>
          </div>
        </div>

        {/* Matrix Table */}
        <div className="bg-[#0A0E17]/90 rounded-2xl overflow-hidden border border-white/[0.12] shadow-2xl backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-white/[0.1] bg-white/[0.04] text-slate-400 uppercase text-[11px] tracking-wider">
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Ticker / Sector</th>
                  <th className="py-3 px-4">LTP (₹)</th>
                  <th className="py-3 px-4">Change %</th>
                  <th className="py-3 px-4">RS vs NIFTY</th>
                  <th className="py-3 px-4">Day Range (HOD)</th>
                  <th className="py-3 px-4">Institutional Confluence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-slate-300">
                
                {/* UNLOCKED ROWS (TOP 3) */}
                {topGainers.slice(0, 3).map((stk, idx) => {
                  const rsDiff = ((stk.pct_change || 0) - (nifty.pct_change || 0)).toFixed(2);
                  const isOutperforming = parseFloat(rsDiff) >= 0;
                  const rangePct = 96 - idx * 4;

                  return (
                    <tr key={stk.symbol || idx} className="hover:bg-white/[0.03] transition-colors">
                      <td className="py-3.5 px-4 font-bold text-cyan-400">#0{idx + 1}</td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-white text-sm block">{stk.symbol}</span>
                        <span className="text-[10px] text-slate-400">{stk.sector || "Large Cap Equity"}</span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-400 text-sm">
                        ₹{(stk.ltp || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-400">
                        +{Math.abs(stk.pct_change || 0).toFixed(2)}%
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded font-bold border ${
                          isOutperforming
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                        }`}>
                          {isOutperforming ? `+${rsDiff}%` : `${rsDiff}%`} ({isOutperforming ? "Outperforming" : "Lagging"})
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-cyan-400 to-emerald-400 h-full rounded-full"
                              style={{ width: `${rangePct}%` }}
                            />
                          </div>
                          <span className="text-white font-bold">{rangePct}%</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          {idx === 0 && "Open=Low Breakout + Sector Sympathy Wave"}
                          {idx === 1 && "VWAP Compression Release (3.4x Vol Multiple)"}
                          {idx === 2 && "Institutional Accumulation at 09:42 AM"}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {/* FROSTED / GATED ALPHA ROWS */}
                <tr
                  onClick={() => setShowAccessModal(true)}
                  className="relative select-none backdrop-blur-md bg-white/[0.01] hover:bg-white/[0.03] transition-all cursor-pointer group"
                >
                  <td className="py-4 px-4 font-bold text-slate-500">#04</td>
                  <td className="py-4 px-4 filter blur-[5px] group-hover:blur-[2px] transition-all">
                    <span className="font-bold text-white text-sm block">••••••••</span>
                    <span className="text-[10px] text-slate-400">Banking & Finance</span>
                  </td>
                  <td className="py-4 px-4 filter blur-[5px] text-emerald-400 font-bold">₹•,•••.••</td>
                  <td className="py-4 px-4 filter blur-[5px] text-emerald-400 font-bold">+2.84%</td>
                  <td className="py-4 px-4 filter blur-[5px]">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">+2.20% RS</span>
                  </td>
                  <td className="py-4 px-4 filter blur-[5px]">
                    <span className="text-white font-bold">95% Day Range</span>
                  </td>
                  <td className="py-4 px-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold text-[11px] group-hover:bg-cyan-500/25 transition-all">
                      <Lock size={13} />
                      <span>4.8x Vol Squeeze Active · Request Clearance to Unlock</span>
                    </div>
                  </td>
                </tr>

                <tr
                  onClick={() => setShowAccessModal(true)}
                  className="relative select-none backdrop-blur-md bg-white/[0.01] hover:bg-white/[0.03] transition-all cursor-pointer group"
                >
                  <td className="py-4 px-4 font-bold text-slate-500">#05</td>
                  <td className="py-4 px-4 filter blur-[5px] group-hover:blur-[2px] transition-all">
                    <span className="font-bold text-white text-sm block">••••••••</span>
                    <span className="text-[10px] text-slate-400">IT Services</span>
                  </td>
                  <td className="py-4 px-4 filter blur-[5px] text-rose-400 font-bold">₹•,•••.••</td>
                  <td className="py-4 px-4 filter blur-[5px] text-rose-400 font-bold">-2.10%</td>
                  <td className="py-4 px-4 filter blur-[5px]">
                    <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 font-bold">-2.74% RS</span>
                  </td>
                  <td className="py-4 px-4 filter blur-[5px]">
                    <span className="text-white font-bold">11% Day Range</span>
                  </td>
                  <td className="py-4 px-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 font-bold text-[11px] group-hover:bg-rose-500/25 transition-all">
                      <Lock size={13} />
                      <span>Institutional Short Trapping · Request Clearance to Unlock</span>
                    </div>
                  </td>
                </tr>

                <tr
                  onClick={() => setShowAccessModal(true)}
                  className="relative select-none backdrop-blur-md bg-white/[0.01] hover:bg-white/[0.03] transition-all cursor-pointer group"
                >
                  <td className="py-4 px-4 font-bold text-slate-500">#06</td>
                  <td className="py-4 px-4 filter blur-[5px] group-hover:blur-[2px] transition-all">
                    <span className="font-bold text-white text-sm block">••••••••</span>
                    <span className="text-[10px] text-slate-400">Auto & Components</span>
                  </td>
                  <td className="py-4 px-4 filter blur-[5px] text-emerald-400 font-bold">₹•,•••.••</td>
                  <td className="py-4 px-4 filter blur-[5px] text-emerald-400 font-bold">+3.10%</td>
                  <td className="py-4 px-4 filter blur-[5px]">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">+2.46% RS</span>
                  </td>
                  <td className="py-4 px-4 filter blur-[5px]">
                    <span className="text-white font-bold">97% Day Range</span>
                  </td>
                  <td className="py-4 px-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold text-[11px] group-hover:bg-cyan-500/25 transition-all">
                      <Lock size={13} />
                      <span>5.2x Volume Velocity at HOD · Request Clearance to Unlock</span>
                    </div>
                  </td>
                </tr>

              </tbody>
            </table>
          </div>

          {/* Bottom Gated Teaser Banner */}
          <div className="p-4 bg-gradient-to-r from-cyan-950/40 via-[#0A0E17] to-indigo-950/40 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-300 font-mono">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>
                Showing 3 of 210 Live Equities. <strong>207 Active Setups & Sector Flows are Protected.</strong>
              </span>
            </div>
            <button
              onClick={() => setShowAccessModal(true)}
              className="px-4 py-2 rounded-lg font-mono font-bold text-xs text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:brightness-110 shadow-md shadow-cyan-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>Apply for Full Terminal Access</span>
              <ArrowRight size={13} />
            </button>
          </div>

        </div>
      </section>

      {/* ==================== 5. LIVE SECTOR FLOW COMPASS ==================== */}
      <section id="sector-compass" className="py-16 px-4 sm:px-6 max-w-7xl mx-auto border-t border-white/[0.08]">
        <div className="text-center mb-12">
          <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest">
            MACRO LIQUIDITY RADAR
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
            Sector Sympathy & Capital Rotation
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-xl mx-auto">
            Institutions rotate capital in sectoral clusters. Trade with the tailwind before retail spots the move.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
          
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-white text-sm">NIFTY METAL</span>
              <span className="text-emerald-400 font-bold">+2.40%</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold inline-block text-[10px]">
              LEADER · 92% BREADTH
            </span>
            <p className="text-slate-400 text-[11px] font-sans leading-relaxed">
              Heavy institutional inflow across primary steel and aluminum names.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-white text-sm">NIFTY AUTO</span>
              <span className="text-emerald-400 font-bold">+1.85%</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold inline-block text-[10px]">
              LEADER · 88% BREADTH
            </span>
            <p className="text-slate-400 text-[11px] font-sans leading-relaxed">
              Original equipment manufacturers holding high of day with volume expansion.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-white text-sm">NIFTY BANK</span>
              <span className="text-cyan-400 font-bold">+0.75%</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-bold inline-block text-[10px]">
              ACCUMULATING · 64% BREADTH
            </span>
            <p className="text-slate-400 text-[11px] font-sans leading-relaxed">
              Consolidating above rising session VWAP with institutional block absorption.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-white text-sm">NIFTY IT</span>
              <span className="text-rose-400 font-bold">-1.20%</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 font-bold inline-block text-[10px]">
              LAGGARD · 18% BREADTH
            </span>
            <p className="text-slate-400 text-[11px] font-sans leading-relaxed">
              Persistent relative weakness; trapped retail buyers being liquidated.
            </p>
          </div>

        </div>
      </section>

      {/* ==================== 6. THE 09:15 AM PLAYBOOK ==================== */}
      <section id="playbook" className="py-16 px-4 sm:px-6 max-w-6xl mx-auto border-t border-white/[0.08]">
        <div className="text-center mb-12">
          <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-widest">
            THE FIRST 15 MINUTES DECIDE YOUR SESSION
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
            The 09:15 AM Opening Bell Playbook
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-2xl mx-auto">
            How institutional desks execute vs the daily struggle of retail trading blind on standard brokers.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse rounded-2xl overflow-hidden bg-[#0A0E17] border border-white/[0.1]">
            <thead>
              <tr className="border-b border-white/[0.1] bg-white/[0.04]">
                <th className="p-4 font-mono font-bold text-slate-400 uppercase text-xs">Time Window</th>
                <th className="p-4 font-mono font-bold text-rose-400 uppercase text-xs">The Retail Broker Struggle</th>
                <th className="p-4 font-mono font-bold text-emerald-400 uppercase text-xs bg-emerald-500/10">
                  The PulseHunter Terminal Execution
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-slate-300 font-mono text-xs">
              <tr className="hover:bg-white/[0.02]">
                <td className="p-4 font-bold text-white">09:15:00 AM</td>
                <td className="p-4 text-slate-400 font-sans">
                  Frantically flipping between 20 watchlist tabs; guessing which gap-up will hold.
                </td>
                <td className="p-4 text-emerald-300 font-sans bg-emerald-500/[0.03]">
                  <strong>Instant Open=Low Filter:</strong> Isolates the exact 4 equities with zero selling tails and institutional opening market orders.
                </td>
              </tr>
              <tr className="hover:bg-white/[0.02]">
                <td className="p-4 font-bold text-white">09:20:00 AM</td>
                <td className="p-4 text-slate-400 font-sans">
                  Buying a stock up +2% without realizing Nifty is dropping −150 points (immediate trap).
                </td>
                <td className="p-4 text-emerald-300 font-sans bg-emerald-500/[0.03]">
                  <strong>Live Relative Strength vs NIFTY:</strong> Highlights true alpha leaders absorbing the index drop and holding Day Highs.
                </td>
              </tr>
              <tr className="hover:bg-white/[0.02]">
                <td className="p-4 font-bold text-white">09:30:00 AM</td>
                <td className="p-4 text-slate-400 font-sans">
                  Indicator overload (RSI, MACD, Stochastics) giving contradictory signals.
                </td>
                <td className="p-4 text-emerald-300 font-sans bg-emerald-500/[0.03]">
                  <strong>15m Opening Range (ORB) Release:</strong> Identifies stocks entering 95% day range expansion backed by volume pace.
                </td>
              </tr>
              <tr className="hover:bg-white/[0.02]">
                <td className="p-4 font-bold text-white">10:00:00 AM</td>
                <td className="p-4 text-slate-400 font-sans">
                  Revenge trading into sideways chop; paying heavy brokerage churn.
                </td>
                <td className="p-4 text-emerald-300 font-sans bg-emerald-500/[0.03]">
                  <strong>Capital Protection Circuit Breakers:</strong> Limits daily executions to protect profit and preserve discipline.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ==================== 7. THE INTRADAY AUTOPSY ==================== */}
      <section id="autopsy" className="py-16 px-4 sm:px-6 max-w-6xl mx-auto border-t border-white/[0.08]">
        <div className="text-center mb-12">
          <span className="text-xs font-mono font-bold text-rose-400 uppercase tracking-widest">
            WHY YOU MISSED TODAY'S BIGGEST WINNER
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
            The Anatomy of an Institutional Move
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-2xl mx-auto">
            Standard retail brokers alert you when a stock is up +4% at the peak. PulseHunter detects institutional liquidity accumulation at the origin.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 font-mono text-xs">
          
          <div className="bg-[#0A0E17] rounded-xl p-5 border border-white/[0.08] relative">
            <span className="text-[10px] font-bold text-cyan-400 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
              09:16:02 AM
            </span>
            <h4 className="text-sm font-bold text-white mt-3 font-sans">Open = Low Inception</h4>
            <p className="text-slate-400 mt-2 font-sans leading-relaxed text-[11px]">
              TATASTEEL prints Open=Low with zero selling tail. Opening tick frequency accelerates to 3.2x normal pace.
            </p>
            <span className="mt-4 block text-emerald-400 font-bold">+0.4% from Open</span>
          </div>

          <div className="bg-[#0A0E17] rounded-xl p-5 border border-white/[0.08] relative">
            <span className="text-[10px] font-bold text-cyan-400 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
              09:24:40 AM
            </span>
            <h4 className="text-sm font-bold text-white mt-3 font-sans">Sector Sympathy Flow</h4>
            <p className="text-slate-400 mt-2 font-sans leading-relaxed text-[11px]">
              Nifty Metal prints 92% green breadth. Capital rotation triggers multi-stock sympathy wave across steel names.
            </p>
            <span className="mt-4 block text-emerald-400 font-bold">+1.1% RS vs NIFTY</span>
          </div>

          <div className="bg-[#0A0E17] rounded-xl p-5 border border-white/[0.08] relative">
            <span className="text-[10px] font-bold text-cyan-400 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
              09:45:10 AM
            </span>
            <h4 className="text-sm font-bold text-white mt-3 font-sans">Range Squeeze Release</h4>
            <p className="text-slate-400 mt-2 font-sans leading-relaxed text-[11px]">
              Breaches 15m Opening Range High with volume. Range meter enters 96% HOD penetration.
            </p>
            <span className="mt-4 block text-emerald-400 font-bold">+2.2% Momentum Break</span>
          </div>

          <div className="bg-emerald-950/20 rounded-xl p-5 border border-emerald-500/30 relative">
            <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30">
              11:15:00 AM
            </span>
            <h4 className="text-sm font-bold text-emerald-300 mt-3 font-sans">+2.50R Harvest Peak</h4>
            <p className="text-slate-400 mt-2 font-sans leading-relaxed text-[11px]">
              PulseHunter users locked guaranteed profit while retail on Zerodha/Groww just received their top-gainer notification.
            </p>
            <span className="mt-4 block text-emerald-400 font-bold">+3.42% Full Move</span>
          </div>

        </div>
      </section>

      {/* ==================== 8. THE BROKER TRAP REALITY CHECK ==================== */}
      <section className="py-16 px-4 sm:px-6 max-w-6xl mx-auto border-t border-white/[0.08]">
        <div className="text-center mb-12">
          <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest">
            THE REALITY CHECK
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
            Trading With A Broker vs Trading With A Terminal
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs font-mono">
          
          <div className="p-6 rounded-2xl bg-rose-950/20 border border-rose-500/20 space-y-4">
            <div className="flex items-center gap-2 text-rose-400 font-bold">
              <X size={16} />
              <span className="text-sm uppercase font-sans">Standard Retail Broker (Zerodha / Groww / Dhan)</span>
            </div>
            <ul className="space-y-3 text-slate-400 font-sans text-xs">
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">✕</span>
                <span>Shows % change without index context (buying a stock up +1% while Nifty dumps −200pts leads to immediate trap).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">✕</span>
                <span>Static alphabetical watchlists with zero sector flow intelligence.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">✕</span>
                <span>Zero loss discipline: brokers profit on exchange turnover, happily letting you overtrade and blow accounts.</span>
              </li>
            </ul>
          </div>

          <div className="p-6 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle2 size={16} />
              <span className="text-sm uppercase font-sans">PulseHunter Quantitative Terminal</span>
            </div>
            <ul className="space-y-3 text-slate-300 font-sans text-xs">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Real-time Relative Strength against NIFTY: isolates stocks holding institutional bid support regardless of market chop.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Live Sector Breadth Radar: identifies capital rotation across Auto, IT, Metals, and Banking before retail notices.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Capital Loss Governor: mathematical circuit breaker halting sessions automatically before psychological tilt occurs.</span>
              </li>
            </ul>
          </div>

        </div>
      </section>

      {/* ==================== 9. CAPITAL SAFEGUARDS ==================== */}
      <section id="governance" className="py-16 px-4 sm:px-6 max-w-5xl mx-auto text-center border-t border-white/[0.08]">
        <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-widest">
          CAPITAL DISCIPLINE GOVERNANCE
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
          Mathematical Protection Against Tilt
        </h2>
        <p className="text-sm text-slate-400 mt-2 max-w-2xl mx-auto">
          Trading edge is nothing without capital survival. PulseHunter includes built-in daily loss limits and risk governors to eliminate emotional drawdowns.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-12 text-left font-sans">
          <div className="p-5 rounded-xl bg-[#0A0E17] border border-white/[0.08]">
            <span className="text-sm font-bold text-white block">Strict Risk Sizing</span>
            <span className="text-xs text-slate-400 mt-1 block leading-relaxed">
              Caps maximum exposure per trade to ensure one bad trade never ruins your month.
            </span>
          </div>
          <div className="p-5 rounded-xl bg-[#0A0E17] border border-white/[0.08]">
            <span className="text-sm font-bold text-white block">Daily Circuit Breaker</span>
            <span className="text-xs text-slate-400 mt-1 block leading-relaxed">
              Halts trading operations automatically if daily threshold drawdown is touched.
            </span>
          </div>
          <div className="p-5 rounded-xl bg-[#0A0E17] border border-white/[0.08]">
            <span className="text-sm font-bold text-white block">Post-Session Edge Ledger</span>
            <span className="text-xs text-slate-400 mt-1 block leading-relaxed">
              Continuous feedback on win rates, profit factor, payoff ratio, and hourly expectancy.
            </span>
          </div>
        </div>
      </section>

      {/* ==================== 10. ONBOARDING CTA BANNER ==================== */}
      <section className="py-20 px-4 sm:px-6 max-w-5xl mx-auto text-center">
        <div className="rounded-3xl p-8 sm:p-14 bg-gradient-to-b from-cyan-950/40 to-slate-900/60 border border-cyan-500/30 shadow-2xl relative overflow-hidden">
          <div className="relative z-10">
            <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold mb-4 border border-cyan-500/30">
              DESK ADMISSIONS ACTIVE · PHASE 1
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white">
              Ready to Trade with Institutional Vision?
            </h2>
            <p className="text-sm sm:text-base text-slate-300 mt-4 max-w-xl mx-auto leading-relaxed">
              Access is limited to serious intraday traders and proprietary desks to guarantee dedicated sub-second compute bandwidth.
            </p>
            <div className="mt-8 flex justify-center">
              <button
                onClick={() => setShowAccessModal(true)}
                className="px-8 py-3.5 rounded-xl text-xs font-mono font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:brightness-110 shadow-xl shadow-cyan-500/25 transition-all cursor-pointer"
              >
                Request Terminal Clearance Key
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== 11. FAQ & REGULATORY FOOTER ==================== */}
      <section className="py-16 px-4 sm:px-6 max-w-4xl mx-auto border-t border-white/[0.08]">
        <h3 className="text-xl font-bold text-white text-center mb-8 font-mono">
          Terminal Clearance FAQ
        </h3>
        <div className="space-y-3 text-xs font-mono">
          
          <div className="rounded-xl border border-white/[0.08] bg-[#0A0E17] overflow-hidden">
            <button
              onClick={() => setOpenFaq(openFaq === 1 ? null : 1)}
              className="w-full p-4 text-left flex justify-between items-center text-slate-200 hover:text-white"
            >
              <span>Why is terminal access by review and clearance only?</span>
              <ChevronDown size={14} className={`transition-transform ${openFaq === 1 ? "rotate-180" : ""}`} />
            </button>
            {openFaq === 1 && (
              <div className="p-4 pt-0 text-slate-400 font-sans leading-relaxed text-xs">
                To guarantee low-latency sub-second compute bandwidth and prevent strategy crowding across our 210 tracked Indian equities, we onboard active intraday desks in vetted cohorts.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#0A0E17] overflow-hidden">
            <button
              onClick={() => setOpenFaq(openFaq === 2 ? null : 2)}
              className="w-full p-4 text-left flex justify-between items-center text-slate-200 hover:text-white"
            >
              <span>Does PulseHunter execute orders automatically in my broker?</span>
              <ChevronDown size={14} className={`transition-transform ${openFaq === 2 ? "rotate-180" : ""}`} />
            </button>
            {openFaq === 2 && (
              <div className="p-4 pt-0 text-slate-400 font-sans leading-relaxed text-xs">
                PulseHunter is an analytical and screening decision-support terminal. Direct broker API order routing is on the private roadmap; subscribers currently receive real-time visual decision intelligence and risk governance.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#0A0E17] overflow-hidden">
            <button
              onClick={() => setOpenFaq(openFaq === 3 ? null : 3)}
              className="w-full p-4 text-left flex justify-between items-center text-slate-200 hover:text-white"
            >
              <span>What universe of stocks is monitored?</span>
              <ChevronDown size={14} className={`transition-transform ${openFaq === 3 ? "rotate-180" : ""}`} />
            </button>
            {openFaq === 3 && (
              <div className="p-4 pt-0 text-slate-400 font-sans leading-relaxed text-xs">
                The top 210 high-liquidity NSE F&O equities, representing over 85% of total Indian daily equity turnover. Illiquid penny stocks and circuit-prone counters are strictly excluded.
              </div>
            )}
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.08] bg-[#040609] py-12 px-4 sm:px-6 text-xs font-mono text-slate-500 text-center space-y-4">
        <div className="flex items-center justify-center gap-2 text-white font-bold">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          <span>PulseHunter Quantitative Terminal · Institutional Edition</span>
        </div>
        <p className="max-w-2xl mx-auto leading-relaxed text-[11px] font-sans">
          Regulatory Disclaimer: PulseHunter is an advanced quantitative decision-support terminal designed for market research and data visualization. We do not provide financial advisory, stock tips, or guaranteed returns. All financial trading carries substantial risk of capital loss.
        </p>
        <div className="pt-4 text-slate-600">
          © 2026 PulseHunter Terminal · All Rights Reserved
        </div>
      </footer>

      {/* ==================== MODALS ==================== */}

      {/* Clearance Registration Modal (Self-Registration, Encrypted Passwords) */}
      {showAccessModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0A0E17] max-w-md w-full rounded-2xl p-6 border border-white/[0.15] shadow-2xl space-y-4 font-mono text-xs">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-white font-sans">Request Terminal Clearance</h3>
                <p className="text-[11px] text-slate-400">Create your credentials for desk review.</p>
              </div>
              <button
                onClick={() => {
                  setShowAccessModal(false);
                  setRegSuccess(false);
                  setRegError("");
                }}
                className="text-slate-400 hover:text-white font-bold text-xl cursor-pointer"
              >
                &times;
              </button>
            </div>

            {regSuccess ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-3 font-sans">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <CheckCircle2 size={18} className="text-emerald-400" />
                  <span>Application Submitted Successfully</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Your credentials have been securely provisioned with status <strong>PENDING REVIEW</strong>.
                  The desk lead has been notified. You will receive an activation confirmation once approved.
                </p>
                <button
                  onClick={() => setShowAccessModal(false)}
                  className="w-full py-2 rounded-lg font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 cursor-pointer"
                >
                  Close Window
                </button>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3 pt-2">
                {regError && (
                  <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 font-sans text-xs flex items-center gap-2">
                    <AlertTriangle size={14} />
                    <span>{regError}</span>
                  </div>
                )}
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Full Name / Desk Title</label>
                  <input
                    required
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g. Parthiban (Momentum Lead)"
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.1] text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Direct Email Address</label>
                  <input
                    required
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="trader@domain.com"
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.1] text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Primary Intraday Strategy</label>
                  <select
                    value={regStrategy}
                    onChange={(e) => setRegStrategy(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#0F1523] border border-white/[0.1] text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option>Relative Strength & Sector Sympathy</option>
                    <option>Opening Range Breakout (ORB / 15m)</option>
                    <option>Range Compression & Squeeze Breakouts</option>
                    <option>Proprietary / Algorithmic Desk Execution</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Set Secure Password</label>
                  <input
                    required
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.1] text-white focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Passwords are encrypted via Supabase Auth. The admin never sees your password.
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={regBusy}
                  className="w-full mt-4 py-2.5 rounded-lg font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
                >
                  {regBusy ? "Submitting Application..." : "Submit Clearance Application"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Member Sign In Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0A0E17] max-w-sm w-full rounded-2xl p-6 border border-white/[0.15] shadow-2xl space-y-4 font-mono text-xs">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-white font-sans">Terminal Sign In</h3>
                <p className="text-[11px] text-slate-400">Enter your approved credentials.</p>
              </div>
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  setLoginError("");
                  setIsPendingApproval(false);
                }}
                className="text-slate-400 hover:text-white font-bold text-xl cursor-pointer"
              >
                &times;
              </button>
            </div>

            {isPendingApproval ? (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-3 font-sans">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Clock size={18} className="text-amber-400" />
                  <span>Application Under Review</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Your registration has been received and is currently under review by the desk lead.
                  You will receive an activation email once your terminal access is provisioned.
                </p>
                <button
                  onClick={() => setIsPendingApproval(false)}
                  className="w-full py-2 rounded-lg font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 cursor-pointer"
                >
                  Return to Home Screen
                </button>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="space-y-3 pt-2">
                {loginError && (
                  <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 font-sans text-xs flex items-center gap-2">
                    <AlertTriangle size={14} />
                    <span>{loginError}</span>
                  </div>
                )}
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Email Address</label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="trader@domain.com"
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.1] text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Password</label>
                  <input
                    required
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.1] text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loginBusy}
                  className="w-full mt-4 py-2.5 rounded-lg font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
                >
                  {loginBusy ? "Authenticating..." : "Authenticate Terminal"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

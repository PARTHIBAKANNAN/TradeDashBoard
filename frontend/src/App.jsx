import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Flame,
  Lightbulb,
  Star,
  LogOut,
  Sun,
  Moon,
  Radio,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  Briefcase,
  Brain,
  LineChart,
  MoreHorizontal,
  X,
  LayoutDashboard,
  Settings,
  User,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import {
  useMarketStream,
  useMarketMeta,
  useSymbols,
  resyncMarketStream,
} from "./hooks/useMarketStream.js";
import PullToRefresh from "./components/PullToRefresh.jsx";
import { marketStore } from "./store/marketStore.js";
import { usePositionsCount } from "./hooks/useOrders.js";
import { useTheme } from "./contexts/ThemeContext.jsx";
import { supabase } from "./lib/supabaseClient.js";
import RankingScreen from "./screens/RankingScreen.jsx";
import HeatmapScreen from "./screens/HeatmapScreen.jsx";
import InsightsScreen from "./screens/InsightsScreen.jsx";
import WatchlistScreen from "./screens/WatchlistScreen.jsx";
import ChartsScreen from "./screens/ChartsScreen.jsx";
import SmartMoneyScreen from "./screens/SmartMoneyScreen.jsx";
import PaperTradingScreen from "./screens/PaperTradingScreen.jsx";
import PositionsScreen from "./screens/PositionsScreen.jsx";
import DashboardScreen from "./screens/DashboardScreen.jsx";
import SettingsScreen from "./screens/SettingsScreen.jsx";
import LandingPage from "./screens/LandingPage.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import ConnectAliceBlueModal from "./components/ConnectAliceBlueModal.jsx";

// ---------------- Auth gate ----------------
export default function App() {
  const [auth, setAuth] = useState({
    loading: true,
    authenticated: false,
    user: null,
  });

  const check = async () => {
    try {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      const j = await r.json();
      setAuth({ loading: false, authenticated: j.authenticated, user: j.user });
    } catch {
      setAuth({ loading: false, authenticated: false, user: null });
    }
  };

  useEffect(() => {
    check();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    check();
  };

  if (auth.loading) return <Splash />;
  if (!auth.authenticated) return <LandingPage onLoginSuccess={check} />;
  return <Dashboard user={auth.user} onLogout={logout} />;
}

// ---------------- Splash ----------------
function Splash() {
  return (
    <div className="min-h-screen bg-surface grid place-items-center font-sans">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-accent-blue to-accent-violet animate-pulse-ring" />
          <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-accent-blue to-accent-violet grid place-items-center font-extrabold text-white shadow-glow">
            T
          </div>
        </div>
        <span className="text-xs font-semibold text-faint tracking-widest uppercase">
          Loading terminal…
        </span>
      </div>
    </div>
  );
}

// ---------------- Login screen ----------------
function Login({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword(
        { email, password },
      );
      if (authError || !data.session) {
        setError("Invalid email or password.");
        return;
      }
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ access_token: data.session.access_token }),
      });
      if (r.ok) {
        onSuccess();
      } else {
        setError("Could not establish a dashboard session.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-primary grid place-items-center p-6 font-sans relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-accent-violet/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 w-96 h-96 rounded-full bg-accent-blue/15 blur-3xl" />
      </div>

      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        onSubmit={submit}
        className="relative z-10 w-full max-w-sm bg-surface2/80 backdrop-blur-xl border border-subtle rounded-2xl p-7 shadow-glow"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-blue to-accent-violet grid place-items-center font-extrabold text-white shadow-glow-sm">
            T
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-accent-violet to-accent-blue bg-clip-text text-transparent font-display">
              Live Price Action
            </h1>
            <p className="text-xs text-faint">Sign in to continue</p>
          </div>
        </div>
        <label className="block text-xs font-bold text-muted uppercase mb-2 tracking-wide">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          className="w-full bg-surface3 border border-strong rounded-lg p-2.5 text-sm mb-4 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/40 transition-colors"
        />
        <label className="block text-xs font-bold text-muted uppercase mb-2 tracking-wide">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-surface3 border border-strong rounded-lg p-2.5 text-sm mb-5 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/40 transition-colors"
        />
        {error && <p className="text-bear text-xs mb-4">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-gradient-to-r from-accent-blue to-accent-violet hover:opacity-90 disabled:opacity-60 rounded-lg p-2.5 text-sm font-bold text-white transition-opacity shadow-glow-sm"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </motion.form>
    </div>
  );
}

// -------- Dashboard --------
function Dashboard({ user, onLogout }) {
  useMarketStream(); // Start/stop singleton WebSocket
  const meta = useMarketMeta();
  const symbols = useSymbols();
  const [activeTab, setActiveTab] = useState("ranking");
  const [chartsFocusSymbol, setChartsFocusSymbol] = useState(null);
  const [showBrokerModal, setShowBrokerModal] = useState(false);

  const openInCharts = (symbol) => {
    setChartsFocusSymbol(symbol);
    setActiveTab("charts");
  };

  // Reactive list of all stocks from marketStore
  const stocks = useMemo(() => {
    return symbols.map((s) => marketStore.getStock(s)).filter(Boolean);
  }, [symbols, meta.lastSeq]);

  const marketOpen = meta.marketOpen;
  const fyersConnected = meta.fyersConnected;
  const nifty = meta.nifty || {};
  const connected = meta.connected;

  const handleRefresh = async () => {
    // 1. Send WebSocket stream resync
    resyncMarketStream();

    // 2. Refresh initial state from /api/snapshot
    try {
      const r = await fetch("/api/snapshot", { credentials: "include" });
      if (r.ok) {
        const snap = await r.json();
        if (snap?.data) {
          marketStore.handleMessage(snap);
        }
      }
    } catch {
      /* ignore */
    }

    // 3. Brief pause for smooth animation
    await new Promise((resolve) => setTimeout(resolve, 400));
  };

  return (
    <div className="h-screen h-dvh bg-surface text-primary font-sans flex flex-col overflow-hidden pb-16 md:pb-0">
      <TopNavbar
        user={user}
        onLogout={onLogout}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        nifty={nifty}
        marketOpen={marketOpen}
        connected={connected}
        fyersConnected={fyersConnected}
        onOpenBrokerModal={() => setShowBrokerModal(true)}
      />

      <ConnectAliceBlueModal
        isOpen={showBrokerModal}
        onClose={() => setShowBrokerModal(false)}
        onConnected={() => {
          // Re-trigger status checks or socket sync if needed
        }}
      />

      <PullToRefresh onRefresh={handleRefresh} className="flex-1 min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="pb-24 md:pb-6"
          >
            {activeTab === "ranking" && (
              <RankingScreen stocks={stocks} nifty={nifty} />
            )}
            {activeTab === "heatmap" && <HeatmapScreen stocks={stocks} />}
            {activeTab === "insights" && <InsightsScreen stocks={stocks} />}
            {activeTab === "watchlist" && (
              <WatchlistScreen stocks={stocks} nifty={nifty} />
            )}
            {activeTab === "charts" && (
              <ChartsScreen
                stocks={stocks}
                focusSymbol={chartsFocusSymbol}
                onFocusHandled={() => setChartsFocusSymbol(null)}
              />
            )}
            {activeTab === "smart-money" && <SmartMoneyScreen />}
            {(activeTab === "positions" || activeTab === "paper-trading") && (
              <PositionsScreen stocks={stocks} />
            )}
            {activeTab === "dashboard" && (
              <DashboardScreen stocks={stocks} />
            )}
            {activeTab === "settings" && (
              <SettingsScreen onOpenBrokerModal={() => setShowBrokerModal(true)} />
            )}
          </motion.div>
        </AnimatePresence>
      </PullToRefresh>

      {/* Mobile Native Bottom Tab Bar for iOS & Android */}
      <MobileBottomBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        openPositionsCount={usePositionsCount()}
      />
    </div>
  );
}

// -------- Top Navbar (Desktop & Mobile Header) --------
function TopNavbar({
  user,
  onLogout,
  activeTab,
  onTabChange,
  nifty,
  marketOpen,
  connected,
  fyersConnected,
  onOpenBrokerModal,
}) {
  const openPositionsCount = usePositionsCount();
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const primaryTabs = [
    { key: "ranking", label: "Ranking", icon: "📊" },
    { key: "watchlist", label: "Watchlist", icon: "⭐" },
    { key: "charts", label: "Charts", icon: "📈" },
    {
      key: "positions",
      label:
        openPositionsCount > 0
          ? `Positions (${openPositionsCount})`
          : "Positions",
      icon: "⚡",
    },
    { key: "dashboard", label: "Dashboard", icon: "📑" },
    { key: "settings", label: "Settings", icon: "⚙️" },
  ];

  const secondaryTabs = [
    { key: "heatmap", label: "Heatmap", icon: "🔥" },
    { key: "insights", label: "Insights", icon: "💡" },
    { key: "smart-money", label: "Smart Money", icon: "🧠" },
  ];

  const isAnalyticsActive = ["heatmap", "insights", "smart-money"].includes(activeTab);

  return (
    <nav className="sticky top-0 z-50 border-b border-subtle bg-surface2/95 backdrop-blur-xl shadow-sm pt-safe flex-shrink-0">
      <div className="mx-auto max-w-[1920px] w-full px-3 sm:px-6 py-2 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand & Market Pulse */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <img
              src="/assets/logo.jpg"
              alt="PulseHunter"
              className="w-7 h-7 rounded-lg object-cover border border-accent-blue/30 shadow-glow-sm"
            />
            <h1 className="text-xs font-extrabold tracking-tight bg-gradient-to-r from-accent-blue via-cyan-400 to-accent-violet bg-clip-text text-transparent font-display">
              PulseHunter
            </h1>
            <div className="flex items-center gap-1.5 ml-1 pl-1.5 border-l border-subtle">
              <span
                className={`w-2 h-2 rounded-full ${
                  connected && marketOpen
                    ? "bg-green-500 animate-pulse"
                    : "bg-faint"
                }`}
              />
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                  marketOpen
                    ? "bg-green-950 text-green-400"
                    : "bg-surface3 text-muted"
                }`}
              >
                {marketOpen ? "Live" : connected ? "Closed" : "Offline"}
              </span>

              {/* Integrated Compact Broker Indicator */}
              <button
                type="button"
                onClick={onOpenBrokerModal}
                title={fyersConnected ? "Alice Blue: Session Active" : "Click to connect Alice Blue"}
                className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase transition-colors ${
                  fyersConnected
                    ? "bg-blue-950/60 text-blue-400 border border-blue-500/30"
                    : "bg-amber-950/60 text-amber-400 border border-amber-500/40 hover:bg-amber-900/40 cursor-pointer"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${fyersConnected ? "bg-blue-400" : "bg-amber-400 animate-ping"}`} />
                <span>{fyersConnected ? "Broker Live" : "Connect Broker"}</span>
              </button>
            </div>
          </div>

          {/* Desktop Navigation Tabs: Zero Horizontal Scroll */}
          <div className="hidden md:flex items-center gap-1 py-0.5 border-l border-subtle pl-2.5">
            {primaryTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  onTabChange(tab.key);
                  setAnalyticsOpen(false);
                }}
                className={`px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap rounded-lg transition-all ${
                  activeTab === tab.key
                    ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30 shadow-sm"
                    : "text-muted hover:text-primary hover:bg-surface3/60"
                }`}
              >
                <span className="mr-1">{tab.icon}</span>
                {tab.label}
              </button>
            ))}

            {/* Analytics Dropdown Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAnalyticsOpen(!analyticsOpen)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap rounded-lg transition-all ${
                  isAnalyticsActive
                    ? "bg-accent-violet/15 text-accent-violet border border-accent-violet/30 shadow-sm"
                    : "text-muted hover:text-primary hover:bg-surface3/60"
                }`}
              >
                <span>📊 Analytics</span>
                <ChevronDown size={12} className={`transition-transform ${analyticsOpen ? "rotate-180" : ""}`} />
              </button>

              {analyticsOpen && (
                <div
                  className="absolute left-0 mt-1.5 w-44 rounded-xl border border-subtle bg-surface2/95 backdrop-blur-xl shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-1"
                  onClick={() => setAnalyticsOpen(false)}
                >
                  {secondaryTabs.map((sub) => (
                    <button
                      key={sub.key}
                      onClick={() => onTabChange(sub.key)}
                      className={`w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2 hover:bg-surface3 transition-colors ${
                        activeTab === sub.key ? "text-accent-blue font-bold bg-accent-blue/10" : "text-primary"
                      }`}
                    >
                      <span>{sub.icon}</span>
                      <span>{sub.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right side: Benchmark & Compact Profile */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* NIFTY 50 */}
          <div className="text-right border-l border-subtle pl-2 sm:pl-3 flex flex-col justify-center">
            <div className="hidden sm:block text-[8px] sm:text-[9px] text-faint font-bold uppercase tracking-wider leading-tight">
              NIFTY 50
            </div>
            <div className="font-mono text-[11px] sm:text-xs font-bold flex items-center justify-end gap-1 sm:gap-1.5 leading-tight">
              <span className="sm:hidden text-[9px] text-faint font-semibold uppercase mr-0.5">
                NIFTY
              </span>
              <span className="text-primary font-semibold">
                {nifty.ltp?.toLocaleString("en-IN", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 2,
                }) || "—"}
              </span>
              <span className="hidden sm:inline-block">
                {nifty.change != null && (
                  <span
                    className={`text-[9px] sm:text-xs font-bold ${
                      nifty.change >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {nifty.change >= 0 ? "+" : ""}
                    {Number(nifty.change).toFixed(2)}
                  </span>
                )}
              </span>
              <span
                className={`text-[10px] sm:text-xs font-bold ${
                  (nifty.pct_change || 0) >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                ({(nifty.pct_change || 0) >= 0 ? "+" : ""}
                {nifty.pct_change || 0}%)
              </span>
            </div>
          </div>

          <div className="border-l border-subtle pl-2 sm:pl-3 flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />

            {/* Collapsed Profile Avatar Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen(!profileOpen)}
                className="w-8 h-8 rounded-full bg-surface3 border border-subtle hover:border-accent-blue/50 grid place-items-center text-primary transition-all shadow-sm"
                title={user || "User Profile"}
              >
                <User size={15} className="text-muted hover:text-accent-blue" />
              </button>

              {profileOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 rounded-2xl border border-subtle bg-surface2/95 backdrop-blur-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2"
                  onClick={() => setProfileOpen(false)}
                >
                  <div className="px-3 py-2 border-b border-subtle/70 mb-1">
                    <p className="text-[10px] uppercase font-bold text-faint tracking-wider">Signed In As</p>
                    <p className="text-xs font-semibold text-primary truncate" title={user}>
                      {user}
                    </p>
                  </div>

                  <button
                    onClick={onOpenBrokerModal}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg text-primary hover:bg-surface3 flex items-center justify-between transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Radio size={13} className={fyersConnected ? "text-emerald-400" : "text-amber-400"} />
                      Broker Status
                    </span>
                    <span className="text-[10px] font-bold uppercase text-muted">
                      {fyersConnected ? "Active" : "Connect"}
                    </span>
                  </button>

                  <button
                    onClick={() => onTabChange("settings")}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg text-primary hover:bg-surface3 flex items-center gap-2 transition-colors"
                  >
                    <Settings size={13} className="text-muted" />
                    <span>Control Center</span>
                  </button>

                  <div className="border-t border-subtle/70 my-1" />

                  <button
                    onClick={onLogout}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg text-bear hover:bg-bear/10 flex items-center gap-2 transition-colors font-semibold"
                  >
                    <LogOut size={13} />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

// -------- Mobile Native Bottom Bar for iOS & Android with More Drawer --------
function MobileBottomBar({ activeTab, onTabChange, openPositionsCount }) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const mainTabs = [
    { key: "ranking", label: "Ranking", icon: BarChart3 },
    { key: "charts", label: "Charts", icon: LineChart },
    {
      key: "positions",
      label: "Positions",
      icon: Briefcase,
      badge: openPositionsCount > 0 ? openPositionsCount : null,
    },
  ];

  const moreTabs = [
    {
      key: "heatmap",
      label: "Heatmap",
      icon: Flame,
      desc: "Market Sector Treemap",
    },
    {
      key: "watchlist",
      label: "Watchlist",
      icon: Star,
      desc: "Pinned Stocks & Radar",
    },
    {
      key: "insights",
      label: "Insights",
      icon: Lightbulb,
      desc: "ORB Breakouts & Drivers",
    },
    {
      key: "smart-money",
      label: "Smart Money",
      icon: Brain,
      desc: "Institutional Volume Flow",
    },
    {
      key: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      desc: "Journal, Analytics & Reports",
    },
    {
      key: "settings",
      label: "Settings",
      icon: Settings,
      desc: "Wallet & Trading Controls",
    },
  ];

  const isMoreActive = moreTabs.some((t) => t.key === activeTab);

  return (
    <>
      {/* Slide-up "More" Drawer for Secondary Tabs */}
      <AnimatePresence>
        {isMoreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMoreOpen(false)}
              className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="md:hidden fixed bottom-[56px] left-0 right-0 z-50 bg-[#0c0e17] border-t border-blue-500/20 rounded-t-2xl p-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/5">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  More Views & Analytics
                </span>
                <button
                  onClick={() => setIsMoreOpen(false)}
                  className="w-7 h-7 rounded-lg bg-surface3 flex items-center justify-center text-muted hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {moreTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => {
                        onTabChange(tab.key);
                        setIsMoreOpen(false);
                      }}
                      className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                        isActive
                          ? "bg-blue-600/15 border-blue-500/40 text-blue-400 shadow-sm"
                          : "bg-surface2/60 border-white/5 text-gray-300 hover:bg-surface3"
                      }`}
                    >
                      <div
                        className={`p-2 rounded-lg ${isActive ? "bg-blue-500/20 text-blue-400" : "bg-surface3 text-gray-400"}`}
                      >
                        <Icon size={18} />
                      </div>
                      <div>
                        <div className="text-xs font-bold">{tab.label}</div>
                        <div className="text-[10px] text-faint line-clamp-1">
                          {tab.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Primary Mobile Bottom Bar (4 items: Ranking, Charts, Positions, More) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0c0e17]/95 backdrop-blur-2xl border-t border-border-subtle/80 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        <div className="grid grid-cols-4 h-[54px] items-center px-2">
          {mainTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setIsMoreOpen(false);
                  onTabChange(tab.key);
                }}
                className={`flex flex-col items-center justify-center py-1 transition-all relative ${
                  isActive
                    ? "text-blue-400 font-bold"
                    : "text-text-muted/80 hover:text-text-primary font-medium"
                }`}
              >
                <div className="relative">
                  <Icon
                    size={19}
                    strokeWidth={isActive ? 2.3 : 1.8}
                    className={isActive ? "text-blue-400" : "text-text-muted"}
                  />
                  {tab.badge != null && (
                    <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-0.5 rounded-full bg-emerald-500 text-black text-[9px] font-black flex items-center justify-center shadow-sm">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] tracking-tight leading-none mt-1 truncate max-w-[65px] ${
                    isActive
                      ? "text-blue-400 font-semibold"
                      : "text-text-muted/80"
                  }`}
                >
                  {tab.label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="bottom-nav-active-indicator"
                    className="absolute top-0 w-8 h-[2px] rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                  />
                )}
              </button>
            );
          })}

          {/* "More" Menu Toggle Button */}
          <button
            onClick={() => setIsMoreOpen(!isMoreOpen)}
            className={`flex flex-col items-center justify-center py-1 transition-all relative ${
              isMoreActive || isMoreOpen
                ? "text-blue-400 font-bold"
                : "text-text-muted/80 hover:text-text-primary font-medium"
            }`}
          >
            <div className="relative">
              <MoreHorizontal
                size={19}
                strokeWidth={isMoreActive || isMoreOpen ? 2.3 : 1.8}
                className={
                  isMoreActive || isMoreOpen
                    ? "text-blue-400"
                    : "text-text-muted"
                }
              />
            </div>
            <span
              className={`text-[10px] tracking-tight leading-none mt-1 truncate max-w-[65px] ${
                isMoreActive || isMoreOpen
                  ? "text-blue-400 font-semibold"
                  : "text-text-muted/80"
              }`}
            >
              {isMoreActive
                ? moreTabs.find((t) => t.key === activeTab)?.label || "More"
                : "More"}
            </span>
            {isMoreActive && (
              <motion.div
                layoutId="bottom-nav-active-indicator"
                className="absolute top-0 w-8 h-[2px] rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            )}
          </button>
        </div>
      </div>
    </>
  );
}

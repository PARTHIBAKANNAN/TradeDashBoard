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
  CandlestickChart,
  Zap,
  Bookmark,
  Layers,
  SlidersHorizontal,
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
    <div className="h-screen h-dvh bg-surface text-primary font-sans flex flex-col overflow-hidden">
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
            className="pb-28 lg:pb-8 min-h-full"
          >
            {activeTab === "ranking" && (
              <RankingScreen stocks={stocks} nifty={nifty} />
            )}
            {activeTab === "smart-money" && <SmartMoneyScreen />}
            {activeTab === "charts" && (
              <ChartsScreen
                stocks={stocks}
                focusSymbol={chartsFocusSymbol}
                onFocusHandled={() => setChartsFocusSymbol(null)}
              />
            )}
            {(activeTab === "positions" || activeTab === "paper-trading") && (
              <PositionsScreen stocks={stocks} />
            )}
            {activeTab === "watchlist" && (
              <WatchlistScreen stocks={stocks} nifty={nifty} />
            )}
            {(activeTab === "dashboard" ||
              activeTab === "heatmap" ||
              activeTab === "insights") && (
              <DashboardScreen
                stocks={stocks}
                initialSubTab={
                  activeTab === "heatmap"
                    ? "heatmap"
                    : activeTab === "insights"
                      ? "insights"
                      : undefined
                }
              />
            )}
            {activeTab === "settings" && (
              <SettingsScreen
                onOpenBrokerModal={() => setShowBrokerModal(true)}
              />
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
  const [profileOpen, setProfileOpen] = useState(false);

  const navTabs = [
    { key: "ranking", label: "Ranking", icon: TrendingUp },
    { key: "smart-money", label: "Smart Money", icon: Zap },
    { key: "charts", label: "Charts", icon: CandlestickChart },
    {
      key: "positions",
      label: "Positions",
      icon: Layers,
      badge: openPositionsCount > 0 ? openPositionsCount : null,
    },
    { key: "watchlist", label: "Watchlist", icon: Bookmark },
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "settings", label: "Settings", icon: SlidersHorizontal },
  ];

  return (
    <nav className="sticky top-0 z-50 h-12 border-b border-border-subtle bg-surface2/95 backdrop-blur-md shadow-sm pt-safe flex-shrink-0 flex items-center transition-colors">
      <div className="mx-auto max-w-[1920px] w-full px-3 sm:px-5 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand & Status Cluster */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative">
              <img
                src="/assets/logo.jpg"
                alt="PulseHunter"
                className="w-6 h-6 rounded-md object-cover border border-subtle shadow-sm"
              />
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-surface2 ${
                  connected && marketOpen
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-slate-400"
                }`}
                title={marketOpen ? "Market Live" : "Market Closed"}
              />
            </div>
            <span className="text-xs font-bold tracking-tight text-primary font-display">
              PulseHunter
            </span>
          </div>

          {/* Desktop full badges (hidden on mobile to prevent orphan dots) */}
          <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-subtle">
            {/* Market Status Dot */}
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                connected && marketOpen
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                  : "bg-surface3 text-muted border border-subtle"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  connected && marketOpen
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-slate-400"
                }`}
              />
              <span className="hidden sm:inline">
                {marketOpen ? "Live" : connected ? "Closed" : "Offline"}
              </span>
            </span>

            {/* Broker Status Pill */}
            <button
              type="button"
              onClick={onOpenBrokerModal}
              title={
                fyersConnected ? "Alice Blue Active" : "Click to connect broker"
              }
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                fyersConnected
                  ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 cursor-pointer"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  fyersConnected ? "bg-blue-400" : "bg-amber-400 animate-ping"
                }`}
              />
              <span className="hidden sm:inline">
                {fyersConnected ? "Alice Blue" : "Connect"}
              </span>
            </button>
          </div>
        </div>

        {/* Center: 7 First-Class Pro Tabs */}
        <div className="hidden lg:flex items-center bg-surface3/60 border border-subtle p-0.5 rounded-xl gap-0.5 shadow-inner">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive =
              activeTab === tab.key ||
              (tab.key === "dashboard" &&
                ["dashboard", "heatmap", "insights"].includes(activeTab)) ||
              (tab.key === "positions" && activeTab === "paper-trading");

            return (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={`relative px-3 py-1.5 text-xs rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  isActive
                    ? "bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm font-bold"
                    : "text-muted hover:text-primary hover:bg-surface/50 font-medium"
                }`}
              >
                <Icon
                  size={13}
                  className={isActive ? "text-blue-400" : "text-muted"}
                />
                <span>{tab.label}</span>
                {tab.badge != null && (
                  <span className="ml-1 min-w-[15px] h-[15px] px-1 rounded-full bg-emerald-500 text-black text-[9px] font-black flex items-center justify-center shadow-sm">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right side: Benchmark & Profile Avatar */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* NIFTY 50 Live Ticker: Spot + Direction + Points Moved + % Moved */}
          {(() => {
            const ltp = nifty.ltp || 0;
            const pts =
              nifty.change != null && nifty.change !== 0
                ? nifty.change
                : nifty.prev_close && ltp
                  ? ltp - nifty.prev_close
                  : 0;
            const pct =
              nifty.pct_change ||
              (nifty.prev_close && pts ? (pts / nifty.prev_close) * 100 : 0);
            const isPos = pct >= 0;

            return (
              <div className="flex items-center gap-1.5 sm:gap-2 bg-surface3/80 border border-subtle px-2.5 py-1 rounded-lg text-xs font-mono shadow-sm">
                <span className="text-[10px] text-faint font-bold tracking-wider hidden sm:inline">
                  NIFTY 50
                </span>
                <span className="text-[10px] text-faint font-bold tracking-wider sm:hidden">
                  NIFTY
                </span>
                <span className="text-primary font-bold tabular-nums">
                  {ltp > 0
                    ? ltp.toLocaleString("en-IN", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 2,
                      })
                    : "—"}
                </span>
                <span
                  className={`text-[11px] font-bold tabular-nums flex items-center gap-0.5 ${
                    isPos
                      ? "text-bull-strong text-emerald-400"
                      : "text-bear-strong text-rose-400"
                  }`}
                >
                  <span>{isPos ? "▲" : "▼"}</span>
                  <span className="hidden sm:inline">
                    {isPos ? "+" : ""}
                    {pts.toFixed(1)}
                  </span>
                  <span>
                    ({isPos ? "+" : ""}
                    {Math.abs(pct).toFixed(2)}%)
                  </span>
                </span>
              </div>
            );
          })()}

          <div className="flex items-center gap-1.5">
            {/* Profile Avatar Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen(!profileOpen)}
                className="w-7 h-7 rounded-full bg-surface3 border border-subtle hover:border-blue-500/50 grid place-items-center text-primary transition-all shadow-sm cursor-pointer"
                title={user || "User Profile"}
              >
                <User size={14} className="text-muted hover:text-blue-400" />
              </button>

              {profileOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 rounded-2xl border border-subtle bg-surface2/95 backdrop-blur-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2"
                  onClick={() => setProfileOpen(false)}
                >
                  <div className="px-3 py-2 border-b border-subtle/70 mb-1">
                    <p className="text-[10px] uppercase font-bold text-faint tracking-wider">
                      Signed In As
                    </p>
                    <p
                      className="text-xs font-semibold text-primary truncate"
                      title={user}
                    >
                      {user}
                    </p>
                  </div>

                  <button
                    onClick={onOpenBrokerModal}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg text-primary hover:bg-surface3 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Radio
                        size={13}
                        className={
                          fyersConnected ? "text-emerald-400" : "text-amber-400"
                        }
                      />
                      Broker Status
                    </span>
                    <span className="text-[10px] font-bold uppercase text-muted">
                      {fyersConnected ? "Active" : "Connect"}
                    </span>
                  </button>

                  <button
                    onClick={() => onTabChange("settings")}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg text-primary hover:bg-surface3 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <SlidersHorizontal size={13} className="text-muted" />
                    <span>Settings &amp; Risk</span>
                  </button>

                  <div className="border-t border-subtle/70 my-1" />

                  <button
                    onClick={onLogout}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg text-bear hover:bg-bear/10 flex items-center gap-2 transition-colors font-semibold cursor-pointer"
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
    { key: "ranking", label: "Ranking", icon: TrendingUp },
    { key: "watchlist", label: "Watchlist", icon: Bookmark },
    { key: "charts", label: "Charts", icon: CandlestickChart },
    {
      key: "positions",
      label: "Positions",
      icon: Layers,
      badge: openPositionsCount > 0 ? openPositionsCount : null,
    },
  ];

  const moreTabs = [
    {
      key: "smart-money",
      label: "Smart Money",
      icon: Zap,
      desc: "Institutional Volume & Flow",
    },
    {
      key: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      desc: "Analytics, Heatmap & Insights",
    },
    {
      key: "settings",
      label: "Settings",
      icon: SlidersHorizontal,
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
              className="md:hidden fixed bottom-[56px] left-0 right-0 z-50 bg-surface2/98 border-t border-border-subtle rounded-t-2xl p-4 shadow-2xl backdrop-blur-2xl transition-colors"
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

      {/* Primary Mobile Bottom Bar (Ranking, Watchlist, Charts, Positions, More) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface2/95 backdrop-blur-2xl border-t border-border-subtle pb-[max(env(safe-area-inset-bottom),10px)] shadow-[0_-4px_20px_rgba(0,0,0,0.3)] transition-colors">
        <div className="grid grid-cols-5 h-[56px] items-center px-1">
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
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2.5px] rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.7)]"
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
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2.5px] rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.7)]"
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            )}
          </button>
        </div>
      </div>
    </>
  );
}

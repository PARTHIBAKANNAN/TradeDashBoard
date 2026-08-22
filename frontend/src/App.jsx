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
} from "lucide-react";
import {
  useMarketStream,
  useMarketMeta,
  useSymbols,
} from "./hooks/useMarketStream.js";
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
  if (!auth.authenticated) return <Login onSuccess={check} />;
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

// ---------------- Theme toggle ----------------
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="w-8 h-8 grid place-items-center rounded-lg border border-subtle bg-surface3 hover:bg-surface4 hover:border-strong transition-colors text-muted hover:text-primary"
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
    </button>
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

// ---------------- Connect-FYERS banner ----------------
function ConnectFyersBanner() {
  const connect = async () => {
    try {
      const r = await fetch("/api/auth/login-url", { credentials: "include" });
      const j = await r.json();
      if (j.url) window.open(j.url, "_blank", "noopener");
    } catch {
      /* ignore */
    }
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-accent-amber/30 bg-accent-amber/10 px-4 py-3"
    >
      <div className="flex items-center gap-3 text-sm text-accent-amber">
        <AlertTriangle size={16} className="flex-shrink-0" />
        <span>
          <b>FYERS not connected.</b> Live data is paused until you authorize
          the broker account.
        </span>
      </div>
      <button
        onClick={connect}
        className="whitespace-nowrap flex items-center gap-1.5 rounded-lg bg-accent-amber hover:brightness-110 px-3 py-1.5 text-xs font-bold text-black transition-all"
      >
        Connect FYERS
        <ArrowUpRight size={13} />
      </button>
    </motion.div>
  );
}

// -------- Dashboard --------
function Dashboard({ user, onLogout }) {
  useMarketStream(); // Start/stop singleton WebSocket
  const meta = useMarketMeta();
  const symbols = useSymbols();
  const [activeTab, setActiveTab] = useState("ranking");
  const [chartsFocusSymbol, setChartsFocusSymbol] = useState(null);
  const [aiStatus, setAiStatus] = useState({
    status: "LIVE",
    model: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash Live",
    connected: true,
  });

  useEffect(() => {
    let mounted = true;
    async function checkAiStatus() {
      try {
        const r = await fetch("/api/ai/status", { credentials: "include" });
        if (r.ok && mounted) {
          const j = await r.json();
          setAiStatus(j);
        }
      } catch {
        /* ignore */
      }
    }
    checkAiStatus();
    const interval = setInterval(checkAiStatus, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

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

  return (
    <div className="min-h-screen bg-surface text-primary font-sans flex flex-col">
      <TopNavbar
        user={user}
        onLogout={onLogout}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        nifty={nifty}
        marketOpen={marketOpen}
        connected={connected}
        fyersConnected={fyersConnected}
        aiStatus={aiStatus}
      />

      <div className="flex-1 overflow-auto">
        {fyersConnected === false && (
          <div className="mx-auto max-w-[1920px] w-full px-4 sm:px-6 pt-4">
            <ConnectFyersBanner />
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
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
            {activeTab === "paper-trading" && (
              <PaperTradingScreen stocks={stocks} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// -------- Top Navbar --------
function TopNavbar({
  user,
  onLogout,
  activeTab,
  onTabChange,
  nifty,
  marketOpen,
  connected,
  fyersConnected,
  aiStatus,
}) {
  const openPositionsCount = usePositionsCount();
  const tabs = [
    { key: "ranking", label: "Ranking", icon: "📊" },
    { key: "heatmap", label: "Heatmap", icon: "🔥" },
    { key: "insights", label: "Insights", icon: "💡" },
    { key: "watchlist", label: "Watchlist", icon: "⭐" },
    { key: "charts", label: "Charts", icon: "📈" },
    { key: "smart-money", label: "Smart Money", icon: "🧠" },
    {
      key: "paper-trading",
      label:
        openPositionsCount > 0
          ? `Positions (${openPositionsCount})`
          : "Positions",
      icon: "🧪",
    },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-subtle bg-surface2/95 backdrop-blur-xl shadow-sm">
      <div className="mx-auto max-w-[1920px] w-full px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
        {/* Left: Brand & Status & Navigation Tabs */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent-blue to-accent-violet grid place-items-center font-bold text-white text-xs shadow-glow-sm">
              T
            </div>
            <h1 className="text-xs font-bold tracking-tight bg-gradient-to-r from-accent-violet to-accent-blue bg-clip-text text-transparent hidden sm:block">
              Live Price Action
            </h1>
            <div className="flex items-center gap-1.5 ml-1 pl-2.5 border-l border-subtle">
              <span
                className={`w-2 h-2 rounded-full ${connected && marketOpen
                    ? "bg-green-500 animate-pulse"
                    : "bg-faint"
                  }`}
              />
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${marketOpen
                    ? "bg-green-950 text-green-400"
                    : "bg-surface3 text-muted"
                  }`}
              >
                {marketOpen ? "Live" : connected ? "Closed" : "Offline"}
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 border-l border-subtle pl-2.5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={`px-3 py-1.5 text-xs font-semibold whitespace-nowrap rounded-lg transition-all ${activeTab === tab.key
                    ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30 shadow-sm"
                    : "text-muted hover:text-primary hover:bg-surface3/60"
                  }`}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right side: Benchmark & AI Status & User */}
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
          {/* Live AI Status Badge */}
          {aiStatus?.status === "LIVE" ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-[10px] sm:text-[11px] font-bold shadow-sm whitespace-nowrap"
              title="Google Gemini 3.6 Flash Connected & Live"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span> Gemini 3.6 Flash Live</span>
            </div>
          ) : (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 font-mono text-[10px] sm:text-[11px] font-bold shadow-sm whitespace-nowrap"
              title="Quantitative Structural Math Fallback Engine Active"
            >
              <span>⚡ Institutional Model</span>
            </div>
          )}

          <div className="text-right hidden md:block border-l border-subtle pl-3">
            <div className="text-[9px] text-faint font-bold uppercase tracking-wider">
              NIFTY 50
            </div>
            <div className="font-mono text-xs font-bold">
              <span className="text-primary">
                {nifty.ltp?.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                })}
              </span>
              <span
                className={`ml-1.5 ${nifty.pct_change >= 0 ? "text-green-400" : "text-red-400"}`}
              >
                {nifty.pct_change >= 0 ? "+" : ""}
                {nifty.pct_change}%
              </span>
            </div>
          </div>

          <div className="border-l border-subtle pl-3 flex items-center gap-3">
            {!fyersConnected && (
              <button
                onClick={async () => {
                  try {
                    const r = await fetch("/api/auth/login-url", {
                      credentials: "include",
                    });
                    const j = await r.json();
                    if (j.url) window.open(j.url, "_blank", "noopener");
                  } catch {
                    /* ignore */
                  }
                }}
                className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded bg-accent-amber text-black hover:brightness-110 transition-colors"
                title="Connect FYERS broker account"
              >
                <span>Connect FYERS</span>
                <ArrowUpRight size={11} />
              </button>
            )}
            <div className="text-right hidden lg:block">
              <div className="text-[11px] text-faint truncate max-w-[130px]">
                {user}
              </div>
              <button
                onClick={onLogout}
                className="text-[10px] font-bold text-muted hover:text-primary transition-colors"
              >
                Log out
              </button>
            </div>
            <button
              onClick={onLogout}
              title="Log out"
              className="lg:hidden w-7 h-7 grid place-items-center rounded-lg border border-subtle bg-surface3 text-muted hover:text-primary transition-colors"
            >
              <LogOut size={13} />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}

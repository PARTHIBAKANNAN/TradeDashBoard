import React, { useEffect, useMemo, useState } from "react";
import { useMarketStream } from "./hooks/useMarketStream.js";
import { useTheme } from "./contexts/ThemeContext.jsx";
import { supabase } from "./lib/supabaseClient.js";
import WatchlistRow from "./components/WatchlistRow.jsx";
import Treemap from "./components/Treemap.jsx";
import Insights from "./components/insights/Insights.jsx";
import RankingScreen from "./screens/RankingScreen.jsx";
import HeatmapScreen from "./screens/HeatmapScreen.jsx";
import InsightsScreen from "./screens/InsightsScreen.jsx";
import WatchlistScreen from "./screens/WatchlistScreen.jsx";

const SORTS = {
  rs_desc: { label: "RS ▼ (strongest)", fn: (a, b) => b.relative_strength - a.relative_strength },
  rs_asc: { label: "RS ▲ (weakest)", fn: (a, b) => a.relative_strength - b.relative_strength },
  chg_desc: { label: "% Change ▼", fn: (a, b) => b.pct_change - a.pct_change },
  pos_desc: { label: "Day range % ▼", fn: (a, b) => b.day_range_pos - a.day_range_pos },
  sym: { label: "Symbol A-Z", fn: (a, b) => a.symbol.localeCompare(b.symbol) },
};

// ---------------- Auth gate ----------------
export default function App() {
  const [auth, setAuth] = useState({ loading: true, authenticated: false, user: null });

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

function Splash() {
  return (
    <div className="min-h-screen bg-surface text-faint grid place-items-center font-sans">
      Loading…
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
      className="w-8 h-8 grid place-items-center rounded-md border border-subtle bg-surface3 hover:bg-surface2 transition-colors text-muted hover:text-primary"
    >
      {theme === "dark" ? "☀" : "☾"}
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
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
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
    <div className="min-h-screen bg-surface text-primary grid place-items-center p-6 font-sans relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-surface2/80 backdrop-blur-xl border border-subtle rounded-xl p-7 shadow-glow"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-blue to-accent-violet grid place-items-center font-extrabold text-white">
            T
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-accent-violet to-accent-blue bg-clip-text text-transparent">
              Live Price Action
            </h1>
            <p className="text-xs text-faint">Sign in to continue</p>
          </div>
        </div>
        <label className="block text-xs font-bold text-muted uppercase mb-2">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          className="w-full bg-surface3 border border-strong rounded p-2.5 text-sm mb-4 focus:outline-none focus:border-accent-blue"
        />
        <label className="block text-xs font-bold text-muted uppercase mb-2">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-surface3 border border-strong rounded p-2.5 text-sm mb-5 focus:outline-none focus:border-accent-blue"
        />
        {error && <p className="text-red-400 text-xs mb-4">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-gradient-to-r from-accent-blue to-accent-violet hover:opacity-90 disabled:opacity-60 rounded p-2.5 text-sm font-bold text-white transition-opacity shadow-glow-sm"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
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
    <div className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-amber-800/40 bg-amber-950/30 px-4 py-3">
      <div className="text-sm text-amber-300">
        <b>FYERS not connected.</b> Live data is paused until you authorize the broker account.
      </div>
      <button
        onClick={connect}
        className="whitespace-nowrap rounded bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-bold text-black transition-colors"
      >
        Connect FYERS
      </button>
    </div>
  );
}

// -------- Dashboard --------
function Dashboard({ user, onLogout }) {
  const { data, connected } = useMarketStream();
  const [activeTab, setActiveTab] = useState("ranking");

  const marketOpen = data.market_open;
  const fyersConnected = data.fyers_connected;
  const nifty = data.nifty || {};

  return (
    <div className="min-h-screen bg-surface text-primary font-sans flex flex-col">
      {/* Top Navbar */}
      <TopNavbar
        user={user}
        onLogout={onLogout}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        nifty={nifty}
        marketOpen={marketOpen}
        connected={connected}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {fyersConnected === false && (
          <div className="mx-auto max-w-7xl px-6 pt-6">
            <ConnectFyersBanner />
          </div>
        )}

        {activeTab === "ranking" && <RankingScreen stocks={data.stocks || []} />}
        {activeTab === "heatmap" && <HeatmapScreen stocks={data.stocks || []} />}
        {activeTab === "insights" && <InsightsScreen stocks={data.stocks || []} />}
        {activeTab === "watchlist" && <WatchlistScreen stocks={data.stocks || []} />}
      </div>
    </div>
  );
}

// -------- Top Navbar --------
function TopNavbar({ user, onLogout, activeTab, onTabChange, nifty, marketOpen, connected }) {
  const tabs = [
    { key: "ranking", label: "Ranking", icon: "📊" },
    { key: "heatmap", label: "Heatmap", icon: "🔥" },
    { key: "insights", label: "Insights", icon: "💡" },
    { key: "watchlist", label: "Watchlist", icon: "⭐" },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-subtle bg-surface2/95 backdrop-blur-xl shadow-sm">
      <div className="mx-auto max-w-full px-6 py-4">
        <div className="flex items-center justify-between gap-6 mb-4">
          {/* Logo & Status */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-blue to-accent-violet grid place-items-center font-bold text-white text-sm">
              T
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight bg-gradient-to-r from-accent-violet to-accent-blue bg-clip-text text-transparent">
                Live Price Action
              </h1>
            </div>
            <div className="flex items-center gap-2 ml-4 pl-4 border-l border-subtle">
              <span
                className={`w-2 h-2 rounded-full ${
                  connected && marketOpen ? "bg-green-500 animate-pulse" : "bg-faint"
                }`}
              />
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                  marketOpen ? "bg-green-950 text-green-400" : "bg-surface3 text-muted"
                }`}
              >
                {marketOpen ? "Live" : connected ? "Closed" : "Offline"}
              </span>
            </div>
          </div>

          {/* Right side: Benchmark & User */}
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-[10px] text-faint font-bold uppercase">NIFTY 50</div>
              <div className="font-mono text-sm font-bold">
                <span className="text-primary">
                  {nifty.ltp?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
                <span className={`ml-2 ${nifty.pct_change >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {nifty.pct_change >= 0 ? "+" : ""}
                  {nifty.pct_change}%
                </span>
              </div>
            </div>

            <div className="border-l border-subtle pl-6 flex items-center gap-4">
              <div className="text-right">
                <div className="text-xs text-faint">{user}</div>
                <button
                  onClick={onLogout}
                  className="text-xs font-bold text-muted hover:text-primary transition-colors"
                >
                  Log out
                </button>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Horizontal Tabs */}
        <div className="flex gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
                activeTab === tab.key
                  ? "border-accent-blue text-accent-blue bg-surface3/40"
                  : "border-transparent text-muted hover:text-primary hover:bg-surface3/20"
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}


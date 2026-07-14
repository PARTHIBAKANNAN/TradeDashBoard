import React, { useEffect, useMemo, useState } from "react";
import {
  useMarketStream,
  useMarketMeta,
  useSymbols,
} from "./hooks/useMarketStream.js";
import { marketStore } from "./store/marketStore.js";
import WatchlistRow from "./components/WatchlistRow.jsx";

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
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    check();
  };

  if (auth.loading) return <Splash />;
  if (!auth.authenticated) return <Login onSuccess={check} />;
  return <Dashboard user={auth.user} onLogout={logout} />;
}

function Splash() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-500 grid place-items-center font-sans">
      Loading…
    </div>
  );
}

// ---------------- Login screen ----------------
function Login({ onSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      if (r.ok) {
        onSuccess();
      } else {
        setError("Invalid username or password.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 grid place-items-center p-6 font-sans">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-7 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 grid place-items-center font-extrabold">
            T
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Live Price Action</h1>
            <p className="text-xs text-zinc-500">Sign in to continue</p>
          </div>
        </div>
        <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          className="w-full bg-zinc-850 border border-zinc-700 rounded p-2.5 text-sm mb-4 focus:outline-none focus:border-blue-500"
        />
        <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-zinc-850 border border-zinc-700 rounded p-2.5 text-sm mb-5 focus:outline-none focus:border-blue-500"
        />
        {error && <p className="text-red-400 text-xs mb-4">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 rounded p-2.5 text-sm font-bold transition-colors"
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

// ---------------- Dashboard ----------------
function Dashboard({ user, onLogout }) {
  useMarketStream();                    // starts/stops the singleton WS
  const meta = useMarketMeta();
  const symbols = useSymbols();

  const [selectedSignal, setSelectedSignal] = useState("All signals");
  const [selectedSector, setSelectedSector] = useState("All sectors");
  const [dayRangeThreshold, setDayRangeThreshold] = useState(0);
  const [sortKey, setSortKey] = useState("rs_desc");

  // Filter+sort re-runs when: symbol set changes, meta.lastSeq ticks (any data
  // change), or a UI control changes. We snapshot the store synchronously here.
  const { sectors, visibleSymbols } = useMemo(() => {
    const rows = symbols
      .map((s) => marketStore.getStock(s))
      .filter(Boolean);

    const sectorSet = new Set(rows.map((r) => r.sector));

    const filtered = rows.filter((stock) => {
      if (selectedSignal !== "All signals") {
        if (!stock.signal || !stock.signal.includes(selectedSignal)) return false;
      }
      if (selectedSector !== "All sectors" && stock.sector !== selectedSector) return false;
      if (stock.day_range_pos < dayRangeThreshold) return false;
      return true;
    });

    filtered.sort(SORTS[sortKey].fn);
    return {
      sectors: ["All sectors", ...Array.from(sectorSet).sort()],
      visibleSymbols: filtered.map((r) => r.symbol),
    };
  }, [symbols, meta.lastSeq, selectedSignal, selectedSector, dayRangeThreshold, sortKey]);

  const marketOpen = meta.marketOpen;
  const fyersConnected = meta.fyersConnected;
  const nifty = meta.nifty || {};
  const connected = meta.connected;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-2xl">
        {fyersConnected === false && <ConnectFyersBanner />}

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Control label="Breakout Signal">
            <select
              value={selectedSignal}
              onChange={(e) => setSelectedSignal(e.target.value)}
              className="w-full bg-zinc-850 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none"
            >
              <option>All signals</option>
              <option value="Bull">Bull</option>
              <option value="Bear">Bear</option>
            </select>
          </Control>

          <Control label="Sector">
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="w-full bg-zinc-850 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none"
            >
              {sectors.map((s) => (<option key={s}>{s}</option>))}
            </select>
          </Control>

          <Control label="Sort by">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              className="w-full bg-zinc-850 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none"
            >
              {Object.entries(SORTS).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </Control>

          <div>
            <div className="flex justify-between">
              <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">
                Day Range Position ≥
              </label>
              <span className="text-xs font-bold text-blue-400">{dayRangeThreshold}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={dayRangeThreshold}
              onChange={(e) => setDayRangeThreshold(Number(e.target.value))}
              className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500 mt-3"
            />
          </div>
        </div>

        {/* Status / benchmark */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6">
          <div className="flex items-center space-x-3">
            <span className={`w-2.5 h-2.5 rounded-full ${
              connected && marketOpen ? "bg-green-500 animate-pulse" : "bg-zinc-500"
            }`} />
            <h1 className="text-lg font-bold tracking-tight text-white">Live Price Action Dashboard</h1>
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
              marketOpen ? "bg-green-950 text-green-400" : "bg-zinc-800 text-zinc-400"
            }`}>
              {marketOpen ? "Live" : connected ? "Closed" : "Offline"}
            </span>
            <span className="text-xs text-zinc-500 font-mono">({visibleSymbols.length} stocks)</span>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-0.5">
                Benchmark: NIFTY 50
              </div>
              <div className="font-mono text-sm">
                <span className="text-white font-bold">
                  {nifty.ltp?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}{" "}
                </span>
                <span className={nifty.pct_change >= 0 ? "text-green-400" : "text-red-400"}>
                  {nifty.pct_change >= 0 ? "+" : ""}{nifty.pct_change}%
                </span>
              </div>
            </div>
            <div className="text-right border-l border-zinc-800 pl-5">
              <div className="text-xs text-zinc-500">{user}</div>
              <button onClick={onLogout} className="text-xs font-bold text-zinc-400 hover:text-white transition-colors">
                Log out
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded border border-zinc-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-850/50 border-b border-zinc-800 text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                <th className="py-3 px-4">Stock</th>
                <th className="py-3 px-4 text-right">LTP</th>
                <th className="py-3 px-4 text-center">Price Range (Today vs Prev Day)</th>
                <th className="py-3 px-4 text-center">Signal</th>
                <th className="py-3 px-4 text-right">RS vs Nifty</th>
              </tr>
            </thead>
            <tbody>
              {visibleSymbols.map((sym) => (
                <WatchlistRow key={sym} symbol={sym} />
              ))}
            </tbody>
          </table>
          {visibleSymbols.length === 0 && (
            <div className="py-10 text-center text-zinc-600 text-sm">
              No stocks match the current filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Control({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">{label}</label>
      {children}
    </div>
  );
}

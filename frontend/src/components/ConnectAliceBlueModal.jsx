import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Lock,
  User,
  KeyRound,
  Zap,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react";

/**
 * ConnectAliceBlueModal
 * ---------------------
 * Quantman-style direct login modal: enters credentials + TOTP in-app
 * and calls the backend /api/auth/aliceblue/login endpoint which performs
 * the 4-step Alice Blue internal API handshake.
 *
 * If the backend ALICEBLUE_TOTP_KEY is configured the TOTP field is optional
 * (auto-generated server-side). Credentials default to backend config values
 * so the form can be submitted with just one click once pre-filled.
 */
export default function ConnectAliceBlueModal({
  isOpen,
  onClose,
  onConnected,
}) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const totpRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setUserId("");
      setPassword("");
      setTotp("");
      setError("");
      setSuccess(false);
      setLoading(false);
      setShowPwd(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/aliceblue/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          user_id: userId.trim(),
          password: password.trim(),
          totp: totp.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(true);
        setTimeout(() => {
          if (onConnected) onConnected();
          if (onClose) onClose();
        }, 1400);
      } else {
        setError(
          data.detail ||
            data.message ||
            "Login failed. Check credentials or TOTP.",
        );
      }
    } catch (err) {
      setError("Network error — could not reach the backend.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 24 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="relative w-full max-w-sm overflow-hidden rounded-t-3xl sm:rounded-2xl border-t sm:border border-border/60 bg-[#0f1117] p-6 shadow-2xl pb-safe"
        >
          {/* Decorative gradient */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-blue-500/6 to-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1 text-faint hover:bg-surface-elevated hover:text-primary transition-colors"
          >
            <X size={17} />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold text-primary">
                Alice Blue Login
              </h2>
              <p className="text-xs text-muted">
                Daily session renewal • Secure in-app
              </p>
            </div>
          </div>

          {success ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 text-center space-y-3"
            >
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-sm font-bold text-emerald-400">Connected!</h3>
              <p className="text-xs text-faint">
                Live market data stream active.
              </p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* User ID */}
              <div>
                <label className="block text-[11px] font-semibold text-muted mb-1">
                  User ID
                </label>
                <div className="relative">
                  <User
                    size={13}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                  />
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="e.g. 2628887 (or leave blank to use config)"
                    className="w-full rounded-xl border border-border/80 bg-surface-base pl-8 pr-3 py-2.5 text-xs text-primary placeholder-faint focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-semibold text-muted mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock
                    size={13}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                  />
                  <input
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Alice Blue password (or leave blank)"
                    className="w-full rounded-xl border border-border/80 bg-surface-base pl-8 pr-9 py-2.5 text-xs text-primary placeholder-faint focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted transition-colors"
                  >
                    {showPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              {/* TOTP */}
              <div>
                <label className="block text-[11px] font-semibold text-muted mb-1">
                  TOTP{" "}
                  <span className="text-faint font-normal">
                    (auto-generated if blank)
                  </span>
                </label>
                <div className="relative">
                  <KeyRound
                    size={13}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                  />
                  <input
                    ref={totpRef}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={totp}
                    onChange={(e) =>
                      setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="6-digit TOTP (optional)"
                    className="w-full rounded-xl border border-border/80 bg-surface-base pl-8 pr-3 py-2.5 text-xs text-primary placeholder-faint focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 tracking-widest"
                  />
                </div>
              </div>

              {/* Info banner */}
              <div className="flex items-start gap-2 rounded-xl border border-blue-500/15 bg-blue-500/5 px-3 py-2">
                <Zap size={12} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-blue-300/80 leading-relaxed">
                  Credentials are forwarded only to your backend. Leave fields
                  blank to use values pre-configured in your <code>.env</code>.
                </p>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-400"
                >
                  <AlertCircle size={13} className="flex-shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 py-3 text-xs font-bold text-white shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 mt-1"
              >
                {loading ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={14} />
                    <span>Login & Start Stream</span>
                  </>
                )}
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

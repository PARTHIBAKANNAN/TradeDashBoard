import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  RefreshCw,
  KeyRound,
  ArrowRight,
  ClipboardCheck,
} from "lucide-react";

/**
 * ConnectAliceBlueModal
 * ---------------------
 * Quantman-style seamless Alice Blue authorization:
 * 1. Trader clicks "Authorize with Alice Blue".
 * 2. Opens official Alice Blue popup: https://ant.aliceblueonline.com/?appcode=X926u86ZC6
 * 3. Trader enters Client ID, Password, and TOTP on Alice Blue's secure screen.
 * 4. Alice Blue auto-redirects to https://trading-dashboard-1.duckdns.org/callback?authCode=...
 * 5. Backend automatically exchanges authCode for developer userSession and starts the socket.
 * 6. Modal auto-detects completion via postMessage / polling and activates the live stream.
 */
export default function ConnectAliceBlueModal({ isOpen, onClose, onConnected }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [popupWindow, setPopupWindow] = useState(null);

  // Reset state when opened/closed
  useEffect(() => {
    if (!isOpen) {
      setError("");
      setSuccess(false);
      setLoading(false);
      setManualCode("");
      setShowManual(false);
      setManualSubmitting(false);
      setPopupWindow(null);
    }
  }, [isOpen]);

  // Listen for auto-callback postMessage from the popup window
  useEffect(() => {
    if (!isOpen) return;

    const handleMessage = (e) => {
      if (e.data && e.data.type === "ALICEBLUE_AUTH_COMPLETE") {
        if (e.data.status === "SUCCESS") {
          setSuccess(true);
          setLoading(false);
          setTimeout(() => {
            if (onConnected) onConnected();
            if (onClose) onClose();
          }, 1200);
        } else {
          setError("Alice Blue authorization failed. Please try again.");
          setLoading(false);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isOpen, onConnected, onClose]);

  // Polling fallback: checks /api/auth/status every 2.5s while popup is open
  useEffect(() => {
    if (!isOpen || !loading || success) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/auth/status", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            setSuccess(true);
            setLoading(false);
            clearInterval(interval);
            setTimeout(() => {
              if (onConnected) onConnected();
              if (onClose) onClose();
            }, 1200);
          }
        }
      } catch (err) {
        // ignore poll errors
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isOpen, loading, success, onConnected, onClose]);

  // Open the Quantman-style popup
  const handleOpenAuth = async () => {
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login-url", { credentials: "include" });
      const data = await res.json();
      const loginUrl = data.url || "https://ant.aliceblueonline.com/?appcode=X926u86ZC6";

      const width = 500;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        loginUrl,
        "AliceBlueAuth",
        `width=${width},height=${height},left=${left},top=${top},status=yes,toolbar=no,menubar=no`
      );

      if (!popup || popup.closed || typeof popup.closed === "undefined") {
        // Popup was blocked by browser
        window.location.href = loginUrl;
      } else {
        setPopupWindow(popup);
      }
    } catch (err) {
      setError("Failed to fetch Alice Blue authorization link.");
      setLoading(false);
    }
  };

  // Manual fallback submission
  const handleManualSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!manualCode.trim()) return;

    setManualSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/auth/aliceblue/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ auth_code: manualCode.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(true);
        setTimeout(() => {
          if (onConnected) onConnected();
          if (onClose) onClose();
        }, 1200);
      } else {
        setError(data.detail || "Invalid code or token exchange failed.");
      }
    } catch (err) {
      setError("Network error connecting to server.");
    } finally {
      setManualSubmitting(false);
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
          className="relative w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-2xl border-t sm:border border-border/60 bg-[#0f1117] p-6 shadow-2xl pb-safe"
        >
          {/* Decorative glow */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-blue-500/10 to-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1 text-faint hover:bg-surface-elevated hover:text-primary transition-colors"
          >
            <X size={17} />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/25 shadow-inner">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold text-primary">Connect Alice Blue</h2>
              <p className="text-xs text-muted">Official Quantman-style broker authorization</p>
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
              <h3 className="text-sm font-bold text-emerald-400">Connected & Authorized!</h3>
              <p className="text-xs text-faint">
                Live market data streaming has started.
              </p>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {/* Instructions steps */}
              <div className="rounded-xl border border-border/60 bg-surface-base/80 p-3.5 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-bold text-blue-400">
                    1
                  </div>
                  <p className="text-xs text-muted">
                    Click <strong className="text-primary font-semibold">Authorize with Alice Blue</strong> below.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-bold text-blue-400">
                    2
                  </div>
                  <p className="text-xs text-muted">
                    Enter your <strong className="text-primary font-semibold">Client ID, Password &amp; TOTP</strong> in the official Alice Blue window.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-bold text-blue-400">
                    3
                  </div>
                  <p className="text-xs text-muted">
                    Alice Blue automatically returns your token and begins live market streaming!
                  </p>
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-400"
                >
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}

              {/* Main Quantman Action Button */}
              <button
                type="button"
                onClick={handleOpenAuth}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] py-3.5 text-xs font-bold text-white shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Waiting for Alice Blue Authorization...</span>
                  </>
                ) : (
                  <>
                    <ExternalLink size={14} />
                    <span>Authorize with Alice Blue</span>
                    <ArrowRight size={13} className="ml-1 opacity-70" />
                  </>
                )}
              </button>

              {loading && (
                <p className="text-[11px] text-center text-faint animate-pulse">
                  Completing handshake with Alice Blue... Keep this window open.
                </p>
              )}

              {/* Manual code fallback accordion */}
              <div className="pt-2 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setShowManual((v) => !v)}
                  className="text-[11px] text-faint hover:text-muted transition-colors flex items-center gap-1 mx-auto"
                >
                  <span>{showManual ? "Hide manual entry" : "Or enter redirect URL / authCode manually"}</span>
                </button>

                {showManual && (
                  <form onSubmit={handleManualSubmit} className="mt-3 space-y-2">
                    <div className="relative">
                      <KeyRound size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                      <input
                        type="text"
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value)}
                        placeholder="Paste authCode or redirected URL here"
                        className="w-full rounded-xl border border-border/80 bg-surface-base pl-8 pr-3 py-2 text-xs text-primary placeholder-faint focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={manualSubmitting || !manualCode.trim()}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-surface-elevated hover:bg-surface-elevated/80 py-2 text-xs font-semibold text-primary transition-colors disabled:opacity-50"
                    >
                      {manualSubmitting ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : (
                        <ClipboardCheck size={13} />
                      )}
                      <span>Submit Code</span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  X,
  Lock,
  ArrowRight,
  RefreshCw,
  Zap,
} from "lucide-react";

export default function ConnectAliceBlueModal({ isOpen, onClose, onConnected }) {
  const [step, setStep] = useState(1);
  const [authInput, setAuthInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const loginUrl = "https://ant.aliceblueonline.com/?appcode=X926u86ZC6";

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setAuthInput("");
      setError("");
      setSuccess(false);
      setLoading(false);
    }
  }, [isOpen]);

  // Listen for postMessage from the popup redirect callback
  useEffect(() => {
    function handleMessage(event) {
      if (event.data && event.data.type === "ALICEBLUE_AUTH_COMPLETE") {
        if (event.data.status === "SUCCESS") {
          setSuccess(true);
          setTimeout(() => {
            if (onConnected) onConnected();
            if (onClose) onClose();
          }, 1000);
        } else {
          setError("Broker authentication failed. Please try again.");
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onConnected, onClose]);

  const handleOpenLogin = () => {
    window.open(loginUrl, "_blank", "width=600,height=750,noopener,noreferrer");
    setStep(2);
  };

  const handleManualSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!authInput.trim()) {
      setError("Please paste the redirected URL or authCode.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/aliceblue/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ auth_code: authInput.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(true);
        setTimeout(() => {
          if (onConnected) onConnected();
          if (onClose) onClose();
        }, 1200);
      } else {
        setError(data.detail || data.message || "Failed to exchange authorization token.");
      }
    } catch (err) {
      setError("Network error connecting to broker backend.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-[#0f1117] p-6 shadow-2xl"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1 text-faint hover:bg-surface-elevated hover:text-primary transition-colors"
          >
            <X size={18} />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold text-primary">Connect Alice Blue</h2>
              <p className="text-xs text-muted">Daily OAuth authorization & live market stream</p>
            </div>
          </div>

          {success ? (
            <div className="py-8 text-center space-y-3">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-sm font-bold text-emerald-400">Connected Successfully!</h3>
              <p className="text-xs text-faint">
                Alice Blue session active. Live market data is now streaming.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Step indicator */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-elevated/50 border border-border/40 text-xs">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  step === 1 ? "bg-blue-500 text-white" : "bg-emerald-500/20 text-emerald-400"
                }`}>
                  {step > 1 ? "✓" : "1"}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-primary">Daily Morning Authorization</div>
                  <div className="text-[11px] text-muted">Client ID: 2628887 (TradeDashboard)</div>
                </div>
              </div>

              {/* Step 1: Open Login */}
              {step === 1 && (
                <div className="space-y-3 pt-1">
                  <p className="text-xs text-muted leading-relaxed">
                    Click below to open Alice Blue login in a popup tab. Enter your password &amp; TOTP to authorize today&apos;s session.
                  </p>

                  <button
                    onClick={handleOpenLogin}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 py-3 text-xs font-bold text-white shadow-lg shadow-blue-500/20 transition-all"
                  >
                    <span>Open Alice Blue Login</span>
                    <ExternalLink size={14} />
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="text-[11px] text-faint hover:text-muted transition-colors underline"
                    >
                      Already logged in? Paste redirect URL manually
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Auto or Manual Capture */}
              {step === 2 && (
                <form onSubmit={handleManualSubmit} className="space-y-3 pt-1">
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 flex items-start gap-2.5">
                    <RefreshCw size={14} className="text-blue-400 animate-spin flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-blue-300/90 leading-relaxed">
                      Waiting for login approval. If the popup redirects to a page, copy its URL or auth code and paste it below:
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-muted mb-1">
                      Redirect URL or authCode:
                    </label>
                    <input
                      type="text"
                      value={authInput}
                      onChange={(e) => setAuthInput(e.target.value)}
                      placeholder="e.g. https://...callback?authCode=XYZ or XYZ"
                      className="w-full rounded-xl border border-border/80 bg-surface-base px-3 py-2.5 text-xs text-primary placeholder-faint focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-400">
                      <AlertCircle size={14} className="flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="w-1/3 rounded-xl border border-border/60 bg-surface-elevated hover:bg-surface-elevated/80 py-2.5 text-xs font-semibold text-muted transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-2/3 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>Connecting...</span>
                        </>
                      ) : (
                        <>
                          <span>Connect &amp; Stream</span>
                          <ArrowRight size={13} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

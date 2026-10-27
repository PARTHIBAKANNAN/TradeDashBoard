import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Check } from "lucide-react";

const PULL_THRESHOLD = 60; // Pixels needed to trigger refresh
const MAX_PULL = 90; // Maximum visual pull distance

export default function PullToRefresh({ children, onRefresh, className = "" }) {
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const startYRef = useRef(0);
  const isPullingRef = useRef(false);
  const containerRef = useRef(null);

  const handleTouchStart = (e) => {
    // Only allow pull-to-refresh if user is at the very top of the scroll container
    const container = containerRef.current;
    if (!container || isRefreshing) return;

    if (container.scrollTop <= 0) {
      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    }
  };

  const handleTouchMove = (e) => {
    if (!isPullingRef.current || isRefreshing) return;
    const container = containerRef.current;
    if (container && container.scrollTop > 0) {
      isPullingRef.current = false;
      setPullY(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;

    if (diff > 0) {
      // Elastic resistance curve
      const resistanceY = Math.min(Math.pow(diff, 0.85) * 1.5, MAX_PULL);
      setPullY(resistanceY);
      // Prevent browser default overscroll
      if (e.cancelable && diff > 5) {
        e.preventDefault();
      }
    } else {
      setPullY(0);
    }
  };

  const handleTouchEnd = async () => {
    if (!isPullingRef.current || isRefreshing) return;
    isPullingRef.current = false;

    if (pullY >= PULL_THRESHOLD) {
      setIsRefreshing(true);
      setPullY(46); // Snap to loading height

      try {
        if (onRefresh) {
          await onRefresh();
        }
        setIsSuccess(true);
        setTimeout(() => {
          setIsSuccess(false);
          setIsRefreshing(false);
          setPullY(0);
        }, 500);
      } catch (err) {
        console.error("Pull to refresh error:", err);
        setIsRefreshing(false);
        setPullY(0);
      }
    } else {
      setPullY(0);
    }
  };

  const progress = Math.min(pullY / PULL_THRESHOLD, 1);
  const isPastThreshold = pullY >= PULL_THRESHOLD;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative overflow-y-auto overscroll-y-contain min-h-0 w-full ${className}`}
    >
      {/* Animated Pull-to-Refresh Indicator */}
      <AnimatePresence>
        {(pullY > 0 || isRefreshing) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: pullY,
            }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="absolute top-0 left-0 right-0 z-40 flex justify-center pointer-events-none -mt-10"
          >
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#131722]/95 border border-blue-500/40 shadow-xl shadow-blue-500/15 backdrop-blur-xl">
              {isSuccess ? (
                <>
                  <Check size={14} className="text-emerald-400 stroke-[3]" />
                  <span className="text-[11px] font-bold text-emerald-400">
                    Updated
                  </span>
                </>
              ) : isRefreshing ? (
                <>
                  <RefreshCw size={14} className="text-blue-400 animate-spin" />
                  <span className="text-[11px] font-bold text-blue-400">
                    Refreshing terminal…
                  </span>
                </>
              ) : (
                <>
                  <motion.div
                    animate={{ rotate: progress * 360 }}
                    transition={{ ease: "linear", duration: 0 }}
                  >
                    <RefreshCw
                      size={14}
                      className={
                        isPastThreshold ? "text-blue-400" : "text-gray-400"
                      }
                    />
                  </motion.div>
                  <span
                    className={`text-[11px] font-bold ${
                      isPastThreshold ? "text-blue-400" : "text-gray-400"
                    }`}
                  >
                    {isPastThreshold ? "Release to refresh" : "Pull to refresh"}
                  </span>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content wrapper displaced smoothly during pull */}
      <motion.div
        animate={{ y: isRefreshing ? 28 : pullY * 0.4 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        {children}
      </motion.div>
    </div>
  );
}

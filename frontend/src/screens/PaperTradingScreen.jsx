import React from "react";
import { FlaskConical } from "lucide-react";
import PaperTrading from "../components/paper-trading/PaperTrading.jsx";

export default function PaperTradingScreen({ stocks }) {
  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
            <FlaskConical size={17} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-primary font-display">
              Paper Trading
            </h2>
            <p className="text-xs text-faint">
              Simulated intraday orders against live prices — no real money, no
              real broker orders
            </p>
          </div>
        </div>

        <PaperTrading stocks={stocks} />
      </div>
    </div>
  );
}

"""
Standard discount-broker charge approximation for a paper-trading round trip
(one entry leg + one exit leg). Rates are named constants specifically so
they're easy to retune later — these are typical intraday-equity figures, not
a live feed of actual regulatory rates.

`side` is always the ENTRY side (BUY or SELL); the exit leg is implicitly the
opposite side. STT and stamp duty are charged per *leg direction* (whichever
leg is actually a sell / actually a buy), not per "entry vs exit" — this
matters for a short (SELL entry -> BUY exit), where STT lands on the entry
leg and stamp duty on the exit leg, the reverse of a long trade.
"""

BROKERAGE_RATE = 0.0003  # 0.03% per executed leg
BROKERAGE_CAP = 20.0  # flat ₹20 max per leg (typical discount-broker cap)
STT_SELL_RATE = 0.00025  # 0.025% on sell-leg turnover only (intraday equity)
EXCHANGE_TXN_RATE = 0.0000297  # NSE exchange transaction charge, both legs
SEBI_RATE = 0.0000001  # ₹10 per crore, both legs
STAMP_DUTY_BUY_RATE = 0.00015  # 0.015% on buy-leg turnover only
GST_RATE = 0.18  # on (brokerage + exchange transaction charges) only


def _brokerage_for_leg(turnover: float) -> float:
    return min(turnover * BROKERAGE_RATE, BROKERAGE_CAP)


def compute_charges(side: str, quantity: int, entry_price: float, exit_price: float) -> dict:
    entry_turnover = entry_price * quantity
    exit_turnover = exit_price * quantity
    if side == "BUY":
        buy_turnover, sell_turnover = entry_turnover, exit_turnover
    else:
        buy_turnover, sell_turnover = exit_turnover, entry_turnover

    brokerage = round(_brokerage_for_leg(entry_turnover) + _brokerage_for_leg(exit_turnover), 2)
    stt = round(sell_turnover * STT_SELL_RATE, 2)
    exchange_charges = round((entry_turnover + exit_turnover) * EXCHANGE_TXN_RATE, 2)
    sebi_charges = round((entry_turnover + exit_turnover) * SEBI_RATE, 2)
    stamp_duty = round(buy_turnover * STAMP_DUTY_BUY_RATE, 2)
    gst = round((brokerage + exchange_charges) * GST_RATE, 2)
    total_charges = round(brokerage + stt + exchange_charges + sebi_charges + stamp_duty + gst, 2)

    return {
        "brokerage": brokerage,
        "stt": stt,
        "exchange_charges": exchange_charges,
        "sebi_charges": sebi_charges,
        "stamp_duty": stamp_duty,
        "gst": gst,
        "total_charges": total_charges,
    }

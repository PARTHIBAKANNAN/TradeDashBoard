"""
Minimal, standalone FYERS websocket test. Run from backend/:  python test_ws.py

No FastAPI, no threads, no scheduler — just the raw data socket subscribing to a
couple of symbols and printing ticks. This isolates whether the websocket itself
is stable on this network/token, separate from the app.

  * If ticks print  -> the socket + token are fine; the issue is app-side / duplicate connections.
  * If it only prints "connection lost" -> the network (Zscaler) or a duplicate
    session is killing the socket; try a personal network / fully kill other runs.
"""

from app import auth, config
from fyers_apiv3.FyersWebsocket import data_ws

token = auth._load_cached_token()
print("Cached token present:", bool(token))
if not token:
    raise SystemExit("No token. Run manual_auth.py first.")

SYMBOLS = ["NSE:TCS-EQ", "NSE:RELIANCE-EQ", "NSE:NIFTY50-INDEX"]


def on_message(msg):
    print("TICK:", msg)


def on_open():
    print(">>> connected; subscribing to", SYMBOLS)
    ws.subscribe(symbols=SYMBOLS, data_type="SymbolUpdate")
    ws.keep_running()


def on_error(msg):
    print("ERROR:", msg)


def on_close(msg):
    print("CLOSED:", msg)


ws = data_ws.FyersDataSocket(
    access_token=f"{config.CLIENT_ID}:{token}",
    log_path="",
    litemode=False,
    write_to_file=False,
    reconnect=False,  # no auto-reconnect so we see the raw first-connection behavior
    on_connect=on_open,
    on_close=on_close,
    on_error=on_error,
    on_message=on_message,
)
print("Connecting ... (Ctrl+C to stop)")
ws.connect()

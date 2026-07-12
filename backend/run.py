"""Dev entrypoint: `python run.py` (from the backend/ directory).

NOTE: reload is OFF on purpose. FYERS permits only ONE websocket data
connection per app; uvicorn's --reload spawns a second worker on every file
save, so the two connections kick each other and trigger a reconnect storm.
Restart manually after code changes. (Set reload=True only if you disable the
data engine.)
"""
import uvicorn

from app import config

if __name__ == "__main__":
    uvicorn.run("app.main:app", host=config.HOST, port=config.PORT, reload=False)

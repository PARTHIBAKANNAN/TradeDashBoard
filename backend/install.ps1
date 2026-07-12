# Backend install for Windows / PowerShell. Run from the backend/ directory.
# Handles the fyers-apiv3 dependency quirks on Python 3.13 automatically.

Write-Host "Installing core app dependencies ..." -ForegroundColor Cyan
python -m pip install -r requirements.txt

Write-Host "Installing fyers-apiv3 without its broken pins ..." -ForegroundColor Cyan
python -m pip install --no-deps fyers-apiv3==3.1.14

Write-Host "Installing fyers-compatible transitive dependencies ..." -ForegroundColor Cyan
python -m pip install "aiohttp>=3.10" websocket-client aws-lambda-powertools "setuptools<81"

Write-Host "Verifying imports ..." -ForegroundColor Cyan
python -c "import app.main; from fyers_apiv3 import fyersModel; from fyers_apiv3.FyersWebsocket import data_ws; print('OK: backend + fyers-apiv3 import cleanly')"

Write-Host "Done. Copy .env.example to .env and fill in your Fyers credentials, then run: python run.py" -ForegroundColor Green

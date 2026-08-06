-- Adds per-bucket traded volume to candle_history, needed by the Smart Money
-- Engine (backend/app/smart_money.py) for RVOL and Fresh Turnover. Paste into
-- Supabase's SQL Editor once, same one-time manual step as prior migrations.

alter table public.candle_history add column if not exists volume numeric(18, 2);

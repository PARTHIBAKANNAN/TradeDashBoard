-- Adds a tick-rule cumulative-volume-delta estimate to candle_history, for
-- the Charts tab's CVD histogram pane. Paste into Supabase's SQL Editor
-- once, same one-time manual step as prior migrations.

alter table public.candle_history add column if not exists delta numeric(18, 2);

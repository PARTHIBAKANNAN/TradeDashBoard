-- Backtest groundwork only (see candle_aggregator.py / candle_history.py) —
-- persists completed 5-min candles so a real backtest becomes possible once
-- enough days have accumulated. Paste into Supabase's SQL Editor once, same
-- one-time manual step as prior migrations.

create table if not exists public.candle_history (
    id bigint generated always as identity primary key,
    symbol text not null,
    bucket_date date not null,
    bucket_minute int not null,  -- minutes since midnight IST, 5-min aligned
    open numeric(18, 4),
    high numeric(18, 4),
    low numeric(18, 4),
    close numeric(18, 4),
    created_at timestamptz not null default now(),
    unique (symbol, bucket_date, bucket_minute)
);
create index if not exists idx_candle_history_symbol_date on public.candle_history (symbol, bucket_date);

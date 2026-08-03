-- Adds Trailing Stop Loss support to paper_orders. Paste into Supabase's SQL
-- Editor once, same one-time manual step as 001_orders.sql.

alter table public.paper_orders add column if not exists tsl_type text
    check (tsl_type in ('PERCENT', 'POINTS'));
alter table public.paper_orders add column if not exists tsl_value numeric(18, 4);
-- Best price reached since entry (or since TSL was last (re)configured) — the
-- reference point the trailing stop ratchets off of. Persisted so a backend
-- restart doesn't reset trailing progress and let the stop retreat.
alter table public.paper_orders add column if not exists peak_price numeric(18, 4);

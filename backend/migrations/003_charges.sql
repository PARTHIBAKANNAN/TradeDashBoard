-- Adds brokerage/tax charge tracking to paper_orders. Paste into Supabase's
-- SQL Editor once, same one-time manual step as 001_orders.sql/002_trailing_stop.sql.

alter table public.paper_orders add column if not exists brokerage numeric(18, 2);
alter table public.paper_orders add column if not exists stt numeric(18, 2);
alter table public.paper_orders add column if not exists exchange_charges numeric(18, 2);
alter table public.paper_orders add column if not exists sebi_charges numeric(18, 2);
alter table public.paper_orders add column if not exists stamp_duty numeric(18, 2);
alter table public.paper_orders add column if not exists gst numeric(18, 2);
alter table public.paper_orders add column if not exists total_charges numeric(18, 2);
-- Net of realized_pnl minus total_charges — the actual cash impact once
-- brokerage/taxes are accounted for, as opposed to the gross realized_pnl.
alter table public.paper_orders add column if not exists net_pnl numeric(18, 2);

-- Adds an optional free-text journal note to paper_orders. Paste into
-- Supabase's SQL Editor once, same one-time manual step as prior migrations.

alter table public.paper_orders add column if not exists notes text;

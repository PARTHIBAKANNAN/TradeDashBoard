-- Migration to track MFE (Maximum Favorable Excursion) and MAE (Maximum Adverse Excursion)
-- and their associated R-multiples for advanced trade diagnostics.

ALTER TABLE public.paper_orders
ADD COLUMN IF NOT EXISTS mfe_price numeric(18, 4),
ADD COLUMN IF NOT EXISTS mae_price numeric(18, 4),
ADD COLUMN IF NOT EXISTS initial_sl_price numeric(18, 4), -- explicitly track initial SL separate from trailing SL
ADD COLUMN IF NOT EXISTS initial_risk_per_share numeric(18, 4),
ADD COLUMN IF NOT EXISTS mfe_r numeric(18, 2),
ADD COLUMN IF NOT EXISTS mae_r numeric(18, 2),
ADD COLUMN IF NOT EXISTS exit_r numeric(18, 2),
ADD COLUMN IF NOT EXISTS time_to_05r timestamptz,
ADD COLUMN IF NOT EXISTS time_to_1r timestamptz,
ADD COLUMN IF NOT EXISTS time_to_15r timestamptz,
ADD COLUMN IF NOT EXISTS time_to_2r timestamptz;

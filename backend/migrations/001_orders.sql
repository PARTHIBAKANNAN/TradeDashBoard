-- Paper trading schema. Paste this into Supabase's SQL Editor once
-- (Project -> SQL Editor -> New query -> Run). No migration framework
-- exists in this repo yet; this is a one-time manual setup step, same
-- convention as the FYERS token-cache file.

-- One row per user; created lazily on first use with a starting balance.
create table if not exists public.paper_wallets (
    user_id         uuid primary key,
    balance         numeric(18, 2) not null default 100000.00,  -- starting virtual cash; adjust as desired
    updated_at      timestamptz not null default now()
);

create table if not exists public.paper_orders (
    id              bigint generated always as identity primary key,
    user_id         uuid        not null references public.paper_wallets(user_id),
    symbol          text        not null,              -- short symbol, e.g. "TCS" — matches market_state.stocks key
    side            text        not null check (side in ('BUY', 'SELL')),
    quantity        integer     not null check (quantity > 0),   -- whole shares only
    order_type      text        not null check (order_type in ('MARKET', 'LIMIT')),
    limit_price     numeric(18, 4),                     -- required if order_type = 'LIMIT', null for MARKET
    sl_price        numeric(18, 4),                     -- optional bracket stop-loss
    target_price    numeric(18, 4),                     -- optional bracket target
    entry_price     numeric(18, 4),                      -- null until filled (MARKET fills immediately; LIMIT waits)
    exit_price      numeric(18, 4),                      -- null while open/pending
    margin_locked   numeric(18, 2),                      -- amount deducted from wallet while this position is open
    status          text        not null default 'PENDING'
                      check (status in ('PENDING', 'OPEN', 'CLOSED', 'CANCELLED')),
    close_reason    text check (close_reason in ('MANUAL', 'SL', 'TARGET', 'SQUARE_OFF')),
    realized_pnl    numeric(18, 4),                      -- populated only on close
    placed_at       timestamptz not null default now(),
    filled_at       timestamptz,                          -- when a LIMIT order actually fills (MARKET: ~= placed_at)
    closed_at       timestamptz,
    created_at      timestamptz not null default now()
);

create index if not exists idx_paper_orders_user_status on public.paper_orders (user_id, status);
create index if not exists idx_paper_orders_symbol_status on public.paper_orders (symbol, status);  -- for the live order-monitor's per-symbol lookups
create index if not exists idx_paper_orders_user_placed_at on public.paper_orders (user_id, placed_at desc);

-- Defense-in-depth documentation only: the backend connects via one pooled
-- asyncpg service connection (not per-user JWTs), so auth.uid() never
-- resolves here. Actual per-user isolation is enforced app-side via
-- `WHERE user_id = $1` on every query in app/paper_trading.py.
alter table public.paper_wallets enable row level security;
alter table public.paper_orders enable row level security;
create policy "select own wallet" on public.paper_wallets for select using (auth.uid() = user_id);
create policy "select own orders" on public.paper_orders for select using (auth.uid() = user_id);
create policy "insert own orders" on public.paper_orders for insert with check (auth.uid() = user_id);
create policy "update own orders" on public.paper_orders for update using (auth.uid() = user_id);

-- FLASHGUYS database setup
-- Run in Supabase Dashboard > SQL Editor as the project owner.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  wallet_address text,
  wallet_chain text check (wallet_chain is null or wallet_chain in ('solana', 'robinhood')),
  wallet_name text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read their own FLASHGUYS profile" on public.profiles;
create policy "Users can read their own FLASHGUYS profile"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can create their own FLASHGUYS profile" on public.profiles;
create policy "Users can create their own FLASHGUYS profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own FLASHGUYS profile" on public.profiles;
create policy "Users can update their own FLASHGUYS profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant select, insert, update on public.profiles to authenticated;

create table if not exists public.flashguys_token_cache (
  chain text not null check (chain in ('sol', 'robinhood')),
  address text not null,
  payload jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (chain, address)
);

create table if not exists public.flashguys_token_history (
  chain text not null check (chain in ('sol', 'robinhood')),
  address text not null,
  observed_minute timestamptz not null,
  price numeric,
  market_cap numeric,
  liquidity numeric,
  volume_24h numeric,
  holders bigint,
  payload jsonb not null,
  primary key (chain, address, observed_minute)
);

create index if not exists flashguys_token_history_lookup
  on public.flashguys_token_history (chain, address, observed_minute desc);

-- Server-side DATABASE_URL uses the PostgreSQL owner/service connection.
-- Do not expose DATABASE_URL in VITE_ variables or browser code.

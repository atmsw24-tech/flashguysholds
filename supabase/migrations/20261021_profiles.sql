-- FLASHGUYS Supabase profile storage
-- Run this file in Supabase Dashboard -> SQL Editor -> New query.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  wallet_address text,
  wallet_chain text check (wallet_chain is null or wallet_chain in ('solana', 'robinhood')),
  wallet_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own FLASHGUYS profile" on public.profiles;
create policy "Users can view their own FLASHGUYS profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can insert their own FLASHGUYS profile" on public.profiles;
create policy "Users can insert their own FLASHGUYS profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "Users can update their own FLASHGUYS profile" on public.profiles;
create policy "Users can update their own FLASHGUYS profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select, insert, update on public.profiles to authenticated;

-- Create a profile row automatically for every new Supabase Auth user.
create or replace function public.create_flashguys_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_flashguys_auth_user_created on auth.users;
create trigger on_flashguys_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_flashguys_profile();

-- Keep the profile email aligned when a user changes their email.
create or replace function public.sync_flashguys_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email, updated_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_flashguys_auth_user_updated on auth.users;
create trigger on_flashguys_auth_user_updated
  after update of email on auth.users
  for each row execute procedure public.sync_flashguys_profile_email();

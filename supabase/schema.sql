-- =========================================================
-- Masarify - Supabase schema and RLS policies
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  budget numeric(12, 2) not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.expenses (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  amount numeric(12, 2) not null check (amount > 0),
  category text not null,
  date date not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists expenses_user_id_idx on public.expenses (user_id);
create index if not exists expenses_user_id_date_idx on public.expenses (user_id, date desc);

alter table public.profiles enable row level security;
alter table public.expenses enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "expenses_select_own" on public.expenses;
create policy "expenses_select_own"
on public.expenses
for select
using (auth.uid() = user_id);

drop policy if exists "expenses_insert_own" on public.expenses;
create policy "expenses_insert_own"
on public.expenses
for insert
with check (auth.uid() = user_id);

drop policy if exists "expenses_update_own" on public.expenses;
create policy "expenses_update_own"
on public.expenses
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "expenses_delete_own" on public.expenses;
create policy "expenses_delete_own"
on public.expenses
for delete
using (auth.uid() = user_id);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_profiles_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, budget)
  values (new.id, 0)
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.auto_confirm_new_user_email()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at = timezone('utc', now());
  end if;

  return new;
end;
$$;

drop trigger if exists before_auth_user_created_auto_confirm on auth.users;
create trigger before_auth_user_created_auto_confirm
before insert on auth.users
for each row
execute procedure public.auto_confirm_new_user_email();

update auth.users
set email_confirmed_at = timezone('utc', now())
where email_confirmed_at is null
  and email is not null;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute procedure public.handle_new_user_profile();

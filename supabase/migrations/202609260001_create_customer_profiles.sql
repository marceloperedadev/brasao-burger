create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  phone text not null check (char_length(phone) between 10 and 11),
  address text not null default '',
  number text not null default '',
  complement text,
  neighborhood text not null default '',
  zip_code text not null default '',
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_profiles enable row level security;
revoke all on public.customer_profiles from public, anon;
grant select, insert, update on public.customer_profiles to authenticated;

drop policy if exists "Customers read own profile" on public.customer_profiles;
create policy "Customers read own profile"
  on public.customer_profiles for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Customers insert own profile" on public.customer_profiles;
create policy "Customers insert own profile"
  on public.customer_profiles for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Customers update own profile" on public.customer_profiles;
create policy "Customers update own profile"
  on public.customer_profiles for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

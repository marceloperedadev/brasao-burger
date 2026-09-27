alter table public.customer_profiles
  add column if not exists city text not null default '',
  add column if not exists state text not null default '';

alter table public.customer_profiles
  add constraint customer_profiles_state_format
  check (state = '' or state ~ '^[A-Z]{2}$');

create table if not exists public.delivery_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  flat_fee numeric(10, 2) not null check (flat_fee >= 0),
  service_city text not null,
  service_state text not null check (service_state ~ '^[A-Z]{2}$'),
  is_test_fee boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.delivery_settings enable row level security;
revoke all on public.delivery_settings from public, anon, authenticated;
grant select on public.delivery_settings to anon, authenticated;

drop policy if exists "Delivery settings are publicly readable" on public.delivery_settings;
create policy "Delivery settings are publicly readable"
  on public.delivery_settings for select to anon, authenticated
  using (true);

insert into public.delivery_settings (
  id, enabled, flat_fee, service_city, service_state, is_test_fee
) values (
  1, true, 7.00, 'Taubaté', 'SP', true
)
on conflict (id) do nothing;

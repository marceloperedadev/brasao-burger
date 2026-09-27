alter table public.delivery_settings
  add column if not exists minimum_fee numeric(10, 2) not null default 5.00
    check (minimum_fee >= 5.00),
  add column if not exists configuration_ready boolean not null default false;

-- Preserve migration 004's values while ensuring delivery stays unavailable
-- until real zones and rates have been configured.
update public.delivery_settings
set enabled = false,
    configuration_ready = false
where id = 1;

comment on column public.delivery_settings.flat_fee is
  'Legacy field retained for migration compatibility; zone fees are authoritative.';
comment on column public.delivery_settings.is_test_fee is
  'Legacy field retained for migration compatibility; zone fees are authoritative.';
revoke select on public.delivery_settings from anon, authenticated;
grant select (enabled, configuration_ready, minimum_fee, service_city, service_state)
  on public.delivery_settings to anon, authenticated;
grant select, insert, update, delete on public.delivery_settings to service_role;

create table if not exists public.delivery_zones (
  zone_key text primary key check (zone_key in ('very_near', 'near', 'medium', 'far', 'very_far')),
  name text not null,
  sort_order smallint not null unique check (sort_order between 1 and 5),
  criteria_type text not null default 'neighborhood' check (criteria_type = 'neighborhood'),
  neighborhoods text[] not null default '{}',
  fee numeric(10, 2) check (fee is null or fee >= 5.00),
  active boolean not null default false,
  updated_at timestamptz not null default now(),
  check (not active or (fee is not null and cardinality(neighborhoods) > 0))
);

alter table public.delivery_zones enable row level security;
revoke all on public.delivery_zones from public, anon, authenticated;
grant select (zone_key, name, sort_order, criteria_type, neighborhoods, fee, active)
  on public.delivery_zones to anon, authenticated;
grant all on public.delivery_zones to service_role;

drop policy if exists "Active delivery zones are publicly readable" on public.delivery_zones;
create policy "Active delivery zones are publicly readable"
  on public.delivery_zones for select to anon, authenticated
  using (active = true);

insert into public.delivery_zones (zone_key, name, sort_order)
values
  ('very_near', 'Muito perto', 1),
  ('near', 'Perto', 2),
  ('medium', 'Distância média', 3),
  ('far', 'Longe', 4),
  ('very_far', 'Muito longe', 5)
on conflict (zone_key) do nothing;

-- Extend the local zone model for future administration and routing support.
-- Distance-based zones remain unusable until a trusted route provider exists.
alter table public.delivery_zones
  add column if not exists description text,
  add column if not exists minimum_distance_km numeric(10, 2),
  add column if not exists maximum_distance_km numeric(10, 2),
  add column if not exists requires_manual_confirmation boolean not null default false;

alter table public.delivery_zones
  drop constraint if exists delivery_zones_criteria_type_check,
  add constraint delivery_zones_criteria_type_check
    check (criteria_type in ('neighborhood', 'distance'));

-- Replace the original active-zone check so both supported criteria can be
-- stored while still requiring a real fee and complete criterion boundaries.
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.delivery_zones'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%cardinality(neighborhoods)%'
  loop
    execute format('alter table public.delivery_zones drop constraint %I', constraint_record.conname);
  end loop;
end;
$$;

alter table public.delivery_zones
  add constraint delivery_zones_criteria_bounds_check check (
    (criteria_type = 'neighborhood'
      and minimum_distance_km is null
      and maximum_distance_km is null)
    or
    (criteria_type = 'distance'
      and cardinality(neighborhoods) = 0
      and minimum_distance_km is not null
      and minimum_distance_km >= 0
      and maximum_distance_km is not null
      and maximum_distance_km > minimum_distance_km)
  ),
  add constraint delivery_zones_active_configuration_check check (
    not active or (fee is not null and (
      (criteria_type = 'neighborhood' and cardinality(neighborhoods) > 0)
      or criteria_type = 'distance'
    ))
  );

grant select (zone_key, name, sort_order, description, criteria_type, neighborhoods,
  fee, active, requires_manual_confirmation)
  on public.delivery_zones to anon, authenticated;
grant select, insert, update, delete on public.delivery_zones to service_role;

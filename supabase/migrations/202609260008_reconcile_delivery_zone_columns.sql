-- Reconcile delivery-zone columns without repeating migration 006's
-- constraint replacement logic. Existing constraints are intentionally left
-- untouched because their remote definitions have not been inspected.
alter table public.delivery_zones
  add column if not exists description text,
  add column if not exists minimum_distance_km numeric(10, 2),
  add column if not exists maximum_distance_km numeric(10, 2),
  add column if not exists requires_manual_confirmation boolean not null default false;

-- Public checkout reads only these zone fields. Distance boundaries remain
-- server-side and are not selected by the current checkout endpoint.
grant select (
  zone_key,
  name,
  sort_order,
  description,
  criteria_type,
  neighborhoods,
  fee,
  active,
  requires_manual_confirmation
)
on public.delivery_zones to anon, authenticated;

-- Enforce the delivery minimum in the database, including calls that bypass
-- the Next.js order API. Pickup remains explicitly free.
-- NOT VALID avoids blocking deployment on historical rows; PostgreSQL still
-- enforces this constraint for every new or updated row.
alter table public.orders
  add constraint orders_delivery_fee_minimum_check
  check (
    (delivery_method = 'pickup' and delivery_fee = 0)
    or (delivery_method = 'delivery' and delivery_fee >= 5.00)
  ) not valid;

comment on constraint orders_delivery_fee_minimum_check on public.orders is
  'New pickup orders must have zero fee; new delivery orders must meet the R$ 5.00 minimum.';

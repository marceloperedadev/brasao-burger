-- Brasao Burger admin setup for Supabase SQL Editor.
-- Review the project ref and run only after the prerequisite migrations listed
-- in README.md and the externally managed catalog tables are confirmed.
-- This script does not create catalog tables, delete rows, or delete objects.

begin;

do $$
declare
  missing_columns text[];
begin
  if to_regclass('public.orders') is null
    or to_regclass('public.order_items') is null
    or to_regclass('public.customer_profiles') is null
    or to_regclass('public.categories') is null
    or to_regclass('public.products') is null then
    raise exception 'Admin setup stopped: orders, order_items, customer_profiles, categories, and products must already exist.';
  end if;

  if to_regclass('storage.buckets') is null then
    raise exception 'Admin setup stopped: Supabase Storage is unavailable in this project.';
  end if;

  select array_agg(format('%I.%I', required.table_name, required.column_name) order by required.table_name, required.column_name)
  into missing_columns
  from (values
    ('orders', 'id'), ('orders', 'created_at'), ('orders', 'customer_name'),
    ('orders', 'customer_phone'), ('orders', 'delivery_method'), ('orders', 'payment_method'),
    ('orders', 'status'), ('orders', 'subtotal'), ('orders', 'delivery_fee'), ('orders', 'total'),
    ('order_items', 'id'), ('order_items', 'order_id'), ('order_items', 'product_id'),
    ('order_items', 'product_name'), ('order_items', 'quantity'), ('order_items', 'unit_price'), ('order_items', 'line_total'),
    ('customer_profiles', 'user_id'), ('customer_profiles', 'name'), ('customer_profiles', 'phone'),
    ('customer_profiles', 'address'), ('customer_profiles', 'number'), ('customer_profiles', 'complement'),
    ('customer_profiles', 'neighborhood'), ('customer_profiles', 'zip_code'), ('customer_profiles', 'city'),
    ('customer_profiles', 'state'), ('customer_profiles', 'reference'), ('customer_profiles', 'created_at'),
    ('categories', 'id'), ('categories', 'name'), ('categories', 'slug'), ('categories', 'sort_order'), ('categories', 'active'),
    ('products', 'id'), ('products', 'category_id'), ('products', 'name'), ('products', 'description'),
    ('products', 'price'), ('products', 'image_url'), ('products', 'featured'), ('products', 'available'), ('products', 'sort_order')
  ) as required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns as existing
    where existing.table_schema = 'public'
      and existing.table_name = required.table_name
      and existing.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'Admin setup stopped: required columns are missing: %', array_to_string(missing_columns, ', ');
  end if;
end;
$$;

alter table public.orders
  add column if not exists payment_status text not null default 'pending';

do $$
declare
  constraint_definition text;
begin
  select pg_get_constraintdef(oid)
  into constraint_definition
  from pg_constraint
  where conrelid = 'public.orders'::regclass
    and conname = 'orders_payment_status_check';

  if constraint_definition is null then
    alter table public.orders
      add constraint orders_payment_status_check
      check (payment_status in ('pending', 'confirmed', 'cancelled', 'refunded'));
  elsif position('pending' in constraint_definition) = 0
    or position('confirmed' in constraint_definition) = 0
    or position('cancelled' in constraint_definition) = 0
    or position('refunded' in constraint_definition) = 0 then
    raise exception 'Admin setup stopped: existing orders_payment_status_check differs from the supported manual-payment states.';
  end if;
end;
$$;

comment on column public.orders.payment_status is
  'Manual payment state. Orders start pending; the application does not confirm payment automatically.';

create index if not exists orders_payment_method_created_at_idx
  on public.orders (payment_method, created_at desc);

grant select, update on public.orders to service_role;
grant select on public.order_items to service_role;
grant select on public.customer_profiles to service_role;
grant select, insert, update on public.categories, public.products to service_role;

do $$
declare
  sequence_name text;
begin
  sequence_name := pg_get_serial_sequence('public.categories', 'id');
  if sequence_name is not null then
    execute format('grant usage, select on sequence %s to service_role', sequence_name);
  end if;

  sequence_name := pg_get_serial_sequence('public.products', 'id');
  if sequence_name is not null then
    execute format('grant usage, select on sequence %s to service_role', sequence_name);
  end if;
end;
$$;

do $$
declare
  bucket_public boolean;
  bucket_file_size_limit bigint;
  bucket_allowed_mime_types text[];
begin
  select bucket.public, bucket.file_size_limit, bucket.allowed_mime_types
  into bucket_public, bucket_file_size_limit, bucket_allowed_mime_types
  from storage.buckets as bucket
  where bucket.id = 'product-images';

  if not found then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('product-images', 'product-images', true, 3145728, array['image/webp']::text[]);
  else
    if bucket_public is distinct from true then
      raise exception 'Admin setup stopped: product-images already exists as private. Review public storefront access before changing it.';
    end if;
    if bucket_file_size_limit is not null and bucket_file_size_limit < 3145728 then
      raise exception 'Admin setup stopped: product-images has a file-size limit below 3 MB.';
    end if;
    if bucket_allowed_mime_types is not null and not ('image/webp' = any(bucket_allowed_mime_types)) then
      raise exception 'Admin setup stopped: product-images does not allow image/webp.';
    end if;
  end if;
end;
$$;

commit;
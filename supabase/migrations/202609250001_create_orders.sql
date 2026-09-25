create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  delivery_method text not null check (delivery_method in ('delivery', 'pickup')),
  address text,
  address_number text,
  complement text,
  neighborhood text,
  zip_code text,
  reference text,
  payment_method text not null check (payment_method in ('pix', 'cash', 'card')),
  change_for numeric(12, 2),
  status text not null default 'pending',
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  delivery_fee numeric(12, 2) not null check (delivery_fee >= 0),
  total numeric(12, 2) not null check (total = subtotal + delivery_fee),
  created_at timestamptz not null default now(),
  check (delivery_method <> 'pickup' or delivery_fee = 0),
  check (
    delivery_method <> 'delivery' or
    (address is not null and address_number is not null and neighborhood is not null and zip_code is not null)
  )
);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id bigint not null,
  product_name text not null,
  quantity integer not null check (quantity between 1 and 999),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(12, 2) not null check (line_total = round(quantity * unit_price, 2))
);

create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_user_id_idx on public.orders(user_id) where user_id is not null;
create index if not exists order_items_order_id_idx on public.order_items(order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
revoke all on public.orders, public.order_items from public, anon, authenticated;
grant all on public.orders, public.order_items to service_role;

create or replace function public.create_order_atomic(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_order_id uuid;
  v_idempotency_key uuid;
  v_method text;
  v_payment_method text;
  v_delivery_fee numeric(12, 2);
  v_change_for numeric(12, 2);
  v_subtotal_cents bigint := 0;
  v_total_cents bigint;
  v_input_item jsonb;
  v_product_id bigint;
  v_quantity integer;
  v_product record;
  v_unit_cents bigint;
  v_line_cents bigint;
  v_resolved_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_result jsonb;
begin
  if jsonb_typeof(p_order) <> 'object' or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_ORDER' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'INVALID_ITEM_COUNT' using errcode = '22023';
  end if;

  v_idempotency_key := (p_order->>'idempotencyKey')::uuid;
  select id into v_order_id
    from public.orders
    where idempotency_key = v_idempotency_key;

  if v_order_id is not null then
    if not exists (
      select 1
      from public.orders o
      where o.id = v_order_id
        and o.user_id is not distinct from nullif(p_order->>'userId', '')::uuid
        and o.customer_name = p_order->>'name'
        and o.customer_phone = p_order->>'phone'
        and o.delivery_method = p_order->>'deliveryMethod'
        and o.address is not distinct from nullif(p_order->>'address', '')
        and o.address_number is not distinct from nullif(p_order->>'number', '')
        and o.complement is not distinct from nullif(p_order->>'complement', '')
        and o.neighborhood is not distinct from nullif(p_order->>'neighborhood', '')
        and o.zip_code is not distinct from nullif(p_order->>'zipCode', '')
        and o.reference is not distinct from nullif(p_order->>'reference', '')
        and o.payment_method = p_order->>'paymentMethod'
        and o.change_for is not distinct from nullif(p_order->>'changeFor', '')::numeric
        and o.delivery_fee = round((p_order->>'deliveryFee')::numeric, 2)
        and coalesce((
          select jsonb_agg(jsonb_build_object(
            'productId', (item->>'productId')::bigint,
            'quantity', (item->>'quantity')::integer
          ) order by ordinal)
          from jsonb_array_elements(p_items) with ordinality as request_items(item, ordinal)
        ), '[]'::jsonb) = coalesce((
          select jsonb_agg(jsonb_build_object(
            'productId', i.product_id,
            'quantity', i.quantity
          ) order by i.id)
          from public.order_items i
          where i.order_id = o.id
        ), '[]'::jsonb)
    ) then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;

    select jsonb_build_object(
      'id', o.id,
      'userId', o.user_id,
      'name', o.customer_name,
      'phone', o.customer_phone,
      'deliveryMethod', o.delivery_method,
      'address', o.address,
      'number', o.address_number,
      'complement', o.complement,
      'neighborhood', o.neighborhood,
      'zipCode', o.zip_code,
      'reference', o.reference,
      'paymentMethod', o.payment_method,
      'changeFor', o.change_for,
      'status', o.status,
      'subtotal', o.subtotal,
      'deliveryFee', o.delivery_fee,
      'total', o.total,
      'createdAt', o.created_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'productId', i.product_id,
          'name', i.product_name,
          'quantity', i.quantity,
          'unitPrice', i.unit_price,
          'lineTotal', i.line_total
        ) order by i.id)
        from public.order_items i
        where i.order_id = o.id
      ), '[]'::jsonb)
    ) into v_result
    from public.orders o
    where o.id = v_order_id;
    return v_result;
  end if;

  v_method := p_order->>'deliveryMethod';
  v_payment_method := p_order->>'paymentMethod';
  v_delivery_fee := round((p_order->>'deliveryFee')::numeric, 2);
  v_change_for := nullif(p_order->>'changeFor', '')::numeric;
  if v_method is null or v_method not in ('delivery', 'pickup') or v_delivery_fee is null or v_delivery_fee < 0 then
    raise exception 'INVALID_DELIVERY' using errcode = '22023';
  end if;
  if v_payment_method is null or v_payment_method not in ('pix', 'cash', 'card') then
    raise exception 'INVALID_PAYMENT' using errcode = '22023';
  end if;
  if v_method = 'pickup' and v_delivery_fee <> 0 then
    raise exception 'INVALID_PICKUP_FEE' using errcode = '22023';
  end if;

  for v_input_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_input_item->>'productId')::bigint;
    v_quantity := (v_input_item->>'quantity')::integer;
    if v_product_id <= 0 or v_quantity < 1 or v_quantity > 999 then
      raise exception 'INVALID_ITEM' using errcode = '22023';
    end if;

    select id, name, price, available
      into v_product
      from public.products
      where id = v_product_id
      for share;

    if not found or v_product.available is distinct from true then
      raise exception 'PRODUCT_UNAVAILABLE' using errcode = 'P0001';
    end if;
    if v_product.price is null or v_product.price < 0 then
      raise exception 'INVALID_PRODUCT_PRICE' using errcode = 'P0001';
    end if;

    v_unit_cents := round(v_product.price * 100)::bigint;
    v_line_cents := v_unit_cents * v_quantity;
    v_subtotal_cents := v_subtotal_cents + v_line_cents;
    v_resolved_items := v_resolved_items || jsonb_build_array(jsonb_build_object(
      'productId', v_product.id,
      'name', v_product.name,
      'quantity', v_quantity,
      'unitPrice', v_unit_cents::numeric / 100,
      'lineTotal', v_line_cents::numeric / 100
    ));
  end loop;

  v_total_cents := v_subtotal_cents + round(v_delivery_fee * 100)::bigint;
  if v_change_for is not null and (v_payment_method <> 'cash' or round(v_change_for * 100)::bigint <= v_total_cents) then
    raise exception 'INVALID_CHANGE_FOR' using errcode = '22023';
  end if;

  insert into public.orders (
    idempotency_key, user_id, customer_name, customer_phone,
    delivery_method, address, address_number, complement, neighborhood,
    zip_code, reference, payment_method, change_for, status,
    subtotal, delivery_fee, total
  ) values (
    v_idempotency_key,
    nullif(p_order->>'userId', '')::uuid,
    p_order->>'name',
    p_order->>'phone',
    v_method,
    nullif(p_order->>'address', ''),
    nullif(p_order->>'number', ''),
    nullif(p_order->>'complement', ''),
    nullif(p_order->>'neighborhood', ''),
    nullif(p_order->>'zipCode', ''),
    nullif(p_order->>'reference', ''),
    v_payment_method,
    v_change_for,
    'pending',
    v_subtotal_cents::numeric / 100,
    v_delivery_fee,
    v_total_cents::numeric / 100
  )
  on conflict (idempotency_key) do nothing
  returning id into v_order_id;

  if v_order_id is not null then
    for v_item in select value from jsonb_array_elements(v_resolved_items)
    loop
      insert into public.order_items (
        order_id, product_id, product_name, quantity, unit_price, line_total
      ) values (
        v_order_id,
        (v_item->>'productId')::bigint,
        v_item->>'name',
        (v_item->>'quantity')::integer,
        (v_item->>'unitPrice')::numeric,
        (v_item->>'lineTotal')::numeric
      );
    end loop;
  else
    select id into v_order_id
      from public.orders
      where idempotency_key = v_idempotency_key;
  end if;

  select jsonb_build_object(
    'id', o.id,
    'userId', o.user_id,
    'name', o.customer_name,
    'phone', o.customer_phone,
    'deliveryMethod', o.delivery_method,
    'address', o.address,
    'number', o.address_number,
    'complement', o.complement,
    'neighborhood', o.neighborhood,
    'zipCode', o.zip_code,
    'reference', o.reference,
    'paymentMethod', o.payment_method,
    'changeFor', o.change_for,
    'status', o.status,
    'subtotal', o.subtotal,
    'deliveryFee', o.delivery_fee,
    'total', o.total,
    'createdAt', o.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'productId', i.product_id,
        'name', i.product_name,
        'quantity', i.quantity,
        'unitPrice', i.unit_price,
        'lineTotal', i.line_total
      ) order by i.id)
      from public.order_items i
      where i.order_id = o.id
    ), '[]'::jsonb)
  ) into v_result
  from public.orders o
  where o.id = v_order_id;

  return v_result;
end;
$$;

revoke all on function public.create_order_atomic(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_atomic(jsonb, jsonb) to service_role;

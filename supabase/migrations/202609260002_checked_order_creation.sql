-- Add an atomic checkout guard without modifying the original order migration.
-- Apply this migration after 202609250001_create_orders.sql.
create or replace function public.create_order_atomic_checked(
  p_order jsonb,
  p_items jsonb,
  p_expected_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_idempotency_key uuid;
  v_expected jsonb;
  v_product record;
  v_expected_cents bigint;
  v_expected_ordinal bigint;
  v_item jsonb;
  v_changed jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_order) is distinct from 'object'
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_typeof(p_expected_items) is distinct from 'array' then
    raise exception 'INVALID_ORDER' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100
    or jsonb_array_length(p_expected_items) <> jsonb_array_length(p_items) then
    raise exception 'INVALID_ITEM_COUNT' using errcode = '22023';
  end if;

  for v_expected, v_expected_ordinal in
    select value, ordinal
    from jsonb_array_elements(p_expected_items) with ordinality as expected_items(value, ordinal)
  loop
    if jsonb_typeof(v_expected) <> 'object'
      or coalesce((v_expected->>'productId') ~ '^[1-9][0-9]*$', false) is not true
      or coalesce((v_expected->>'expectedUnitPriceCents') ~ '^(0|[1-9][0-9]*)$', false) is not true then
      raise exception 'INVALID_EXPECTED_ITEMS' using errcode = '22023';
    end if;

    select value into v_item
    from jsonb_array_elements(p_items) with ordinality as requested_items(value, ordinal)
    where ordinal = v_expected_ordinal;

    if jsonb_typeof(v_item) <> 'object'
      or coalesce((v_item->>'productId') ~ '^[1-9][0-9]*$', false) is not true
      or (v_expected->>'productId')::bigint is distinct from (v_item->>'productId')::bigint then
      raise exception 'INVALID_EXPECTED_ITEMS' using errcode = '22023';
    end if;
  end loop;

  v_idempotency_key := (p_order->>'idempotencyKey')::uuid;
  -- Serialize requests sharing a key, including the ON CONFLICT path in the
  -- original function, so its payload comparison always sees the committed row.
  perform pg_advisory_xact_lock(hashtextextended(v_idempotency_key::text, 0));

  -- Let the original function validate and return a completed retry before
  -- checking today's catalog. A legitimate retry must remain idempotent even
  -- if product data changed after the original order was saved.
  if exists (select 1 from public.orders where idempotency_key = v_idempotency_key) then
    if exists (
      select 1
      from jsonb_array_elements(p_expected_items) with ordinality as expected_items(item, ordinal)
      full join (
        select
          order_items.product_id,
          round(order_items.unit_price * 100)::bigint as unit_price_cents,
          row_number() over (order by order_items.id) as ordinal
        from public.order_items
        where public.order_items.order_id = (
          select orders.id
          from public.orders
          where orders.idempotency_key = v_idempotency_key
        )
      ) as saved_items using (ordinal)
      where expected_items.item is null
        or saved_items.product_id is null
        or (expected_items.item->>'productId')::bigint is distinct from saved_items.product_id
        or (expected_items.item->>'expectedUnitPriceCents')::bigint is distinct from saved_items.unit_price_cents
    ) then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;

    return jsonb_build_object(
      'staleCatalog', false,
      'order', public.create_order_atomic(p_order, p_items)
    );
  end if;

  for v_expected in select value from jsonb_array_elements(p_expected_items)
  loop
    v_expected_cents := (v_expected->>'expectedUnitPriceCents')::bigint;

    select
      p.id, p.category_id, p.name, p.description, p.price, p.image_url,
      p.featured, p.available, p.sort_order, c.active as category_active
      into v_product
      from public.products as p
      join public.categories as c on c.id = p.category_id
      where p.id = (v_expected->>'productId')::bigint
      for share of p, c;

    if not found then
      v_changed := v_changed || jsonb_build_array(jsonb_build_object(
        'id', (v_expected->>'productId')::bigint,
        'available', false
      ));
    elsif v_product.available is distinct from true
      or v_product.category_active is distinct from true
      or round(v_product.price * 100)::bigint is distinct from v_expected_cents then
      v_changed := v_changed || jsonb_build_array(
        (to_jsonb(v_product) - 'category_active') || jsonb_build_object(
          'available', v_product.available is true and v_product.category_active is true
        )
      );
    end if;
  end loop;

  if jsonb_array_length(v_changed) > 0 then
    return jsonb_build_object('staleCatalog', true, 'products', v_changed);
  end if;

  return jsonb_build_object(
    'staleCatalog', false,
    'order', public.create_order_atomic(p_order, p_items)
  );
end;
$$;

revoke all on function public.create_order_atomic_checked(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_atomic_checked(jsonb, jsonb, jsonb) to service_role;
revoke execute on function public.create_order_atomic(jsonb, jsonb) from service_role;

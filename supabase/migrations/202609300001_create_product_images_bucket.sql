-- Product images are publicly readable by the storefront but writable only
-- through the server-side admin API using the service role.
-- Existing buckets and objects are left untouched.
-- The browser-facing catalog schema is managed outside this repository; give
-- the server-side service role only the operations the admin APIs need.
grant select, insert, update on public.categories, public.products to service_role;
grant select on public.customer_profiles to service_role;

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
      raise exception 'product-images already exists as private; review storefront access before changing it.';
    end if;
    if bucket_file_size_limit is not null and bucket_file_size_limit < 3145728 then
      raise exception 'product-images has a file-size limit below 3 MB.';
    end if;
    if bucket_allowed_mime_types is not null and not ('image/webp' = any(bucket_allowed_mime_types)) then
      raise exception 'product-images does not allow image/webp.';
    end if;
  end if;
end;
$$;
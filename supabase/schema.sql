-- ShagunWala database schema. Run this whole file in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  category text not null check (char_length(trim(category)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 1500),
  price numeric(12,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  unit text not null default 'piece' check (char_length(unit) between 1 and 20),
  image_url text not null default '',
  video_url text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  idempotency_key uuid not null unique,
  customer_name text not null check (char_length(trim(customer_name)) between 2 and 100),
  customer_phone text not null,
  address text not null check (char_length(trim(address)) between 10 and 800),
  total numeric(12,2) not null check (total >= 0),
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation','confirmed','cancelled','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  unit text not null,
  quantity integer not null check (quantity > 0 and quantity <= 99),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create index if not exists products_active_category_idx on public.products(active, category);
create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists orders_status_created_idx on public.orders(status, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at before update on public.products for each row execute function public.touch_updated_at();
drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at before update on public.orders for each row execute function public.touch_updated_at();

alter table public.products enable row level security;
alter table public.admin_users enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select on public.admin_users to anon, authenticated;
grant select on public.orders, public.order_items to authenticated;

-- Public users can only read active products. Admins can read all products and make changes.
drop policy if exists "active products are public" on public.products;
create policy "active products are public" on public.products for select to anon, authenticated
using (active = true or exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));
drop policy if exists "admins insert products" on public.products;
create policy "admins insert products" on public.products for insert to authenticated
with check (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));
drop policy if exists "admins update products" on public.products;
create policy "admins update products" on public.products for update to authenticated
using (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));
drop policy if exists "admins delete products" on public.products;
create policy "admins delete products" on public.products for delete to authenticated
using (exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));

drop policy if exists "users can see own admin flag" on public.admin_users;
create policy "users can see own admin flag" on public.admin_users for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "customers and admins view orders" on public.orders;
create policy "customers and admins view orders" on public.orders for select to authenticated
using (user_id = (select auth.uid()) or exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));
drop policy if exists "customers and admins view order items" on public.order_items;
create policy "customers and admins view order items" on public.order_items for select to authenticated
using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  or exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);
-- No direct customer insert/update/delete policies for orders or items. Orders are created by a checked RPC.

create or replace function public.create_customer_order(
  p_customer_name text,
  p_address text,
  p_items jsonb,
  p_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_phone_confirmed_at timestamptz;
  v_existing uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_order_id uuid;
  v_product_id uuid;
  v_qty integer;
  v_total numeric(12,2) := 0;
  v_count integer;
begin
  if v_uid is null then raise exception 'Please verify your mobile number first.'; end if;
  select phone, phone_confirmed_at into v_phone, v_phone_confirmed_at from auth.users where id = v_uid;
  if v_phone is null or v_phone_confirmed_at is null then raise exception 'A verified phone OTP is required.'; end if;
  if p_idempotency_key is null then raise exception 'Order request key is required.'; end if;
  if char_length(trim(coalesce(p_customer_name,''))) < 2 or char_length(trim(p_customer_name)) > 100 then raise exception 'Please enter a valid customer name.'; end if;
  if char_length(trim(coalesce(p_address,''))) < 10 or char_length(trim(p_address)) > 800 then raise exception 'Please enter a complete delivery address.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then raise exception 'Your cart must contain between 1 and 20 product types.'; end if;

  -- Serialize attempts by verified user and limit order spam even when requests are concurrent.
  perform pg_advisory_xact_lock(hashtext(v_uid::text)::bigint);
  select id into v_existing from public.orders where idempotency_key = p_idempotency_key and user_id = v_uid;
  if v_existing is not null then return v_existing; end if;
  select count(*) into v_count from public.orders where user_id = v_uid and created_at > now() - interval '10 minutes';
  if v_count >= 3 then raise exception 'Too many order attempts. Please wait a few minutes and try again.'; end if;

  if (select count(distinct value->>'product_id') from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) then
    raise exception 'Duplicate products are not allowed in one cart.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 99 then raise exception 'Invalid product quantity.'; end if;
    select * into v_product from public.products where id = v_product_id and active = true for update;
    if not found then raise exception 'A product in your cart is no longer available.'; end if;
    if v_product.stock < v_qty then raise exception 'Not enough stock for %.', v_product.name; end if;
    v_total := v_total + (v_product.price * v_qty);
  end loop;

  insert into public.orders(user_id, idempotency_key, customer_name, customer_phone, address, total, status)
  values (v_uid, p_idempotency_key, trim(p_customer_name), v_phone, trim(p_address), v_total, 'pending_confirmation')
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id = v_product_id and active = true;
    insert into public.order_items(order_id, product_id, product_name, unit, quantity, unit_price, line_total)
    values (v_order_id, v_product.id, v_product.name, v_product.unit, v_qty, v_product.price, v_product.price * v_qty);
  end loop;
  return v_order_id;
end;
$$;

create or replace function public.admin_set_order_status(p_order_id uuid, p_status text)
returns uuid
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_product public.products%rowtype;
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'Admin access required.';
  end if;
  if p_status not in ('confirmed','cancelled','rejected') then raise exception 'Unsupported status.'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if v_order.status = p_status then return v_order.id; end if;

  if p_status = 'confirmed' then
    if v_order.status <> 'pending_confirmation' then raise exception 'Only pending orders can be confirmed.'; end if;
    -- Lock and validate every product first; only then decrement stock.
    for v_item in select product_id, quantity, product_name from public.order_items where order_id = v_order.id order by product_id loop
      select * into v_product from public.products where id = v_item.product_id for update;
      if not found then raise exception 'Product % was removed. Edit the catalogue before confirming this order.', v_item.product_name; end if;
      if v_product.stock < v_item.quantity then raise exception 'Insufficient stock for %.', v_product.name; end if;
    end loop;
    for v_item in select product_id, quantity from public.order_items where order_id = v_order.id loop
      update public.products set stock = stock - v_item.quantity where id = v_item.product_id;
    end loop;
  elsif p_status = 'cancelled' then
    if v_order.status not in ('pending_confirmation','confirmed') then raise exception 'This order cannot be cancelled from its current status.'; end if;
    if v_order.status = 'confirmed' then
      for v_item in select product_id, quantity from public.order_items where order_id = v_order.id loop
        update public.products set stock = stock + v_item.quantity where id = v_item.product_id;
      end loop;
    end if;
  elsif p_status = 'rejected' and v_order.status <> 'pending_confirmation' then
    raise exception 'Only pending orders can be rejected.';
  end if;
  update public.orders set status = p_status where id = v_order.id;
  return v_order.id;
end;
$$;

revoke all on function public.create_customer_order(text,text,jsonb,uuid) from public, anon;
grant execute on function public.create_customer_order(text,text,jsonb,uuid) to authenticated;
revoke all on function public.admin_set_order_status(uuid,text) from public, anon;
grant execute on function public.admin_set_order_status(uuid,text) to authenticated;

-- Product images and videos: public can view them; only admins can upload/delete.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('product-media','product-media',true,4194304,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=true, file_size_limit=4194304, allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif'];
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('product-videos','product-videos',true,26214400,array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public=true, file_size_limit=26214400, allowed_mime_types=array['video/mp4','video/webm','video/quicktime'];

drop policy if exists "public can view product media" on storage.objects;
create policy "public can view product media" on storage.objects for select to anon, authenticated
using (bucket_id in ('product-media','product-videos'));
drop policy if exists "admins upload product media" on storage.objects;
create policy "admins upload product media" on storage.objects for insert to authenticated
with check (bucket_id in ('product-media','product-videos') and exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));
drop policy if exists "admins update product media" on storage.objects;
create policy "admins update product media" on storage.objects for update to authenticated
using (bucket_id in ('product-media','product-videos') and exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())))
with check (bucket_id in ('product-media','product-videos') and exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));
drop policy if exists "admins delete product media" on storage.objects;
create policy "admins delete product media" on storage.objects for delete to authenticated
using (bucket_id in ('product-media','product-videos') and exists (select 1 from public.admin_users au where au.user_id = (select auth.uid())));

-- Add your initial products via the Admin panel after creating an admin account.
-- After creating an Auth user, grant admin rights using:
-- insert into public.admin_users(user_id) select id from auth.users where email = 'YOUR_ADMIN_EMAIL' on conflict do nothing;

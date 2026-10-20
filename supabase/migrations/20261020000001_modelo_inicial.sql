-- Modelo de datos inicial (docs/SPEC.md, "Modelo de datos (núcleo)").
-- Catálogo y precios: lectura pública, escritura solo con la clave de servicio (sin políticas de escritura).
-- Datos de usuario: Row Level Security por household_id.

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.unit_kind as enum ('g', 'ml', 'unit');
create type public.equivalence_level as enum ('identical', 'equivalent', 'generic');
create type public.match_source as enum ('rule', 'model', 'human');
create type public.menu_mode as enum ('ahorro', 'variedad', 'aprovechamiento');
create type public.recipe_visibility as enum ('private', 'household', 'public');

-- ---------------------------------------------------------------------------
-- Catálogo y precios
-- ---------------------------------------------------------------------------
create table public.chain (
  id smallint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  website_url text not null
);

create table public.price_zone (
  id bigint generated always as identity primary key,
  chain_id smallint not null references public.chain (id),
  external_ref text not null,
  name text,
  unique (chain_id, external_ref)
);

create table public.postal_code_zone (
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  chain_id smallint not null references public.chain (id),
  price_zone_id bigint not null references public.price_zone (id),
  primary key (postal_code, chain_id)
);

create table public.category (
  id bigint generated always as identity primary key,
  parent_id bigint references public.category (id),
  name text not null,
  slug text not null unique,
  -- Sección del supermercado para agrupar la lista en el modo tienda.
  aisle text
);

create table public.product_chain (
  id bigint generated always as identity primary key,
  chain_id smallint not null references public.chain (id),
  external_id text not null,
  name text not null,
  brand text,
  quantity numeric(12, 3),
  unit public.unit_kind,
  units_per_pack integer not null default 1 check (units_per_pack > 0),
  ean text,
  category_ref text,
  url text not null,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (chain_id, external_id)
);
create index product_chain_ean_idx on public.product_chain (ean) where ean is not null;
create index product_chain_name_trgm_idx on public.product_chain using gin (name extensions.gin_trgm_ops);

create table public.product_canonical (
  id bigint generated always as identity primary key,
  category_id bigint not null references public.category (id),
  name text not null,
  attributes jsonb not null default '{}'::jsonb,
  unique (category_id, name)
);
create index product_canonical_name_trgm_idx on public.product_canonical using gin (name extensions.gin_trgm_ops);

create table public.equivalence (
  product_chain_id bigint not null references public.product_chain (id) on delete cascade,
  product_canonical_id bigint not null references public.product_canonical (id) on delete cascade,
  level public.equivalence_level not null,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  source public.match_source not null,
  updated_at timestamptz not null default now(),
  primary key (product_chain_id, product_canonical_id)
);
create index equivalence_canonical_idx on public.equivalence (product_canonical_id, level);

-- Histórico por intervalos: fila nueva solo cuando cambia el precio o la promoción.
-- checked_at es la última captura que confirmó el precio; es la fecha que ve el usuario.
create table public.price (
  id bigint generated always as identity primary key,
  product_chain_id bigint not null references public.product_chain (id) on delete cascade,
  price_zone_id bigint not null references public.price_zone (id),
  price numeric(10, 2) not null check (price >= 0),
  unit_price numeric(12, 4),
  promo jsonb,
  source text not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  checked_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create unique index price_current_uidx on public.price (product_chain_id, price_zone_id) where valid_to is null;
create index price_zone_current_idx on public.price (price_zone_id) where valid_to is null;

-- ---------------------------------------------------------------------------
-- Usuario y hogar
-- ---------------------------------------------------------------------------
create table public.household (
  id uuid primary key default gen_random_uuid(),
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  members smallint not null default 1 check (members between 1 and 20),
  weekly_budget numeric(8, 2) check (weekly_budget is null or weekly_budget > 0),
  -- Cadenas que el hogar tiene cerca (primer uso).
  chain_ids smallint[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.profile (
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.household (id) on delete cascade,
  diet jsonb not null default '[]'::jsonb,
  allergens jsonb not null default '[]'::jsonb,
  disliked jsonb not null default '[]'::jsonb
);
create index profile_household_idx on public.profile (household_id);

create table public.shopping_list (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  name text not null,
  -- Cadena elegida para el modo tienda, si ya se eligió.
  chain_id smallint references public.chain (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shopping_list_household_idx on public.shopping_list (household_id);

create table public.list_item (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_list (id) on delete cascade,
  raw_text text not null,
  product_canonical_id bigint references public.product_canonical (id),
  quantity numeric(10, 3),
  unit public.unit_kind,
  equivalence_level public.equivalence_level not null default 'equivalent',
  preferred_brand text,
  checked boolean not null default false,
  position integer not null default 0
);
create index list_item_list_idx on public.list_item (list_id);

-- ---------------------------------------------------------------------------
-- Platos y menú
-- ---------------------------------------------------------------------------
create table public.ingredient (
  id bigint generated always as identity primary key,
  name text not null unique,
  product_canonical_id bigint references public.product_canonical (id),
  default_unit public.unit_kind not null,
  density_g_ml numeric(6, 3),
  unit_weight_g numeric(8, 2),
  allergens text[] not null default '{}',
  -- Etiquetas de dieta que el ingrediente rompe (p. ej. 'vegetariana', 'vegana', 'sin_gluten').
  not_suitable_for text[] not null default '{}'
);
create index ingredient_name_trgm_idx on public.ingredient using gin (name extensions.gin_trgm_ops);

create table public.recipe (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  title text not null,
  servings smallint not null check (servings between 1 and 50),
  minutes smallint check (minutes is null or minutes > 0),
  steps jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  source_url text,
  visibility public.recipe_visibility not null default 'household',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipe_household_idx on public.recipe (household_id);

create table public.recipe_ingredient (
  recipe_id uuid not null references public.recipe (id) on delete cascade,
  ingredient_id bigint not null references public.ingredient (id),
  quantity numeric(10, 3) not null check (quantity > 0),
  unit public.unit_kind not null,
  optional boolean not null default false,
  raw_text text,
  primary key (recipe_id, ingredient_id)
);

create table public.meal_plan (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  week_start date not null,
  budget numeric(8, 2),
  people smallint not null check (people between 1 and 20),
  optimized_for public.menu_mode not null,
  created_at timestamptz not null default now()
);
create index meal_plan_household_idx on public.meal_plan (household_id);

create table public.meal_plan_slot (
  meal_plan_id uuid not null references public.meal_plan (id) on delete cascade,
  day smallint not null check (day between 0 and 6),
  meal text not null check (meal in ('desayuno', 'comida', 'cena')),
  recipe_id uuid references public.recipe (id) on delete set null,
  servings smallint not null check (servings between 1 and 50),
  locked boolean not null default false,
  primary key (meal_plan_id, day, meal)
);

-- Despensa: manual en el MVP; alimentada por tickets en v2 (F7).
create table public.pantry_item (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  ingredient_id bigint not null references public.ingredient (id),
  quantity numeric(10, 3) not null check (quantity >= 0),
  unit public.unit_kind not null,
  best_before date
);
create index pantry_item_household_idx on public.pantry_item (household_id);

-- v2 (F7). Se crea ahora para no romper el modelo más adelante.
create table public.receipt (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  chain_id smallint references public.chain (id),
  store_ref text,
  purchased_at timestamptz,
  image_path text,
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed'))
);
create index receipt_household_idx on public.receipt (household_id);

-- Precios vistos en tienda (modo tienda en el MVP, tickets en v2).
create table public.price_observation (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  product_chain_id bigint not null references public.product_chain (id),
  price numeric(10, 2) not null check (price >= 0),
  observed_at timestamptz not null default now(),
  source text not null check (source in ('store_mode', 'receipt'))
);
create index price_observation_product_idx on public.price_observation (product_chain_id, observed_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Hogares del usuario actual. security definer para no recursar sobre la política de profile.
create function public.my_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.household_id from public.profile p where p.user_id = (select auth.uid());
$$;
revoke all on function public.my_household_ids() from public;
grant execute on function public.my_household_ids() to authenticated;

-- Catálogo: lectura pública.
alter table public.chain enable row level security;
alter table public.price_zone enable row level security;
alter table public.postal_code_zone enable row level security;
alter table public.category enable row level security;
alter table public.product_chain enable row level security;
alter table public.product_canonical enable row level security;
alter table public.equivalence enable row level security;
alter table public.price enable row level security;
alter table public.ingredient enable row level security;

create policy "lectura pública" on public.chain for select to anon, authenticated using (true);
create policy "lectura pública" on public.price_zone for select to anon, authenticated using (true);
create policy "lectura pública" on public.postal_code_zone for select to anon, authenticated using (true);
create policy "lectura pública" on public.category for select to anon, authenticated using (true);
create policy "lectura pública" on public.product_chain for select to anon, authenticated using (true);
create policy "lectura pública" on public.product_canonical for select to anon, authenticated using (true);
create policy "lectura pública" on public.equivalence for select to anon, authenticated using (true);
create policy "lectura pública" on public.price for select to anon, authenticated using (true);
create policy "lectura pública" on public.ingredient for select to anon, authenticated using (true);

-- Usuario.
alter table public.household enable row level security;
alter table public.profile enable row level security;
alter table public.shopping_list enable row level security;
alter table public.list_item enable row level security;
alter table public.recipe enable row level security;
alter table public.recipe_ingredient enable row level security;
alter table public.meal_plan enable row level security;
alter table public.meal_plan_slot enable row level security;
alter table public.pantry_item enable row level security;
alter table public.receipt enable row level security;
alter table public.price_observation enable row level security;

create policy "miembros leen su hogar" on public.household for select to authenticated
  using (id in (select public.my_household_ids()));
create policy "miembros editan su hogar" on public.household for update to authenticated
  using (id in (select public.my_household_ids()))
  with check (id in (select public.my_household_ids()));

create policy "perfil propio" on public.profile for select to authenticated
  using (user_id = (select auth.uid()));
create policy "perfil propio editable" on public.profile for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and household_id in (select public.my_household_ids()));

-- Tablas con household_id directo.
do $$
declare t text;
begin
  foreach t in array array['shopping_list', 'recipe', 'meal_plan', 'pantry_item', 'receipt', 'price_observation']
  loop
    execute format(
      'create policy "datos del hogar" on public.%I for all to authenticated
         using (household_id in (select public.my_household_ids()))
         with check (household_id in (select public.my_household_ids()))', t);
  end loop;
end $$;

-- Recetas públicas: cualquiera con sesión puede leerlas.
create policy "recetas públicas" on public.recipe for select to authenticated using (visibility = 'public');

-- Tablas hijas: a través de su padre.
create policy "datos del hogar" on public.list_item for all to authenticated
  using (list_id in (select id from public.shopping_list where household_id in (select public.my_household_ids())))
  with check (list_id in (select id from public.shopping_list where household_id in (select public.my_household_ids())));

create policy "datos del hogar" on public.recipe_ingredient for all to authenticated
  using (recipe_id in (select id from public.recipe where household_id in (select public.my_household_ids())))
  with check (recipe_id in (select id from public.recipe where household_id in (select public.my_household_ids())));
create policy "ingredientes de recetas públicas" on public.recipe_ingredient for select to authenticated
  using (recipe_id in (select id from public.recipe where visibility = 'public'));

create policy "datos del hogar" on public.meal_plan_slot for all to authenticated
  using (meal_plan_id in (select id from public.meal_plan where household_id in (select public.my_household_ids())))
  with check (meal_plan_id in (select id from public.meal_plan where household_id in (select public.my_household_ids())));

-- Alta del hogar en el primer uso: crea el hogar y el perfil del usuario actual en una sola operación.
create function public.create_household(
  p_postal_code text,
  p_members smallint,
  p_weekly_budget numeric,
  p_chain_ids smallint[],
  p_diet jsonb default '[]'::jsonb,
  p_allergens jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
begin
  if v_user is null then
    raise exception 'Hace falta iniciar sesión';
  end if;
  if exists (select 1 from public.profile where user_id = v_user) then
    raise exception 'El usuario ya tiene hogar';
  end if;
  insert into public.household (postal_code, members, weekly_budget, chain_ids)
    values (p_postal_code, p_members, p_weekly_budget, p_chain_ids)
    returning id into v_household;
  insert into public.profile (user_id, household_id, diet, allergens)
    values (v_user, v_household, p_diet, p_allergens);
  return v_household;
end;
$$;
revoke all on function public.create_household(text, smallint, numeric, smallint[], jsonb, jsonb) from public;
grant execute on function public.create_household(text, smallint, numeric, smallint[], jsonb, jsonb) to authenticated;

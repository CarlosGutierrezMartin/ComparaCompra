-- Emparejamiento (H2): nivel de cada producto canónico, cola de revisión y embeddings.

-- Cada canónico es de un nivel; key es la clave estable que genera el emparejador
-- (g:<hoja>, e:<hoja>|<variante>|<marcas>|<rasgos>, i:...).
alter table public.product_canonical
  add column level public.equivalence_level,
  add column key text unique;
update public.product_canonical set level = 'generic' where level is null;
alter table public.product_canonical alter column level set not null;
alter table public.product_canonical drop constraint product_canonical_category_id_name_key;
create index product_canonical_category_level_idx on public.product_canonical (category_id, level);

-- Cola de revisión manual: clasificaciones dudosas, idénticos dudosos y avisos de usuarios.
create table public.match_review (
  id bigint generated always as identity primary key,
  product_chain_id bigint not null references public.product_chain (id) on delete cascade,
  other_product_chain_id bigint references public.product_chain (id) on delete cascade,
  proposed_canonical_id bigint references public.product_canonical (id) on delete set null,
  proposed_level public.equivalence_level,
  confidence numeric(4, 3),
  reason text not null check (reason in ('clasificacion_dudosa', 'identico_dudoso', 'usuario')),
  comment text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  reported_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index match_review_pending_uidx
  on public.match_review (product_chain_id, reason, coalesce(other_product_chain_id, 0))
  where status = 'pending';
alter table public.match_review enable row level security;

-- Embeddings léxicos del nombre (matching/embeddings.py, 256 dimensiones).
create table public.product_chain_embedding (
  product_chain_id bigint primary key references public.product_chain (id) on delete cascade,
  text text not null,
  embedding extensions.vector(256) not null
);
create index product_chain_embedding_hnsw_idx
  on public.product_chain_embedding using hnsw (embedding extensions.vector_cosine_ops);
alter table public.product_chain_embedding enable row level security;

-- Productos más parecidos de otras cadenas (para revisar emparejamientos).
create function public.similar_products(p_product_chain_id bigint, p_limit int default 10)
returns table (product_chain_id bigint, chain_id smallint, name text, similarity double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select pc.id, pc.chain_id, pc.name, 1 - (e.embedding operator(extensions.<=>) src.embedding)
  from public.product_chain_embedding src
  join public.product_chain me on me.id = src.product_chain_id
  join public.product_chain_embedding e on e.product_chain_id <> src.product_chain_id
  join public.product_chain pc on pc.id = e.product_chain_id and pc.chain_id <> me.chain_id
  where src.product_chain_id = p_product_chain_id
  order by e.embedding operator(extensions.<=>) src.embedding
  limit least(p_limit, 50);
$$;
revoke all on function public.similar_products(bigint, int) from public;
grant execute on function public.similar_products(bigint, int) to service_role;

-- Botón "este producto no es equivalente": cualquier usuario con sesión puede avisar.
create function public.report_not_equivalent(
  p_product_chain_id bigint,
  p_product_canonical_id bigint,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Hace falta iniciar sesión';
  end if;
  insert into public.match_review
    (product_chain_id, proposed_canonical_id, reason, comment, reported_by)
  values (p_product_chain_id, p_product_canonical_id, 'usuario', left(p_comment, 500), (select auth.uid()))
  on conflict do nothing;
end;
$$;
revoke all on function public.report_not_equivalent(bigint, bigint, text) from public;
grant execute on function public.report_not_equivalent(bigint, bigint, text) to authenticated;

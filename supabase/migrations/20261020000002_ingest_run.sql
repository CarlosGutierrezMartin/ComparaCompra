-- Registro de cada captura por cadena y zona: base de las alertas de calidad (H1).
create table public.ingest_run (
  id bigint generated always as identity primary key,
  chain_id smallint not null references public.chain (id),
  price_zone_id bigint references public.price_zone (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  products integer not null default 0,
  requests integer not null default 0,
  price_changes integer not null default 0,
  -- ok: captura completa; alert: caída de productos > 20 % (no se desactiva nada);
  -- blocked: la cadena bloqueó la captura; error: fallo del conector.
  status text not null check (status in ('running', 'ok', 'alert', 'blocked', 'error')),
  message text,
  truncated_categories text[] not null default '{}'
);
create index ingest_run_chain_zone_idx on public.ingest_run (chain_id, price_zone_id, started_at desc);

-- Solo la clave de servicio (ingesta) accede: RLS activado y sin políticas.
alter table public.ingest_run enable row level security;

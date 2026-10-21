-- Datos nutricionales de Open Food Facts por EAN (licencia ODbL; se muestra la atribución).
create table public.product_nutrition (
  ean text primary key check (ean ~ '^[0-9]{8,14}$'),
  product_name text,
  -- Valores por 100 g o 100 ml tal como los publica Open Food Facts.
  nutriments jsonb not null default '{}'::jsonb,
  image_url text,
  source_url text not null,
  found boolean not null default true,
  fetched_at timestamptz not null default now()
);
alter table public.product_nutrition enable row level security;
create policy "lectura pública" on public.product_nutrition for select to anon, authenticated using (true);

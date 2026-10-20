-- Datos fijos del MVP. Las zonas de precio y los códigos postales los carga la ingesta (H1).
insert into public.chain (name, slug, website_url) values
  ('Mercadona', 'mercadona', 'https://tienda.mercadona.es'),
  ('Carrefour', 'carrefour', 'https://www.carrefour.es'),
  ('Dia', 'dia', 'https://www.dia.es'),
  ('Alcampo', 'alcampo', 'https://www.compraonline.alcampo.es')
on conflict (slug) do nothing;

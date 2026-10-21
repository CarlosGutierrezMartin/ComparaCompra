-- Ingredientes de receta sin cantidad ("sal al gusto") o sin ingrediente canónico ("ras el
-- hanout"): se guardan tal cual en lugar de inventar una cantidad o forzar un emparejamiento
-- (regla "nunca inventar datos" de docs/SPEC.md).
alter table public.recipe_ingredient drop constraint recipe_ingredient_pkey;
alter table public.recipe_ingredient
  add column id bigint generated always as identity primary key,
  add column position smallint not null default 0,
  add column name text,
  add column variant text,
  add column flags text[] not null default '{}';
alter table public.recipe_ingredient
  alter column ingredient_id drop not null,
  alter column quantity drop not null,
  alter column unit drop not null;
alter table public.recipe_ingredient
  add constraint recipe_ingredient_cantidad_check check ((quantity is null) = (unit is null)),
  add constraint recipe_ingredient_identificado_check check (ingredient_id is not null or name is not null);
create index recipe_ingredient_recipe_idx on public.recipe_ingredient (recipe_id, position);

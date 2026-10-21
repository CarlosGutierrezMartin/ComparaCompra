-- Huecos del menú con platos del recetario base (incluido en la app, sin fila en recipe):
-- se guardan por referencia ("base:lentejas-con-verduras").
alter table public.meal_plan_slot
  add column recipe_ref text check (recipe_ref is null or recipe_ref ~ '^base:[a-z0-9-]+$'),
  add constraint meal_plan_slot_un_plato_check check (recipe_id is null or recipe_ref is null);
-- Resumen del último cálculo (coste, productos, desperdicio, ahorro) para verlo en otro dispositivo.
alter table public.meal_plan add column summary jsonb;

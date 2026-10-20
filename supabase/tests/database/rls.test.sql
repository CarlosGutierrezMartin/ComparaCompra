begin;
select plan(14);

-- Todas las tablas de public tienen RLS activado.
select is(
  (select count(*)::int from pg_tables t
     join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
    where t.schemaname = 'public' and not c.relrowsecurity),
  0, 'todas las tablas de public tienen RLS');

-- Dos usuarios con hogares distintos.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select lives_ok($$ select public.create_household('28001', 2::smallint, 80, '{1,2}'::smallint[]) $$, 'A crea su hogar');
select throws_ok($$ select public.create_household('28001', 2::smallint, 80, '{1}'::smallint[]) $$, 'P0001', 'El usuario ya tiene hogar', 'A no puede crear un segundo hogar');
select lives_ok($$ insert into public.shopping_list (household_id, name) select public.my_household_ids(), 'Lista A' $$, 'A crea una lista en su hogar');
select is((select count(*)::int from public.shopping_list), 1, 'A ve su lista');
select set_config('test.hogar_a', (select public.my_household_ids()::text limit 1), true);
select lives_ok($$ insert into public.list_item (list_id, raw_text) select id, 'leche' from public.shopping_list $$, 'A añade una línea');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select lives_ok($$ select public.create_household('28080', 1::smallint, null, '{3}'::smallint[]) $$, 'B crea su hogar');
select is((select count(*)::int from public.shopping_list), 0, 'B no ve la lista de A');
select is((select count(*)::int from public.list_item), 0, 'B no ve las líneas de A');
select is((select count(*)::int from public.household), 1, 'B solo ve su hogar');
select throws_ok(
  $$ insert into public.shopping_list (household_id, name)
     values (current_setting('test.hogar_a')::uuid, 'intrusa') $$,
  '42501', null, 'B no puede escribir en el hogar de A');

-- Catálogo: lectura pública, sin escritura.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*)::int from public.chain), 4, 'anónimo lee las cadenas');
select throws_ok($$ insert into public.chain (name, slug, website_url) values ('X', 'x', 'https://x') $$, '42501', null, 'anónimo no escribe en el catálogo');
select is((select count(*)::int from public.household), 0, 'anónimo no ve hogares');

select * from finish();
rollback;

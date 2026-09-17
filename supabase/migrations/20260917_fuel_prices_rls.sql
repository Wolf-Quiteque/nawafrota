-- fleet_fuel_prices was the one fleet table left out of the RLS block in
-- 20260917_nawa_frotas.sql. Supabase grants anon and authenticated full DML on
-- public tables by default, so RLS is the only thing holding those grants back:
-- without it the anon key — which ships inside the Sunmi APK and every web
-- client, and is therefore public — could read, insert, update or delete fuel
-- prices. An inserted row would silently reprice every later fuel log fleet-wide
-- (b_apply_fuel_price reads this table), and deleting the last row would make
-- litres-only entries fail outright.
--
-- Every read and write in the app goes through the service-role client, which
-- bypasses RLS, so enabling it changes no application behaviour.

alter table public.fleet_fuel_prices enable row level security;

-- Staff may read the price history directly (dashboards, and so a future client
-- can show "preço em vigor" without a round trip). Writes stay server-side only:
-- no insert/update/delete policy exists, so those are denied to anon and
-- authenticated alike.
create policy staff_read_fuel_prices on public.fleet_fuel_prices
  for select to authenticated using (public.is_fleet_staff());

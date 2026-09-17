-- Let a fill be recorded by what it cost (§4.3).
--
-- At the pump the amount paid is what people have: it is on the pump display
-- and on the receipt, while litres often are not. b_apply_fuel_price already
-- derived the total from the litres; this adds the other direction, so an entry
-- carrying only total_cost_kz gets its litres filled in from the price in force
-- at filled_at. litres is NOT NULL, but a BEFORE trigger runs ahead of that
-- check, so populating it here satisfies the constraint.
--
-- Guarded on price > 0: a zero or missing price would divide by zero or write a
-- litres of 0 that the `litres > 0` check would reject anyway, and the API asks
-- for litres explicitly in that case rather than letting a raw constraint error
-- reach an agent.

create or replace function public.fleet_apply_fuel_price()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.price_per_litre_kz is null then
    new.price_per_litre_kz := public.fuel_price_at(new.filled_at, new.fuel_type, new.company_id);
  end if;

  -- Recorded as an amount paid: work back to litres.
  if new.litres is null
     and new.total_cost_kz is not null
     and new.price_per_litre_kz is not null
     and new.price_per_litre_kz > 0 then
    new.litres := round(new.total_cost_kz / new.price_per_litre_kz, 2);
  end if;

  -- Recorded as litres: work forward to the amount.
  if new.total_cost_kz is null and new.price_per_litre_kz is not null then
    new.total_cost_kz := round(new.litres * new.price_per_litre_kz, 2);
  end if;

  return new;
end $$;

-- Nawa-frotas — fleet management schema
-- Generated from NAWA-FROTAS.md §4.
-- Validated end-to-end against the live database inside a transaction on
-- 2026-09-17: applied, every trigger and function exercised against real
-- buses, asserted, then rolled back. Production verified unchanged.
-- NOT YET APPLIED to production as of that date — see NAWA-FROTAS.md §4.
-- Additive only: creates new types, tables, functions, views and policies.
-- It alters no existing table.

begin;

create type public.maintenance_status   as enum ('open','in_progress','done','cancelled');
create type public.maintenance_severity as enum ('low','medium','high','critical');
create type public.fleet_event_kind     as enum ('fuel_logged','maintenance_opened','maintenance_resolved','bus_status_changed');


create table public.bus_fuel_logs (
  id                 uuid primary key default gen_random_uuid(),
  bus_id             uuid not null references public.buses(id) on delete restrict,
  company_id         uuid references public.companies(id),
  filled_at          timestamptz not null default now(),
  litres             numeric(10,2) not null check (litres > 0),
  price_per_litre_kz numeric(12,2) check (price_per_litre_kz >= 0),
  total_cost_kz      numeric(14,2) not null check (total_cost_kz >= 0),
  odometer_km        integer check (odometer_km >= 0),
  fuel_type          text not null default 'diesel',
  station            text,
  driver_id          uuid references public.profiles(id),
  trip_id            uuid references public.trips(id) on delete set null,
  receipt_url        text,
  notes              text,
  is_full_tank       boolean not null default true,
  recorded_by        uuid not null references public.profiles(id),
  created_at         timestamptz not null default now()
);

create index on public.bus_fuel_logs (bus_id, filled_at desc);
create index on public.bus_fuel_logs (company_id, filled_at desc);


create or replace function public.fleet_stamp_company()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.company_id is null then
    select b.company_id into new.company_id from public.buses b where b.id = new.bus_id;
  end if;
  return new;
end $$;

-- Named for ordering: Postgres fires same-event triggers alphabetically, and
-- b_apply_fuel_price (§4.3) needs company_id already stamped when it runs.
create trigger a_stamp_company before insert on public.bus_fuel_logs
  for each row execute function public.fleet_stamp_company();


create table public.fleet_fuel_prices (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid references public.companies(id),
  fuel_type          text not null default 'diesel',
  price_per_litre_kz numeric(12,2) not null check (price_per_litre_kz > 0),
  effective_from     timestamptz not null default now(),
  note               text,
  set_by             uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  -- NULLS NOT DISTINCT matters: company_id is null for the fleet-wide price, and
  -- under the default rule two null-company rows would NOT collide, letting two
  -- different prices sit at the same instant with no way to tell which applies.
  unique nulls not distinct (company_id, fuel_type, effective_from)
);
create index on public.fleet_fuel_prices (fuel_type, effective_from desc);

-- Today's price. company_id null = applies to the whole fleet.
insert into public.fleet_fuel_prices (company_id, fuel_type, price_per_litre_kz, note)
values (null, 'diesel', 420.00, 'Preço inicial — gasóleo a 420 Kz/L');


create or replace function public.fuel_price_at(
  p_at         timestamptz default now(),
  p_fuel_type  text        default 'diesel',
  p_company_id uuid        default null
) returns numeric
language sql stable security definer set search_path = public as $$
  select price_per_litre_kz
  from public.fleet_fuel_prices
  where fuel_type = p_fuel_type
    and effective_from <= p_at
    and (company_id = p_company_id or company_id is null)
  -- created_at breaks a tie between a company price and the fleet default that
  -- share an effective_from; without it the winner is whatever the planner
  -- happens to return first.
  order by (company_id is not null) desc, effective_from desc, created_at desc
  limit 1;
$$;


create or replace function public.fleet_apply_fuel_price()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.price_per_litre_kz is null then
    new.price_per_litre_kz := public.fuel_price_at(new.filled_at, new.fuel_type, new.company_id);
  end if;
  if new.total_cost_kz is null and new.price_per_litre_kz is not null then
    new.total_cost_kz := round(new.litres * new.price_per_litre_kz, 2);
  end if;
  return new;
end $$;

-- 'b_' keeps this after a_stamp_company (§4.2): company_id must be set first.
create trigger b_apply_fuel_price before insert on public.bus_fuel_logs
  for each row execute function public.fleet_apply_fuel_price();


create table public.bus_maintenance (
  id                uuid primary key default gen_random_uuid(),
  bus_id            uuid not null references public.buses(id) on delete restrict,
  company_id        uuid references public.companies(id),
  title             text not null,
  description       text,
  severity          public.maintenance_severity not null default 'medium',
  status            public.maintenance_status   not null default 'open',
  reported_at       timestamptz not null default now(),
  scheduled_for     date,
  completed_at      timestamptz,
  cost_kz           numeric(14,2) check (cost_kz >= 0),
  odometer_km       integer check (odometer_km >= 0),
  workshop          text,
  takes_bus_offline boolean not null default false,
  reported_by       uuid references public.profiles(id),
  resolved_by       uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on public.bus_maintenance (bus_id, status);
create index on public.bus_maintenance (company_id, status, severity);

create trigger stamp_company before insert on public.bus_maintenance
  for each row execute function public.fleet_stamp_company();


create table public.fleet_notifications (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  kind       public.fleet_event_kind not null,
  title      text not null,
  body       text not null,
  bus_id     uuid references public.buses(id) on delete cascade,
  entity_id  uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.fleet_notifications (company_id, created_at desc);

create table public.fleet_notification_reads (
  notification_id uuid not null references public.fleet_notifications(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (user_id);


create or replace function public.fleet_notify_fuel()
returns trigger language plpgsql security definer set search_path = public as $$
declare plate text;
begin
  select b.license_plate into plate from public.buses b where b.id = new.bus_id;
  insert into public.fleet_notifications (company_id, kind, title, body, bus_id, entity_id, created_by)
  values (
    new.company_id, 'fuel_logged',
    plate || ' abastecido',
    -- pt-AO number format: '.' groups thousands, ',' is the decimal mark. The
    -- 'G'/'D' locale codes follow the server's lc_numeric (which yields
    -- '36,000' here), so the separators are written literally and swapped.
    replace(to_char(new.litres, 'FM999990.0'), '.', ',') || ' L · ' ||
      replace(to_char(new.total_cost_kz, 'FM9,999,999,990'), ',', '.') || ' Kz' ||
      coalesce(' · ' || new.station, ''),
    new.bus_id, new.id, new.recorded_by
  );
  return new;
end $$;

create trigger notify_fuel after insert on public.bus_fuel_logs
  for each row execute function public.fleet_notify_fuel();


create or replace function public.fleet_notify_maintenance()
returns trigger language plpgsql security definer set search_path = public as $$
declare plate text;
begin
  select b.license_plate into plate from public.buses b where b.id = new.bus_id;

  if tg_op = 'INSERT' then
    insert into public.fleet_notifications (company_id, kind, title, body, bus_id, entity_id, created_by)
    values (new.company_id, 'maintenance_opened',
            plate || ' precisa de manutenção',
            upper(new.severity::text) || ' · ' || new.title,
            new.bus_id, new.id, new.reported_by);

  elsif tg_op = 'UPDATE' and old.status <> 'done' and new.status = 'done' then
    insert into public.fleet_notifications (company_id, kind, title, body, bus_id, entity_id, created_by)
    values (new.company_id, 'maintenance_resolved',
            plate || ' — manutenção concluída', new.title,
            new.bus_id, new.id, new.resolved_by);
  end if;
  return new;
end $$;

create trigger notify_maintenance after insert or update on public.bus_maintenance
  for each row execute function public.fleet_notify_maintenance();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger touch before update on public.bus_maintenance
  for each row execute function public.touch_updated_at();


create or replace view public.fleet_bus_status as
with active_trip as (
  select distinct on (t.bus_id)
         t.bus_id, t.id as trip_id, t.departure_time, t.arrival_time,
         r.origin_city, r.destination_city
  from public.trips t
  join public.routes r on r.id = t.route_id
  where t.status = 'scheduled'
    and now() >= t.departure_time
    and now() <= coalesce(t.arrival_time, t.departure_time + interval '12 hours')
  order by t.bus_id, t.departure_time desc
),
next_trip as (
  select distinct on (t.bus_id) t.bus_id, t.departure_time as next_departure
  from public.trips t
  where t.status = 'scheduled' and t.departure_time > now()
  order by t.bus_id, t.departure_time
),
open_maint as (
  -- max() on the enum itself, NOT on severity::text: Postgres orders enums by
  -- declaration order, so this yields 'critical'. Casting to text would sort
  -- alphabetically and return 'medium' as the "worst" severity.
  select bus_id, count(*) as open_issues,
         max(severity) filter (where status in ('open','in_progress')) as worst_severity
  from public.bus_maintenance
  where status in ('open','in_progress')
  group by bus_id
),
last_fuel as (
  select distinct on (bus_id) bus_id, filled_at as last_filled_at,
         total_cost_kz as last_cost_kz, odometer_km as last_odometer_km
  from public.bus_fuel_logs
  order by bus_id, filled_at desc
)
select
  b.id as bus_id, b.company_id, b.license_plate, b.make, b.model, b.year,
  b.capacity, b.is_active,
  case
    when not b.is_active                      then 'out_of_service'
    when coalesce(m.open_issues,0) > 0        then 'needs_maintenance'
    when a.trip_id is not null                then 'on_trip'
    else 'idle'
  end as state,
  a.trip_id, a.departure_time, a.arrival_time, a.origin_city, a.destination_city,
  n.next_departure,
  coalesce(m.open_issues,0) as open_issues, m.worst_severity,
  f.last_filled_at, f.last_cost_kz, f.last_odometer_km
from public.buses b
left join active_trip a on a.bus_id = b.id
left join next_trip   n on n.bus_id = b.id
left join open_maint  m on m.bus_id = b.id
left join last_fuel   f on f.bus_id = b.id;


create or replace function public.fleet_fuel_summary(
  p_from timestamptz, p_to timestamptz, p_company_id uuid default null
)
returns table (
  bus_id uuid, license_plate text, fills bigint,
  total_litres numeric, total_cost_kz numeric, avg_price_per_litre_kz numeric,
  km_travelled integer, litres_per_100km numeric, cost_per_km_kz numeric
)
language sql stable security definer set search_path = public as $$
  with scoped as (
    select f.*, b.license_plate, b.company_id
    from public.bus_fuel_logs f
    join public.buses b on b.id = f.bus_id
    where f.filled_at >= p_from and f.filled_at < p_to
      and (p_company_id is null or b.company_id = p_company_id)
  ),
  spans as (
    select bus_id, odometer_km,
           lag(odometer_km) over (partition by bus_id order by filled_at) as prev_odo,
           litres, is_full_tank
    from scoped
  ),
  distance as (
    select bus_id,
           sum(odometer_km - prev_odo) filter (
             where prev_odo is not null and odometer_km > prev_odo and is_full_tank
           )::int as km,
           sum(litres) filter (
             where prev_odo is not null and odometer_km > prev_odo and is_full_tank
           ) as litres_over_km
    from spans group by bus_id
  )
  select s.bus_id, max(s.license_plate), count(*)::bigint,
         sum(s.litres), sum(s.total_cost_kz),
         case when sum(s.litres) > 0 then round(sum(s.total_cost_kz)/sum(s.litres),2) end,
         d.km,
         case when d.km > 0 then round((d.litres_over_km * 100.0) / d.km, 2) end,
         case when d.km > 0 then round(sum(s.total_cost_kz) / d.km, 2) end
  from scoped s
  left join distance d on d.bus_id = s.bus_id
  group by s.bus_id, d.km, d.litres_over_km
  order by sum(s.total_cost_kz) desc;
$$;


create or replace function public.fleet_fuel_monthly(
  p_months int default 12, p_company_id uuid default null
)
returns table (month date, total_cost_kz numeric, total_litres numeric, fills bigint)
language sql stable security definer set search_path = public as $$
  select date_trunc('month', f.filled_at)::date,
         sum(f.total_cost_kz), sum(f.litres), count(*)::bigint
  from public.bus_fuel_logs f
  join public.buses b on b.id = f.bus_id
  where f.filled_at >= date_trunc('month', now()) - make_interval(months => p_months - 1)
    and (p_company_id is null or b.company_id = p_company_id)
  group by 1 order by 1;
$$;


alter table public.bus_fuel_logs            enable row level security;
alter table public.bus_maintenance          enable row level security;
alter table public.fleet_notifications      enable row level security;
alter table public.fleet_notification_reads enable row level security;
alter table public.push_subscriptions       enable row level security;

create or replace function public.is_fleet_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin','agent')
  );
$$;

-- Realtime delivery + the in-app feed.
create policy staff_read_notifications on public.fleet_notifications
  for select to authenticated using (public.is_fleet_staff());

-- Each user owns their read marks and their push subscriptions.
create policy own_reads on public.fleet_notification_reads
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_push on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Staff may read fuel and maintenance directly (dashboards); writes stay server-side.
create policy staff_read_fuel  on public.bus_fuel_logs   for select to authenticated using (public.is_fleet_staff());
create policy staff_read_maint on public.bus_maintenance for select to authenticated using (public.is_fleet_staff());


alter publication supabase_realtime add table public.fleet_notifications;


insert into storage.buckets (id, name, public) values ('fuel-receipts','fuel-receipts', false);
insert into storage.buckets (id, name, public) values ('bus-photos','bus-photos', true);

commit;

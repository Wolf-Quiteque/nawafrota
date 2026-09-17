# Nawa-frotas — build specification

A PWA for managing the Nawabus fleet: add and edit buses, log every refuelling
(*abastecimento*), track maintenance, and see live fleet statistics. Staff get
notified when a bus is refuelled or flagged for maintenance.

This document is the complete brief. Read it top to bottom before writing code —
in particular [§2 Ground truth](#2-ground-truth-read-before-writing-any-code),
which contains a constraint that will corrupt live ticket sales if missed.

---

## 0. Status — what is already done

Work has started. This is the state as of **2026-09-17**; do not redo any of it.

### ✅ Done

| # | Step | Detail |
|---|---|---|
| 1 | Live schema researched | `buses` (21 rows, 6 active), `trips`, `routes`, `profiles`, `companies` inspected directly. Findings are §2. |
| 2 | Fleet schema designed | Six tables, three enums, one view, six functions — §4. |
| 3 | Schema validated | Applied in a transaction against the live DB, every trigger and function exercised on real buses, asserted, rolled back. Caught 4 real bugs (below). |
| 4 | **Migration APPLIED to production** | `nawa-frotas-migration.sql` committed 2026-09-17. `public` went 28 → 35 objects. `buses`/`trips`/`tickets` untouched (21 / 1.897 / 9.414). |
| 5 | Fuel price seeded | Gasóleo **420 Kz/L**, `fleet_fuel_prices`, effective from 2026-09-17. |
| 6 | Realtime enabled | `fleet_notifications` added to the `supabase_realtime` publication. |
| 7 | Storage buckets created | `fuel-receipts` (private), `bus-photos` (public). |
| 8 | RLS applied | 5 policies; `is_fleet_staff()` helper. Writes go through API routes on the service-role key. |
| 9 | Live smoke test | Insert with litres only → derived 420 Kz/L and 63.000 Kz, notification fired. Rolled back; new tables hold only the price seed. |
| 10 | **VAPID keys generated** | In `nawa-frotas/.env.vapid` (gitignored — it holds a private key). Verified: they encrypt and sign a real push payload (aes128gcm). Copy the three lines into `.env.local` and into Vercel. |

**Bugs that validation caught** — all fixed in the spec, worth not reintroducing:

1. `max(severity::text)` returned `medium` as the worst severity (alphabetical).
   Must be `max(severity)` on the enum, which orders by declaration.
2. Numbers formatted as `36,000 Kz`. pt-AO is `36.000 Kz` — separators are
   written literally and swapped, because `G`/`D` follow the server locale.
3. A new fuel price did not take effect: `company_id` is null for the fleet-wide
   price and nulls are distinct in a unique index by default, so two prices could
   sit at the same instant. Fixed with `unique nulls not distinct`.
4. Trigger order — the price trigger ran before `company_id` was stamped.
   Renamed `a_stamp_company` / `b_apply_fuel_price`; Postgres fires same-event
   triggers alphabetically.

### ⬜ Not started — this is the build

The application itself: scaffold, screens, API routes, PWA, notifications, tests,
deploy. Start at §10 step 3.

### Verify the starting point

```sql
select public.fuel_price_at();                                   -- 420.00
select state, count(*) from public.fleet_bus_status group by 1;  -- 15/5/1
select count(*) from public.bus_fuel_logs;                       -- 0
```

---

## 1. Scope

**In scope**

| Area | What it does |
|---|---|
| Fleet register | List, add, edit buses. Retire a bus (never delete — see §2.1). |
| Refuelling log | Record litres, cost, odometer, station, driver, receipt photo. |
| Fuel statistics | Cost and consumption per bus, per period, fleet totals, L/100 km. |
| Reports | Print any report or save it as PDF; export to CSV. |
| Maintenance | Raise an issue, set severity, schedule, resolve, optionally take the bus offline. |
| Live status | Whether each bus is on the road right now, idle, or out of service. |
| Notifications | Everyone on staff is told when a bus is refuelled or needs maintenance. |
| Offline | Installable, works read-only offline, queues a refuelling entry made with no signal. |

**Out of scope** — ticket sales, trip scheduling, passenger data. Those live in
`admin-app` and `nawasoft-pwa`. Nawa-frotas reads trips only to answer "is this
bus out right now?".

---

## 2. Ground truth (read before writing any code)

### 2.1 ⚠️ `buses` is a shared production table

`public.buses` already exists and **the entire ticketing system depends on it**.
`trips.bus_id` points at it; live tickets point at those trips. As of writing
there are 21 buses, 6 active.

Consequences, all mandatory:

- **Never `DELETE` a bus.** Retiring means `is_active = false`. A delete would
  orphan trips and the tickets sold against them. Every foreign key in this spec
  uses `on delete restrict` deliberately.
- **Never reduce `capacity` below the highest seat already sold** on any future
  trip for that bus. Check before saving:
  ```sql
  select max(tk.seat_number)
  from tickets tk join trips t on t.id = tk.trip_id
  where t.bus_id = $1 and t.departure_time > now() and tk.status in ('active','used');
  ```
  Refuse the edit if the new capacity is lower, and say which seat blocks it.
- **Seat 1 is the co-pilot seat** and is never sellable. Sellable seats are
  `capacity - 1`. Mirror `nawasoft-pwa/lib/seats.js` rather than re-deriving it.
- `is_active = false` already hides a bus from sale elsewhere — `website` checks
  it at checkout. Turning a bus off here has immediate commercial effect. Confirm
  before doing it, and say so in the UI.

Existing columns — do not rename, other apps select them by name:

```
id uuid pk · company_id uuid · license_plate text · make text · model text
year int · capacity int · amenities text[] · is_active bool · created_at timestamptz
```

Everything Nawa-frotas adds goes in **new tables**, never as columns on `buses`.

### 2.2 Multi-tenant

`buses.company_id` → `companies`. Nawabus is
`fa13f78e-200b-4c64-9c57-0074e399e8f3` (19 of 21 buses); Macon and one other own
the rest. Scope every query by the signed-in user's `profiles.company_id`, and
let an admin with a null `company_id` see everything.

### 2.3 "On a trip right now" must be derived from time, not status

`trips.status` only ever holds `scheduled` or `cancelled` in live data — nothing
sets `in_progress` or `completed`. So a bus is on the road when now falls inside
a scheduled trip's window. Use the view in §4.6; do not wait for a status that
never arrives.

Also: one physical departure is several `trips` rows (one per leg — Gamek→Sumbe
and Gamek→Benguela are the same bus leaving once). Deduplicate by
`(bus_id, departure_time)` or you will report one bus as being on four trips.

Checked against live data on 2026-09-17 07:49 UTC: the time-window rule matched
**2 trip rows belonging to 1 physical bus** (LDA-10-47-AR, out on its
Kikolo→Benguela run). Without the `distinct on` this dashboard would have
claimed two buses were on the road when only one was.

### 2.4 Conventions

- **Timezone** `Africa/Luanda`, UTC+1, no DST. Timestamps are stored UTC; an
  08:00 Luanda departure is `07:00:00+00`. Format for display with
  `timeZone: 'Africa/Luanda'` — copy `nawasoft-pwa/lib/format.js`.
- **Currency** Kwanza. Several existing columns are named `*_usd` for historical
  reasons and hold Kz. **New columns in this app must be named `_kz`.**
- **Language** the entire UI is Portuguese — see §2.5. This is not a preference.
- **Roles** `profiles.role` ∈ `passenger | agent | admin | driver`.
  Staff = `admin`, `agent`. Drivers get a restricted view (§6.7).

### 2.5 🇦🇴 The UI is Portuguese — all of it

**Every word a user sees is European Portuguese as written in Angola (pt-AO).**
No English anywhere in the interface. That includes the places it usually leaks:

- buttons, labels, field placeholders, page titles, tab names
- empty states, loading text, validation messages, API error strings
- toasts, confirmation dialogs, `window.confirm` text
- **notification titles and bodies** (in-app and push)
- the PWA manifest `name`, `short_name` and `description`
- CSV export column headers, and printed report headings
- `<html lang="pt">`

Code stays in English — variable names, comments, table and column names,
commit messages. Only the user-facing strings are translated.

#### European Portuguese, not Brazilian

This is the mistake most likely to be made, and Angolan staff notice it
immediately. Use the left column:

| ✅ pt-AO / pt-PT | ❌ pt-BR |
|---|---|
| Autocarro | Ônibus |
| Matrícula | Placa |
| A carregar… | Carregando… |
| Guardar | Salvar |
| Ecrã | Tela |
| Telemóvel | Celular |
| Casa de banho | Banheiro |
| Registo | Registro |
| Contacto | Contato |
| Ficheiro | Arquivo |
| Autocarro avariado | Ônibus quebrado |
| Gasóleo | Diesel (as a UI word) |

Also pt-PT spelling: **facto**, **contacto**, **ação**, **direção**,
**eletrónico** (not *eletrônico*).

#### Vocabulary for this app

| English | Use this |
|---|---|
| Fleet | Frota |
| Bus | Autocarro |
| Refuelling / to refuel | Abastecimento / abastecer |
| Fuel (diesel) | Combustível / Gasóleo |
| Litres | Litros |
| Odometer reading | Quilometragem |
| Fuel consumption | Consumo |
| Full tank | Depósito cheio |
| Filling station | Posto |
| Receipt | Recibo |
| Maintenance | Manutenção |
| Breakdown / faulty | Avaria / avariado |
| Workshop | Oficina |
| Report | Relatório |
| Settings | Configurações |
| Driver | Motorista |
| Trip | Viagem |
| Route | Percurso |
| Plate | Matrícula |
| Capacity | Lotação |
| Notification | Notificação |
| Print | Imprimir |
| Save (a file) | Guardar |
| Add / Edit | Adicionar / Editar |
| Deactivate | Desativar |
| Period | Período |
| Average | Média |
| Search / Filter | Pesquisar / Filtrar |

Bus states, used consistently in badges, filters and reports:
**Em viagem** · **Disponível** · **Manutenção** · **Fora de serviço**.

Maintenance severities: **Baixa** · **Média** · **Alta** · **Crítica**.
Maintenance statuses: **Aberta** · **Em curso** · **Concluída** · **Cancelada**.

#### Formatting

Portuguese formatting is not just translated words:

```js
// 42.000 Kz  — '.' groups thousands, ',' is the decimal mark
new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(42000) + ' Kz';
// 150,5 L
new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 1 }).format(150.5) + ' L';
// 17 set 2026, 09:41  — always Africa/Luanda, never raw UTC
new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short',
  timeZone: 'Africa/Luanda' }).format(d);
```

With `date-fns`, import the `pt` locale and pass it to every `format()` call.

The database already emits Portuguese notification text with the right
separators (§4.5) — match it in the UI rather than reformatting it.

Some sample strings to set the tone:

- `A carregar frota…` · `Nenhum abastecimento registado` · `Sem viagens hoje`
- `Abastecimento registado com sucesso.`
- `Não foi possível guardar. Tente novamente.`
- `Desativar remove este autocarro da venda de bilhetes imediatamente. Continuar?`
- `Só administradores podem alterar o preço do combustível.`

### 2.6 Where the information lives

| You need | Get it from |
|---|---|
| Supabase URL, anon key, **service-role key** | `admin-app/.env` or `.env.supabase` (service role is full DB root — never ship it to the browser) |
| **Direct Postgres connection** (run DDL, introspect) | `SUPABASE_POOLER` in `.env.supabase` — transaction pooler, port 6543. Connects as `postgres` (superuser) to PostgreSQL 17.6. Use `pg` from Node with `ssl: { rejectUnauthorized: false }`. This is how the migration was validated; prefer it over the dashboard for anything scriptable. |
| Project ref | `rplqkkfhlgbtuqwassfh` · dashboard: `https://supabase.com/dashboard/project/rplqkkfhlgbtuqwassfh` |
| App architecture to copy | `nawasoft-pwa/` — closest sibling, same stack, same auth |
| Auth + staff gate | `nawasoft-pwa/lib/auth.js`, `lib/session.js`, `middleware.js`, `lib/auth-paths.js` |
| Service-role client | `nawasoft-pwa/lib/supabase-admin.js` |
| UI kit (Button, Input, Sheet, Card, Toast, Badge…) | `nawasoft-pwa/components/ui/` |
| PWA scaffolding (manifest, sw.js, offline.html, icon generator) | `nawasoft-pwa/public/` + `scripts/generate-icons.mjs` |
| Seat rules | `nawasoft-pwa/lib/seats.js` |
| Workspace-wide notes | `CLAUDE.md` at the repo root |

> **Do not trust `db-sturcture.json`.** It is a July snapshot listing 20 tables;
> the live database now has 28 and has changed since. Introspect it instead —
> over SQL:
> ```sql
> select table_name from information_schema.tables where table_schema='public' order by 1;
> ```
> or over PostgREST:
> ```bash
> curl -s "$SUPABASE_URL/rest/v1/buses?select=*&limit=1" \
>   -H "apikey: $SRK" -H "Authorization: Bearer $SRK"
> ```
>
> **Validate any DDL the way this migration was validated:** open a transaction,
> apply it, exercise the triggers against real rows, assert the results, then
> `rollback` and confirm nothing was left behind. That caught both the
> severity-ordering and the number-formatting bugs in §4, neither of which is
> visible from reading the SQL.

---

## 3. Stack

Match `nawasoft-pwa` exactly so the two apps stay maintainable together:

- Next.js 15 (App Router) · React 18
- Tailwind v4 via `@tailwindcss/postcss`
- `@supabase/ssr` + `@supabase/supabase-js`
- `lucide-react`, `clsx`, `tailwind-merge`, `date-fns` (with the `pt` locale)
- `web-push` (server-side push fan-out — §7.2)
- `sharp` (dev) for icon generation
- Tests: `node --test`, wired to `prebuild` so a failing test blocks deploy
- Deploy: Vercel, own project

```bash
mkdir nawa-frotas && cd nawa-frotas
# copy the scaffolding rather than starting from create-next-app:
#   package.json, jsconfig.json, next.config.mjs, postcss.config.mjs,
#   middleware.js, app/globals.css, app/layout.js, components/ui/*,
#   lib/{auth,session,auth-paths,supabase-admin,supabase-server,supabase-browser,
#        supabase-token,cn,format,useApi,useDebounce}.js,
#   public/{sw.js,offline.html,manifest.webmanifest}, scripts/generate-icons.mjs
```

`.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://rplqkkfhlgbtuqwassfh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from admin-app/.env>
SUPABASE_SERVICE_ROLE_KEY=<from admin-app/.env>
# Already generated — copy the three lines verbatim from nawa-frotas/.env.vapid.
# Do NOT regenerate: existing push subscriptions are bound to this public key.
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<from nawa-frotas/.env.vapid>
VAPID_PRIVATE_KEY=<from nawa-frotas/.env.vapid>
VAPID_SUBJECT=mailto:admin@nawabus.com
```

---

## 4. Database

**The SQL below is already written out as a runnable file:
[`nawa-frotas-migration.sql`](nawa-frotas-migration.sql)**, next to this file.
Copy it to `supabase/migrations/<date>_nawa_frotas.sql` in the new app.

> ✅ **Applied to production on 2026-09-17.** All six tables, three enums, the
> `fleet_bus_status` view, six functions, five RLS policies, the realtime
> publication and both storage buckets exist and were smoke-tested live. Gasóleo
> is seeded at 420 Kz/L. `public` went from 28 to 35 objects; `buses`, `trips`
> and `tickets` were not touched. **Do not run it again** — re-running will fail
> on the existing types. The file is kept for reference and for rebuilding a
> staging database.

It has been **validated end-to-end against the live database** (2026-09-17):
applied inside a transaction, every trigger and function exercised against real
buses, then rolled back. Production was verified unchanged afterwards. What was
confirmed working:

- all six tables, three enums and the `fleet_bus_status` view create cleanly
- the view classifies the real fleet — 15 out of service, 5 idle, 1 on a trip
- both notification triggers fire with correctly formatted pt-AO text
- `company_id` is stamped automatically from the bus
- `worst_severity` returns `critical` (see the enum note in §4.6)
- consumption maths returns 12,00 L/100 km over a seeded 500 km span
- the fuel price config (§4.3) seeds gasóleo at 420 Kz/L, derives price and total
  on an insert that supplies only litres, prices a backdated fill at the rate in
  force then, respects a hand-typed off-rate total, and rejects two prices
  sharing one `effective_from`

Apply it with the pooler connection in `.env.supabase` (§2.6) or by pasting it
into the Supabase SQL editor. Everything in it is additive — it creates new
objects only and alters no existing table — but read §2.1 again anyway.

### 4.1 Enums

```sql
create type public.maintenance_status   as enum ('open','in_progress','done','cancelled');
create type public.maintenance_severity as enum ('low','medium','high','critical');
create type public.fleet_event_kind     as enum ('fuel_logged','maintenance_opened','maintenance_resolved','bus_status_changed');
```

### 4.2 Refuelling log

`odometer_km` is what makes consumption statistics possible — it is nullable so
a hurried entry still saves, but the UI should push hard for it (§6.3).

```sql
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
```

Keep `company_id` in step with the bus automatically:

```sql
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
```

### 4.3 Fuel price configuration

Gasóleo is **420 Kz/litre** today and will not stay there. Two things follow: the
refuelling form should prefill the current price, and a fill recorded last month
must keep the price that applied *then*.

Per-fill history is already safe — `bus_fuel_logs.price_per_litre_kz` stores what
was actually paid on each row. This table is the *official* price over time: what
the form prefills, and the record of when the price moved.

```sql
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
```

A price change is an **insert, never an update**. Updating would rewrite history
and silently change what past reports say was paid.

Lookup, preferring a company's own price over the fleet-wide default:

```sql
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
```

Fill in whatever the agent left blank. The price comes from the configuration
**as it stood at the moment of the fill**, not today's — backdating an entry must
not price it at a rate that did not exist yet:

```sql
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
```

So `insert into bus_fuel_logs (bus_id, litres, recorded_by) values (…, 120, …)`
is enough — price and total are derived. An agent who was charged an off-price
rate just types the real total and it is kept as given.

### 4.4 Maintenance

```sql
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
```

**`takes_bus_offline` must not silently stop ticket sales.** Flipping
`buses.is_active` pulls the bus from the public site immediately. Do it only
from an explicit API action with confirmation (§6.4), not from a trigger.

### 4.5 Notifications

Two tables: the event, and who has read it. Read state is per user, so the badge
count is correct for each person.

```sql
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
```

Raise a notification automatically whenever a bus is refuelled:

```sql
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
```

And when maintenance is opened or resolved:

```sql
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
```

### 4.6 Live bus status

One row per bus: is it out right now, and what is outstanding against it.
`distinct on` collapses the multi-leg run problem from §2.3.

```sql
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
```

### 4.7 Fuel statistics

Consumption needs two consecutive full-tank fills with odometer readings. `lag()`
gives the previous one; rows without the data simply produce nulls rather than
wrong numbers.

```sql
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
```

A companion for the dashboard chart (spend per month, whole fleet):

```sql
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
```

### 4.8 RLS and Realtime

Follow the `nawasoft-pwa` model: **all writes go through Next API routes using
the service-role key after `requireStaff()`**. RLS therefore denies everything by
default. The one exception is `fleet_notifications`, which the browser subscribes
to directly over Realtime and so needs a read policy.

```sql
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
```

Enable Realtime on the notifications table (Dashboard → Database → Replication,
or):

```sql
alter publication supabase_realtime add table public.fleet_notifications;
```

> No app in this workspace uses Supabase Realtime yet — Nawa-frotas is the first.
> Confirm the publication exists before relying on it.

### 4.9 Storage

```sql
insert into storage.buckets (id, name, public) values ('fuel-receipts','fuel-receipts', false);
insert into storage.buckets (id, name, public) values ('bus-photos','bus-photos', true);
```

Upload receipts server-side with the service-role key and hand the client a
signed URL; receipts are financial records and should not be publicly listable.

### 4.10 Verify the migration

```sql
select count(*) from public.fleet_bus_status;                 -- expect 21
select * from public.fleet_bus_status where state = 'on_trip';
select * from public.fleet_fuel_summary(now() - interval '90 days', now(), null);
```

---

## 5. Application structure

```
app/
  (app)/
    layout.js                  TopBar + BottomNav + notification bell
    page.js                    Dashboard
    frota/page.js              Bus list
    frota/[busId]/page.js      Bus detail: status, fuel history, maintenance
    frota/[busId]/editar/page.js
    frota/novo/page.js
    combustivel/page.js        Refuelling log, filters, "Registar abastecimento"
    relatorios/page.js         Fuel reports + charts + CSV export
    manutencao/page.js         Maintenance board (open / scheduled / done)
    notificacoes/page.js       Notification feed
    configuracoes/page.js      Fuel price + app settings
  api/
    buses/route.js             GET list · POST create
    buses/[id]/route.js        GET · PATCH · DELETE→deactivate only
    fuel/route.js              GET list (filters) · POST log a refuelling
    fuel/[id]/route.js         PATCH · DELETE (admin only)
    fuel/upload/route.js       POST receipt → storage, returns signed URL
    maintenance/route.js       GET · POST
    maintenance/[id]/route.js  PATCH (status, cost, resolve)
    reports/fuel/route.js      GET → fleet_fuel_summary / fleet_fuel_monthly
    reports/export/route.js    GET → CSV
    settings/fuel-price/route.js  GET current + history · POST new price (admin)
    notifications/route.js     GET feed + unread count
    notifications/read/route.js POST mark read
    push/subscribe/route.js    POST save this device's subscription
    push/test/route.js         POST send a test push to the caller (§7.2f)
  login/page.js
lib/
  auth.js, supabase-admin.js, session.js …   (copied from nawasoft-pwa)
  fleet.js          queries over fleet_bus_status
  fuel.js           consumption maths, validation, price lookup
  maintenance.js
  notifications.js
  push.js           client: permission, subscribe, iOS standalone check
  push-server.js    server: web-push fan-out, prunes dead subscriptions
components/
  BusCard.jsx, BusStateBadge.jsx, FuelLogSheet.jsx, MaintenanceSheet.jsx,
  StatTile.jsx, FuelChart.jsx, NotificationBell.jsx, NotificationList.jsx,
  PrintHeader.jsx  (print-only report header — §6.5)
tests/
  fuel.test.js            consumption maths (pure, no aliases — see §9)
  maintenance.test.js
```

Every API route starts with the same two lines:

```js
const auth = await requireStaff();
if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
```

---

## 6. Screens

### 6.1 Dashboard
Stat tiles: buses on the road now · idle · needs maintenance · out of service ·
fuel spend this month (with % change on last) · litres this month.
Below: buses currently on a trip with route and ETA; open maintenance ordered by
severity; the five most recent refuellings.

### 6.2 Fleet list (`/frota`)
Card per bus: plate, make/model, capacity, and a state badge —
**Em viagem** (blue) · **Disponível** (green) · **Manutenção** (amber) ·
**Fora de serviço** (grey). Filter by state, search by plate. Add bus button.

### 6.3 Refuelling entry — the most-used screen
Optimise for a phone at a filling station:

- Bus picker (recent first), litres, price/litre, total.
- **Auto-fill the third value from the other two**, and let any one be edited.
- Odometer, prefilled with the last reading for that bus and validated as
  greater than it — warn, don't block, since odometers get replaced.
- Full tank toggle (defaults on; consumption maths depends on it — §4.7).
- Price/litre is prefilled from the configured price (§4.3, 420 Kz/L today) and
  stays editable — a station charging off-rate is normal. Leaving price and
  total blank is fine: the trigger derives them.
- Station, driver, optional receipt photo, notes.
- On save show the consumption since the previous fill, if derivable.

### 6.4 Bus detail
Header with live state. Tabs: **Resumo** (specs, next departure, lifetime fuel
cost, average L/100 km) · **Combustível** (history + per-bus chart) ·
**Manutenção** (issue history).
Actions: edit, report maintenance, and retire/reactivate — which must warn
plainly: *"Desativar remove este autocarro da venda de bilhetes imediatamente."*

### 6.5 Reports (`/relatorios`)
Period picker (this month / last month / 90 days / custom), optional per-bus
filter. Table from `fleet_fuel_summary`: fills, litres, cost, km, L/100 km,
Kz/km. Monthly bar chart from `fleet_fuel_monthly`. CSV export.
Highlight buses whose L/100 km is more than 20 % above fleet average — that is
usually a mechanical fault or fuel theft, and it is the single most valuable
number this app produces.

#### Printing and PDF

Every report must be printable and saveable as PDF. **No PDF library is needed**
— `window.print()` opens the browser's own dialog, which offers *Save as PDF* on
desktop, on Android Chrome, and on iOS (Share → Print → Save to Files). It
renders the real DOM, so the report always matches what is on screen.

Put an **Imprimir / Guardar como PDF** button on `/relatorios` (and on a bus's
fuel history) calling `window.print()`. The whole job is then CSS:

```css
/* globals.css */
@media print {
  @page { size: A4; margin: 14mm 12mm; }

  /* Chrome drops backgrounds by default; force the few that carry meaning. */
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  body { background: #fff; color: #000; font-size: 11pt; }

  /* Chrome and app furniture never belong on paper. */
  .no-print, nav, header.app-bar, .bottom-nav,
  button, .filters, .toast { display: none !important; }

  .print-only { display: block !important; }

  /* Flatten the mobile card look into something that reads as a document. */
  .card { box-shadow: none !important; border: 1px solid #ccc; border-radius: 0; }

  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 4pt 6pt; text-align: left; }

  /* Repeat the header on every page and never split a row across pages. */
  thead { display: table-header-group; }
  tr, .avoid-break { break-inside: avoid; }

  h2, h3 { break-after: avoid; }
  a[href]::after { content: ""; }   /* no URL noise after links */
}

.print-only { display: none; }
```

A `<PrintHeader />` rendered with `className="print-only"` supplies what a
printed page needs and the screen does not:

- company name and logo (`companies.logo_url`)
- report title and the exact period covered
- generated-at, formatted in `Africa/Luanda` — **never a raw UTC timestamp**
- who generated it (`auth.profile` first/last name)
- for a filtered report, the filter in words ("Apenas LDA-10-47-AR")

Two things that will otherwise bite:

- **Draw charts as inline SVG, not `<canvas>`.** Canvas frequently prints blank.
  SVG also stays sharp in the PDF.
- A totals row belongs in `<tfoot>`, so it survives pagination sensibly.

CSV stays alongside for spreadsheets — `/api/reports/export` with
`Content-Disposition: attachment`. Use `;` as the delimiter and a UTF-8 BOM, or
Excel in a pt-PT locale will mangle the accents and put every row in one column.

### 6.6 Settings (`/configuracoes`)

**Preço do gasóleo.** Shows the price in force (420 Kz/L at launch) and the
history of changes with dates and who made each one. Setting a new price inserts
a row — it never edits the old one, so past reports keep saying what was actually
paid. Admin only; agents see the current price read-only.

Make the consequence visible when saving: *"Novos abastecimentos passam a usar
420 → 450 Kz/L. Registos anteriores não mudam."*

An `effective_from` in the future is allowed and useful — a price rise announced
today and applied Monday can be entered once.

Two prices cannot share an `effective_from` (the unique constraint in §4.3 is
`nulls not distinct` precisely so this is rejected rather than silently
ambiguous). If someone re-sets the price the same second, surface the constraint
error as *"Já existe um preço com esta data de início."*

### 6.7 Drivers
If you expose the app to `role = 'driver'`: they may log a refuelling and report
maintenance for buses they are assigned to, and see nothing else. Keep it behind
the same `requireStaff`-style gate with its own role list.

---

## 7. Notifications

Two layers. Build the first; the second is an enhancement.

### 7.1 In-app realtime feed (build this — works everywhere)

A bell in the top bar with an unread count. On mount, fetch recent
notifications, then subscribe:

```js
const channel = supabase
  .channel('fleet-notifications')
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'fleet_notifications' },
      ({ new: row }) => prepend(row))
  .subscribe();
return () => { supabase.removeChannel(channel); };
```

Unread = notifications with no matching row in `fleet_notification_reads` for
this user. The database triggers in §4.5 already create the rows, so refuelling
and maintenance notify everyone with no extra application code.

### 7.2 Web Push — background delivery

Push is what makes a notification arrive when the app is closed. The in-app feed
above covers the app-open case; this covers the rest.

**The VAPID keys are already generated** — `nawa-frotas/.env.vapid`. They were
verified to encrypt and sign a real payload (aes128gcm). Copy all three lines
into `.env.local` and set them in Vercel. Do not regenerate them: every existing
subscription is bound to that public key and would silently stop working.

Add `web-push` to dependencies.

#### a. Service worker handlers

The `sw.js` copied from `nawasoft-pwa` does caching only. Append:

```js
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }

  event.waitUntil(self.registration.showNotification(data.title || 'Nawa-frotas', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Same tag => a second notification about one bus replaces the first
    // instead of stacking. renotify makes the device alert again anyway.
    tag: data.tag || 'nawa-frotas',
    renotify: true,
    data: { url: data.url || '/notificacoes' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/notificacoes';

  // Focus a tab that is already open rather than piling up new windows.
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes(new URL(target, self.location.origin).pathname) && 'focus' in c) {
        return c.focus();
      }
    }
    const open = all.find((c) => 'focus' in c);
    if (open) { await open.focus(); return open.navigate(target); }
    return clients.openWindow(target);
  })());
});
```

#### b. Subscribing, from a user gesture

Permission requested on page load is denied by default in Chrome and ignored on
iOS. It must come from a tap — an "Ativar notificações" button in Configurações.

```js
// lib/push.js
function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** iOS delivers push only to an installed PWA — detect it to explain why. */
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('Este dispositivo não suporta notificações.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notificações bloqueadas. Ative-as nas definições do navegador.');
  }

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
  });

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error('Não foi possível registar este dispositivo.');
  return sub;
}
```

#### c. Storing the subscription

```js
// app/api/push/subscribe/route.js
export async function POST(request) {
  const auth = await requireStaff();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sub = await request.json().catch(() => ({}));
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: 'Subscrição inválida.' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  // endpoint is unique: re-subscribing on the same device updates, never duplicates.
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: auth.user.id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: request.headers.get('user-agent'),
  }, { onConflict: 'endpoint' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

#### d. Fan-out

```js
// lib/push-server.js  — server only, never imported by a client component
import webpush from 'web-push';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

/** Sends to every registered device, dropping the ones that are gone. */
export async function pushToAll({ title, body, url, tag }, { exceptUserId } = {}) {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth');
  // Don't notify the person who just did the thing.
  if (exceptUserId) query = query.neq('user_id', exceptUserId);

  const { data: subs, error } = await query;
  if (error) throw error;

  const payload = JSON.stringify({ title, body, url, tag });
  const dead = [];

  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      );
    } catch (err) {
      // 404/410 = the browser threw the subscription away. Anything else is
      // transient (offline device, push service hiccup) — leave it alone.
      if (err.statusCode === 404 || err.statusCode === 410) dead.push(s.id);
    }
  }));

  if (dead.length) await supabase.from('push_subscriptions').delete().in('id', dead);
  return { sent: (subs?.length || 0) - dead.length, pruned: dead.length };
}
```

#### e. Firing it

The database trigger writes the `fleet_notifications` row (§4.5), which drives
the in-app feed. Push is sent from the API route that caused it, right after the
write succeeds:

```js
// in POST /api/fuel, after the insert
try {
  await pushToAll({
    title: plate + ' abastecido',
    body: formatLitres(litres) + ' · ' + formatKz(total),
    url: '/frota/' + busId,
    tag: 'fuel-' + busId,
  }, { exceptUserId: auth.user.id });
} catch (err) {
  // The refuelling is what matters; a failed push must never fail the write.
  console.error('push falhou', err);
}
```

> An alternative is a Supabase Database Webhook on `fleet_notifications` calling
> `/api/push/send`, which would also cover rows created outside the app. It is
> more moving parts; since every write here goes through these API routes, the
> direct call is simpler and easier to debug. Choose one — doing both sends
> everything twice.

#### f. Make it testable

Add `POST /api/push/test` that pushes *"Notificação de teste — Nawa-frotas está a
funcionar."* to the caller's own devices, and a button for it in Configurações.
Without this, diagnosing a silent push on someone's phone is guesswork.

#### g. Limits to design around — verify on a real device

- **iOS: only an installed PWA receives push** (Add to Home Screen, iOS 16.4+).
  In a normal Safari tab it never fires. Detect with `isStandalone()` and, when
  false on iOS, show *"Para receber notificações, adicione a app ao ecrã
  principal."* rather than a button that cannot work.
- Permission must come from a user gesture.
- Push requires HTTPS (localhost is exempt) — so test on the Vercel preview, not
  over a LAN IP.
- A subscription is per browser *and* per device. The same person on a phone and
  a desktop is two rows, which is intended.
- Bumping the service worker `VERSION` does not invalidate subscriptions; they
  survive deploys.
- **Test the real path before calling it done:** install on an Android phone,
  close the app fully, have someone log a refuelling, confirm the notification
  arrives and that tapping it opens that bus's page.

## 8. PWA

### 8.1 Theme — green

Nawa-frotas is green. Copy `nawasoft-pwa/app/globals.css` and swap the token
block; every component in the UI kit reads these variables, so nothing else
needs touching.

```css
:root {
  --radius: 1.1rem;

  /* Fleet green — light */
  --background: oklch(0.985 0.012 150);
  --surface: oklch(1 0 0);
  --surface-2: oklch(0.97 0.016 150);
  --foreground: oklch(0.20 0.030 155);
  --muted: oklch(0.955 0.018 150);
  --muted-foreground: oklch(0.47 0.030 155);
  --border: oklch(0.90 0.020 150);
  --primary: oklch(0.52 0.130 152);          /* ≈ #15803D */
  --primary-foreground: oklch(0.99 0.010 150);
  --accent: oklch(0.72 0.150 160);
  --accent-foreground: oklch(0.20 0.040 155);
  --success: oklch(0.62 0.150 145);
  --success-foreground: oklch(0.99 0.010 150);
  --info: oklch(0.58 0.140 240);             /* blue — "em viagem" */
  --info-foreground: oklch(0.99 0.010 240);
  --warning: oklch(0.79 0.155 78);
  --warning-foreground: oklch(0.24 0.050 60);
  --danger: oklch(0.577 0.215 27);
  --danger-foreground: oklch(0.99 0.010 27);
  --ring: oklch(0.52 0.130 152);
  --shadow-color: 150 30% 25%;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: oklch(0.155 0.018 155);
    --surface: oklch(0.205 0.022 155);
    --surface-2: oklch(0.250 0.025 155);
    --foreground: oklch(0.96 0.014 150);
    --muted: oklch(0.255 0.020 155);
    --muted-foreground: oklch(0.72 0.025 150);
    --border: oklch(0.32 0.025 155);
    --primary: oklch(0.68 0.150 152);
    --primary-foreground: oklch(0.15 0.020 155);
    --accent: oklch(0.76 0.150 160);
    --accent-foreground: oklch(0.15 0.030 155);
    --success: oklch(0.70 0.150 145);
    --success-foreground: oklch(0.13 0.020 150);
    --info: oklch(0.70 0.130 240);
    --info-foreground: oklch(0.13 0.020 240);
    --warning: oklch(0.76 0.150 75);
    --warning-foreground: oklch(0.15 0.030 60);
    --danger: oklch(0.66 0.200 27);
    --danger-foreground: oklch(0.12 0.020 27);
    --ring: oklch(0.68 0.150 152);
  }
}
```

Register `--info` alongside the others in the `@theme` block (`--color-info:
var(--info);`) or Tailwind will not emit `bg-info` / `text-info-foreground`.

**Why `--info` is new:** NAWASOFT has no blue token, and here the primary *is*
green — so "Disponível" (green) and a green brand button would blur together.
State badges therefore read: **Em viagem** `info` (blue) · **Disponível**
`success` (green) · **Manutenção** `warning` (amber) · **Fora de serviço**
`muted` (grey). Pair every one with its `-foreground` token; `text-warning` on a
pale background fails contrast (a real bug already hit in `nawasoft-pwa`).

### 8.2 Installability

- Copy `sw.js`, `offline.html`, `manifest.webmanifest`; rename caches
  `nawafrotas-*` and bump `VERSION` on every deploy or clients keep stale assets.
- Manifest: `name` "Nawa-frotas", `lang: "pt"`, `display: "standalone"`,
  `orientation: "portrait-primary"`, `theme_color: "#15803D"`,
  `background_color: "#F3FAF5"`. The green is deliberate — NAWASOFT is orange
  (`#C1571F`), so the two are told apart at a glance on a home screen.
- Icons: draw `scripts/icon-any.svg` and `scripts/icon-maskable.svg`, run
  `npm run icons`.
- **Offline refuelling queue**: a station often has no signal. Hold the entry in
  IndexedDB and flush it when back online (Background Sync where available,
  otherwise on next load). Show pending entries as such. This is the one piece of
  genuine offline write support the app needs — everything else can be read-only
  offline.

---

## 9. Testing

`npm test` → `node --test`, wired to `prebuild` so a failing test blocks the
build. Cover the logic that is easy to get wrong and invisible when wrong:

- litres ↔ price ↔ total auto-fill, including rounding
- L/100 km between two fills, and that a missing/rolled-back odometer yields
  null rather than a nonsense number
- partial fills excluded from consumption
- capacity-reduction guard from §2.1
- `fleet_bus_status` state precedence: inactive > maintenance > on trip > idle

> **Alias caveat.** The test runner cannot import modules that use `@/` paths —
> this already limits `nawasoft-pwa`. Either keep pure logic in alias-free
> modules (as `lib/passenger-list.js` does there), or make the runner
> alias-aware from the start with a small `--import` loader. Prefer the latter;
> it is about ten lines and avoids the problem spreading.

Verify against live data before calling it done:

```sql
select state, count(*) from public.fleet_bus_status group by state;
```

---

## 10. Build order

1. Scaffold from `nawasoft-pwa`, get login + staff gate working. **Test auth in a
   real browser** — cookie and middleware bugs do not show up in `curl`.
2. ~~Apply the migration~~ — **already done** (§4). Confirm with §4.10 and move on.
3. Fleet list + bus detail, read-only, off `fleet_bus_status`.
4. Add/edit bus, **with the capacity guard from §2.1**.
5. Refuelling entry + log. This is the core; make it excellent.
6. Reports and charts.
7. Maintenance board, including the bus-offline confirmation.
8. Notifications: in-app realtime feed first, then push.
9. PWA polish: icons, offline queue, install prompt.
10. Deploy to Vercel as its own project with the four env vars.

---

## 11. Gotchas

- **Never delete a bus, a fuel log tied to a real receipt, or a maintenance
  record.** Deactivate or cancel.
- The service-role key bypasses RLS entirely. It must never reach the browser —
  only `NEXT_PUBLIC_*` vars do.
- Reads are cheap; ground yourself in real rows before writing. Writes touching
  `buses` are production changes affecting live ticket sales.
- Kz, not USD, whatever an old column is called. New columns end `_kz`.
- `Africa/Luanda` everywhere; never render a raw UTC timestamp.
- On Windows/Git Bash, `/tmp` resolves differently for bash and for a native
  `node` process — write scratch files to an explicit path.
- Bump the service worker `VERSION` on every deploy.

---

## 12. Done when

- [ ] Install to a phone home screen; opens standalone, works offline read-only.
- [ ] All 21 buses listed with correct live state; a bus mid-journey shows
      **Em viagem** with its route.
- [ ] Add a bus, edit it, retire it, bring it back — and capacity cannot be cut
      below a sold seat.
- [ ] Log a refuelling with a receipt photo; it appears instantly for another
      signed-in user without a refresh.
- [ ] Two fills with odometer readings produce a correct L/100 km.
- [ ] Reports return real totals for a chosen period and export to CSV.
- [ ] A report prints cleanly to A4 and saves as PDF from a phone — no nav bars,
      table headers repeated, chart visible, Luanda-time generated-at stamp.
- [ ] Changing the fuel price from 420 Kz/L applies to new fills only; earlier
      fills and past reports are unchanged.
- [ ] The app is green (`#15803D`), and **Em viagem** (blue) is clearly distinct
      from **Disponível** (green) at a glance.
- [ ] Raise maintenance → everyone is notified; taking a bus offline warns about
      ticket sales first and is reflected on the public site.
- [ ] **Push works on a real device**: install on Android, close the app fully,
      have someone else log a refuelling, and the notification arrives — tapping
      it opens that bus's page. On iOS, confirm it works installed and that the
      uninstalled case explains itself instead of offering a dead button.
- [ ] `/api/push/test` delivers to the caller's own devices.
- [ ] **Every visible string is European Portuguese** (§2.5) — no English in
      buttons, empty states, errors, toasts, notifications, the manifest, CSV
      headers or printed reports. No Brazilian forms (*ônibus*, *placa*,
      *salvar*, *carregando*).
- [ ] `npm test` passes and `npm run build` is clean.
- [ ] No ticketing regression: sell a ticket in `nawasoft-pwa` afterwards and
      confirm seat maps and capacity are unchanged.

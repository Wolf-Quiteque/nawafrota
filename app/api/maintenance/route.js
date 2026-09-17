import { NextResponse } from 'next/server';
import { requireFleetUser, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { denied, badRequest, serverError, friendlyDbError, intParam } from '@/lib/api';
import { validateMaintenance, severityLabel, OPEN_STATUSES } from '@/lib/maintenance';
import { pushQuietly } from '@/lib/push-server';

const SELECT =
  'id, bus_id, title, description, severity, status, reported_at, scheduled_for, completed_at, ' +
  'cost_kz, odometer_km, workshop, takes_bus_offline, reported_by, resolved_by, updated_at, ' +
  'bus:buses!inner(id, license_plate, make, model, company_id, is_active), ' +
  'reporter:profiles!bus_maintenance_reported_by_fkey(first_name, last_name), ' +
  'resolver:profiles!bus_maintenance_resolved_by_fkey(first_name, last_name)';

export async function GET(request) {
  const auth = await requireFleetUser();
  if (auth.error) return denied(auth);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const busId = searchParams.get('bus_id');
  const limit = intParam(searchParams, 'limit', 100, { min: 1, max: 500 });

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from('bus_maintenance')
    .select(SELECT)
    .order('reported_at', { ascending: false })
    .limit(limit);

  const scope = companyScope(auth.profile);
  if (scope) query = query.eq('bus.company_id', scope);
  if (busId) query = query.eq('bus_id', busId);
  if (status === 'open') query = query.in('status', OPEN_STATUSES);
  else if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return serverError(error);
  return NextResponse.json({ issues: data || [] });
}

export async function POST(request) {
  const auth = await requireFleetUser();
  if (auth.error) return denied(auth);

  const body = await request.json().catch(() => ({}));
  const { valid, errors } = validateMaintenance(body);
  if (!valid) return badRequest('Verifique os campos assinalados.', errors);

  const supabase = createSupabaseAdminClient();
  const { data: bus } = await supabase
    .from('buses')
    .select('id, license_plate, company_id')
    .eq('id', body.bus_id)
    .maybeSingle();
  if (!bus) return badRequest('Autocarro não encontrado.', { bus_id: 'Inválido.' });

  const scope = companyScope(auth.profile);
  if (scope && bus.company_id !== scope) {
    return NextResponse.json({ error: 'Sem acesso a este autocarro.' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('bus_maintenance')
    .insert({
      bus_id: bus.id,
      title: String(body.title).trim(),
      description: body.description?.trim() || null,
      severity: body.severity || 'medium',
      status: 'open',
      scheduled_for: body.scheduled_for || null,
      odometer_km: body.odometer_km ? Number(body.odometer_km) : null,
      workshop: body.workshop?.trim() || null,
      cost_kz: body.cost_kz ? Number(body.cost_kz) : null,
      // §4.4 — this flag records the intent, and nothing more. Pulling the bus
      // from sale is a separate, always-confirmed call (PATCH /api/buses/[id]),
      // because flipping buses.is_active stops ticket sales immediately and
      // must never happen as a side effect of filing a fault report.
      takes_bus_offline: Boolean(body.takes_bus_offline),
      reported_by: auth.user.id,
    })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });

  await pushQuietly(
    {
      title: `${bus.license_plate} precisa de manutenção`,
      body: `${severityLabel(data.severity)} · ${data.title}`,
      url: `/frota/${bus.id}`,
      tag: `maint-${bus.id}`,
    },
    { exceptUserId: auth.user.id }
  );

  return NextResponse.json({ issue: data }, { status: 201 });
}

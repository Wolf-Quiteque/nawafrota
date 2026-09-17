import { NextResponse } from 'next/server';
import { requireStaff, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { denied, badRequest, friendlyDbError } from '@/lib/api';
import { STATUSES, SEVERITIES, statusTransition } from '@/lib/maintenance';
import { pushQuietly } from '@/lib/push-server';

export async function PATCH(request, { params }) {
  const auth = await requireStaff();
  if (auth.error) return denied(auth);

  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const { data: issue } = await supabase
    .from('bus_maintenance')
    .select('id, bus_id, status, title, bus:buses!inner(id, license_plate, company_id)')
    .eq('id', id)
    .maybeSingle();
  if (!issue) return NextResponse.json({ error: 'Registo não encontrado.' }, { status: 404 });

  const scope = companyScope(auth.profile);
  if (scope && issue.bus.company_id !== scope) {
    return NextResponse.json({ error: 'Sem acesso a este registo.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const patch = {};

  if (body.status !== undefined) {
    if (!STATUSES[body.status]) return badRequest('Estado inválido.', { status: 'Inválido.' });
    // statusTransition stamps completed_at and resolved_by together — the
    // notify_maintenance trigger reads resolved_by when it fires on
    // status -> 'done' (§4.5), so the two must never drift apart.
    Object.assign(patch, statusTransition(body.status, auth.user.id));
  }
  if (body.severity !== undefined) {
    if (!SEVERITIES[body.severity]) return badRequest('Gravidade inválida.', { severity: 'Inválida.' });
    patch.severity = body.severity;
  }
  if (body.title !== undefined) {
    patch.title = String(body.title).trim();
    if (!patch.title) return badRequest('Descreva a avaria.', { title: 'Obrigatório.' });
  }
  if (body.description !== undefined) patch.description = body.description?.trim() || null;
  if (body.scheduled_for !== undefined) patch.scheduled_for = body.scheduled_for || null;
  if (body.workshop !== undefined) patch.workshop = body.workshop?.trim() || null;
  if (body.odometer_km !== undefined) {
    patch.odometer_km =
      body.odometer_km === '' || body.odometer_km === null ? null : Number(body.odometer_km);
  }
  if (body.cost_kz !== undefined) {
    const cost = body.cost_kz === '' || body.cost_kz === null ? null : Number(body.cost_kz);
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      return badRequest('O custo não pode ser negativo.', { cost_kz: 'Inválido.' });
    }
    patch.cost_kz = cost;
  }
  if (body.takes_bus_offline !== undefined) patch.takes_bus_offline = Boolean(body.takes_bus_offline);

  if (!Object.keys(patch).length) return NextResponse.json({ issue });

  const { data, error } = await supabase
    .from('bus_maintenance')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });

  if (patch.status === 'done' && issue.status !== 'done') {
    await pushQuietly(
      {
        title: `${issue.bus.license_plate} — manutenção concluída`,
        body: data.title,
        url: `/frota/${issue.bus_id}`,
        tag: `maint-${issue.bus_id}`,
      },
      { exceptUserId: auth.user.id }
    );
  }

  return NextResponse.json({ issue: data });
}

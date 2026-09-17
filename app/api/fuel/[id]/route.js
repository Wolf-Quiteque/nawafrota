import { NextResponse } from 'next/server';
import { requireStaff, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { denied, badRequest, friendlyDbError } from '@/lib/api';
import { parseAmount, validateFuelEntry } from '@/lib/fuel';

async function loadLog(supabase, id) {
  const { data } = await supabase
    .from('bus_fuel_logs')
    .select('id, bus_id, company_id, receipt_url, recorded_by, bus:buses!inner(company_id)')
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function PATCH(request, { params }) {
  const auth = await requireStaff();
  if (auth.error) return denied(auth);

  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const log = await loadLog(supabase, id);
  if (!log) return NextResponse.json({ error: 'Abastecimento não encontrado.' }, { status: 404 });

  const scope = companyScope(auth.profile);
  if (scope && log.bus.company_id !== scope) {
    return NextResponse.json({ error: 'Sem acesso a este registo.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { valid, errors } = validateFuelEntry({ bus_id: log.bus_id, ...body });
  if (!valid) return badRequest('Verifique os campos assinalados.', errors);

  const patch = {};
  // An edit is explicit about every amount it touches. Unlike the insert, a
  // blank price here is not "derive it" — the trigger is BEFORE INSERT only,
  // so nulling a price on an update would leave the row inconsistent.
  if (body.litres !== undefined) patch.litres = parseAmount(body.litres);
  if (body.price_per_litre_kz !== undefined) patch.price_per_litre_kz = parseAmount(body.price_per_litre_kz);
  if (body.total_cost_kz !== undefined) patch.total_cost_kz = parseAmount(body.total_cost_kz);
  if (body.odometer_km !== undefined) patch.odometer_km = parseAmount(body.odometer_km);
  if (body.station !== undefined) patch.station = body.station?.trim() || null;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;
  if (body.driver_id !== undefined) patch.driver_id = body.driver_id || null;
  if (body.is_full_tank !== undefined) patch.is_full_tank = Boolean(body.is_full_tank);
  if (body.filled_at !== undefined) patch.filled_at = body.filled_at;
  if (body.receipt_url !== undefined) patch.receipt_url = body.receipt_url || null;

  if (patch.total_cost_kz === null) {
    return badRequest('O total é obrigatório.', { total_cost_kz: 'Obrigatório.' });
  }

  const { data, error } = await supabase
    .from('bus_fuel_logs')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });
  return NextResponse.json({ fuelLog: data });
}

/**
 * A fuel log is tied to a real receipt and is financial evidence, so deleting
 * one stays a destructive act for correcting a mistaken or duplicated entry,
 * never routine cleanup (§11).
 *
 * Admins may remove any of them. An agent may remove one they recorded
 * themselves: the person who mistyped a fill is the one who notices, and
 * making them find an admin to undo their own mistake means the wrong number
 * sits in the fuel figures until someone gets round to it. Someone else's row
 * is still not theirs to delete.
 */
export async function DELETE(request, { params }) {
  const auth = await requireStaff();
  if (auth.error) return denied(auth);

  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const log = await loadLog(supabase, id);
  if (!log) return NextResponse.json({ error: 'Abastecimento não encontrado.' }, { status: 404 });

  const scope = companyScope(auth.profile);
  if (scope && log.bus.company_id !== scope) {
    return NextResponse.json({ error: 'Sem acesso a este registo.' }, { status: 403 });
  }

  if (auth.profile.role !== 'admin' && log.recorded_by !== auth.user.id) {
    return NextResponse.json(
      { error: 'Só pode apagar abastecimentos que registou. Peça a um administrador.' },
      { status: 403 }
    );
  }

  const { error } = await supabase.from('bus_fuel_logs').delete().eq('id', id);
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });

  // The receipt goes with it — an orphaned private object nobody can reach
  // again is just cost.
  if (log.receipt_url) {
    await supabase.storage.from('fuel-receipts').remove([log.receipt_url]).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

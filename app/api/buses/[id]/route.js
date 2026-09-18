import { NextResponse } from 'next/server';
import { requireStaff, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { denied, badRequest, serverError, friendlyDbError } from '@/lib/api';
import { getBusStatus, maxSoldSeatForBus } from '@/lib/queries';
import { checkCapacityChange } from '@/lib/fleet';

export async function GET(request, { params }) {
  const auth = await requireStaff();
  if (auth.error) return denied(auth);

  const { id } = await params;
  try {
    const bus = await getBusStatus(id, companyScope(auth.profile));
    if (!bus) return NextResponse.json({ error: 'Autocarro não encontrado.' }, { status: 404 });

    const supabase = createSupabaseAdminClient();
    const [{ data: raw }, maxSoldSeat] = await Promise.all([
      supabase.from('buses').select('amenities, created_at').eq('id', id).maybeSingle(),
      maxSoldSeatForBus(id),
    ]);

    return NextResponse.json({ bus: { ...bus, ...raw }, maxSoldSeat });
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(request, { params }) {
  const auth = await requireStaff();
  if (auth.error) return denied(auth);

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = createSupabaseAdminClient();

  const { data: bus, error: busError } = await supabase
    .from('buses')
    .select('id, company_id, capacity, license_plate, make, model, year, amenities, is_active')
    .eq('id', id)
    .maybeSingle();
  if (busError) return serverError(busError);
  if (!bus) return NextResponse.json({ error: 'Autocarro não encontrado.' }, { status: 404 });

  const scope = companyScope(auth.profile);
  if (scope && bus.company_id !== scope) {
    return NextResponse.json({ error: 'Sem acesso a este autocarro.' }, { status: 403 });
  }

  const patch = {};
  if (body.license_plate !== undefined) {
    const plate = String(body.license_plate).trim().toUpperCase();
    if (!plate) return badRequest('Indique a matrícula.', { license_plate: 'Obrigatório.' });
    if (plate !== bus.license_plate) patch.license_plate = plate;
  }
  if (body.make !== undefined) {
    const make = String(body.make || '').trim();
    if (!make) return badRequest('Indique a marca.', { make: 'Obrigatório.' });
    if (make !== bus.make) patch.make = make;
  }
  if (body.model !== undefined) {
    const model = String(body.model || '').trim();
    if (!model) return badRequest('Indique o modelo.', { model: 'Obrigatório.' });
    if (model !== bus.model) patch.model = model;
  }
  if (body.year !== undefined) {
    const year = body.year === null || body.year === '' ? null : Number(body.year);
    if (year !== null && (!Number.isInteger(year) || year < 1950 || year > 2100)) {
      return badRequest('Indique um ano válido.', { year: 'Ano inválido.' });
    }
    if (year !== bus.year) patch.year = year;
  }
  if (body.amenities !== undefined) {
    const amenities = Array.isArray(body.amenities) ? body.amenities : null;
    if (JSON.stringify(amenities) !== JSON.stringify(bus.amenities)) patch.amenities = amenities;
  }

  // §2.1 — the guard that protects live ticket sales. Capacity may never drop
  // below a seat already sold on a future trip, and the refusal has to name the
  // seat that blocks it.
  if (body.capacity !== undefined && (!Number.isInteger(Number(body.capacity)) || Number(body.capacity) < 1)) {
    return badRequest('Indique uma lotação válida.', { capacity: 'Lotação inválida.' });
  }
  if (body.capacity !== undefined && Number(body.capacity) !== bus.capacity) {
    const maxSoldSeat = await maxSoldSeatForBus(id);
    const check = checkCapacityChange(body.capacity, maxSoldSeat);
    if (!check.allowed) return badRequest(check.error, { capacity: check.error });
    patch.capacity = Number(body.capacity);
  }

  // Deactivating pulls the bus from the public site immediately (§2.1), so it
  // is only ever an explicit, separately-confirmed action — see DELETE below.
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);

  if (!Object.keys(patch).length) return NextResponse.json({ bus });

  const { data, error } = await supabase
    .from('buses')
    .update(patch)
    .eq('id', id)
    .select('id, license_plate, capacity, is_active')
    .single();

  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });
  return NextResponse.json({ bus: data });
}

/**
 * Retire, never delete (§2.1). A real DELETE would orphan every trip pointing
 * at this bus and every ticket sold against those trips, so the route is wired
 * to is_active = false and says so.
 */
export async function DELETE(request, { params }) {
  const auth = await requireStaff();
  if (auth.error) return denied(auth);

  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const { data: bus } = await supabase
    .from('buses')
    .select('id, company_id, license_plate')
    .eq('id', id)
    .maybeSingle();
  if (!bus) return NextResponse.json({ error: 'Autocarro não encontrado.' }, { status: 404 });

  const scope = companyScope(auth.profile);
  if (scope && bus.company_id !== scope) {
    return NextResponse.json({ error: 'Sem acesso a este autocarro.' }, { status: 403 });
  }

  const { error } = await supabase.from('buses').update({ is_active: false }).eq('id', id);
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });

  return NextResponse.json({
    ok: true,
    message: `${bus.license_plate} foi desativado e deixou de estar disponível para venda.`,
  });
}

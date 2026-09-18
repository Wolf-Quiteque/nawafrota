import { NextResponse } from 'next/server';
import { requireStaff, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { denied, badRequest, serverError, friendlyDbError } from '@/lib/api';
import { listBusStatus } from '@/lib/queries';

export async function GET() {
  const auth = await requireStaff();
  if (auth.error) return denied(auth);

  try {
    const buses = await listBusStatus(companyScope(auth.profile));
    return NextResponse.json({ buses });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request) {
  const auth = await requireStaff();
  if (auth.error) return denied(auth);

  const body = await request.json().catch(() => ({}));
  const plate = String(body.license_plate || '').trim().toUpperCase();
  const capacity = Number(body.capacity);
  const make = String(body.make || '').trim();
  const model = String(body.model || '').trim();

  const fields = {};
  if (!plate) fields.license_plate = 'Indique a matrícula.';
  if (!make) fields.make = 'Indique a marca.';
  if (!model) fields.model = 'Indique o modelo.';
  if (!Number.isInteger(capacity) || capacity < 1) fields.capacity = 'Indique a lotação.';
  if (body.year && (!Number.isInteger(Number(body.year)) || Number(body.year) < 1950 || Number(body.year) > 2100)) {
    fields.year = 'Ano inválido.';
  }
  if (Object.keys(fields).length) return badRequest('Verifique os campos assinalados.', fields);

  const supabase = createSupabaseAdminClient();

  // A duplicate plate is a data-entry slip, not an exception — catch it before
  // the insert so the message names the bus that already has it.
  const { data: existing } = await supabase
    .from('buses')
    .select('id')
    .eq('license_plate', plate)
    .maybeSingle();
  if (existing) {
    return badRequest('Já existe um autocarro com esta matrícula.', {
      license_plate: 'Matrícula já registada.',
    });
  }

  // A new bus belongs to the creator's company. A super-admin (no company of
  // their own) must say which one, rather than silently creating an orphan.
  const companyId = body.company_id || auth.profile.company_id;
  if (!companyId) return badRequest('Indique a empresa do autocarro.', { company_id: 'Obrigatório.' });

  const { data, error } = await supabase
    .from('buses')
    .insert({
      company_id: companyId,
      license_plate: plate,
      make,
      model,
      year: body.year ? Number(body.year) : null,
      capacity,
      amenities: Array.isArray(body.amenities) ? body.amenities : null,
      is_active: body.is_active !== false,
    })
    .select('id, license_plate')
    .single();

  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });
  return NextResponse.json({ bus: data }, { status: 201 });
}

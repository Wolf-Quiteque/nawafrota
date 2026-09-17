import { NextResponse } from 'next/server';
import { requireStaff, requireAdmin, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { denied, badRequest, serverError, friendlyDbError } from '@/lib/api';
import { fuelPriceAt } from '@/lib/queries';

export async function GET(request) {
  const auth = await requireStaff();
  if (auth.error) return denied(auth);

  const { searchParams } = new URL(request.url);
  const fuelType = searchParams.get('fuel_type') || 'diesel';
  const companyId = companyScope(auth.profile);

  try {
    const supabase = createSupabaseAdminClient();
    const [current, history] = await Promise.all([
      fuelPriceAt(new Date().toISOString(), companyId, fuelType),
      supabase
        .from('fleet_fuel_prices')
        .select(
          'id, company_id, fuel_type, price_per_litre_kz, effective_from, note, created_at, ' +
            'author:profiles!fleet_fuel_prices_set_by_fkey(first_name, last_name)'
        )
        .eq('fuel_type', fuelType)
        .order('effective_from', { ascending: false })
        .limit(50),
    ]);

    if (history.error) throw history.error;

    const now = Date.now();
    return NextResponse.json({
      current,
      // A price with a future effective_from is legitimate and useful (§6.6) —
      // flagged rather than hidden so the settings screen can say a rise is
      // already scheduled.
      history: (history.data || []).map((row) => ({
        ...row,
        price_per_litre_kz: Number(row.price_per_litre_kz),
        scheduled: new Date(row.effective_from).getTime() > now,
      })),
      canEdit: auth.profile.role === 'admin',
    });
  } catch (err) {
    return serverError(err);
  }
}

/**
 * A price change is an INSERT, never an UPDATE (§4.3): updating would rewrite
 * history and silently change what past reports say was paid.
 */
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return denied(auth);

  const body = await request.json().catch(() => ({}));
  const price = Number(String(body.price_per_litre_kz ?? '').replace(',', '.'));
  if (!Number.isFinite(price) || price <= 0) {
    return badRequest('Indique um preço válido.', { price_per_litre_kz: 'Obrigatório.' });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('fleet_fuel_prices')
    .insert({
      // null = the fleet-wide price. A super-admin sets that; a company admin
      // sets their own company's, which fuel_price_at() prefers over it.
      company_id: companyScope(auth.profile),
      fuel_type: body.fuel_type || 'diesel',
      price_per_litre_kz: price,
      effective_from: body.effective_from || new Date().toISOString(),
      note: body.note?.trim() || null,
      set_by: auth.user.id,
    })
    .select('id, price_per_litre_kz, effective_from')
    .single();

  if (error) {
    // The unique (company_id, fuel_type, effective_from) index is NULLS NOT
    // DISTINCT precisely so this collides rather than leaving two prices
    // silently ambiguous at one instant (§4.3).
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });
  }

  return NextResponse.json({ price: data }, { status: 201 });
}

import { NextResponse } from 'next/server';
import { requireStaff, companyScope } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { denied, serverError, intParam } from '@/lib/api';
import { resolvePeriod } from '@/lib/periods';
import { loadFuelReport } from '@/lib/fuel-report';

export async function GET(request) {
  const auth = await requireStaff();
  if (auth.error) return denied(auth);

  const { searchParams } = new URL(request.url);
  const period = resolvePeriod(searchParams.get('period') || 'this_month', {
    from: searchParams.get('from'),
    to: searchParams.get('to'),
  });
  const busId = searchParams.get('bus_id');
  const months = intParam(searchParams, 'months', 12, { min: 1, max: 36 });
  const companyId = companyScope(auth.profile);

  try {
    const supabase = createSupabaseAdminClient();

    const report = await loadFuelReport({ supabase, period, busId, months, companyId });
    return NextResponse.json(report);
  } catch (err) {
    return serverError(err);
  }
}

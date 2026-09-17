import { redirect } from 'next/navigation';
import { requireStaff, companyScope } from '@/lib/auth';
import { listBusStatus } from '@/lib/queries';
import FrotaView from './FrotaView';

export const metadata = { title: 'Frota' };
export const dynamic = 'force-dynamic';

export default async function FrotaPage() {
  const auth = await requireStaff();
  if (auth.error) redirect('/login');

  // Rendered on the server so the list is on screen before the browser has
  // even booted its JS; FrotaView takes it as initial data and never re-fetches
  // on first paint.
  const buses = await listBusStatus(companyScope(auth.profile));

  return <FrotaView initialBuses={buses} />;
}

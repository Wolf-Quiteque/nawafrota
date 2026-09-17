import { notFound, redirect } from 'next/navigation';
import { requireStaff, companyScope } from '@/lib/auth';
import { getBusStatus, maxSoldSeatForBus } from '@/lib/queries';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import BusForm from '@/components/BusForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { busId } = await params;
  const auth = await requireStaff();
  if (auth.error) return { title: 'Editar autocarro' };
  const bus = await getBusStatus(busId, companyScope(auth.profile));
  return { title: bus ? `Editar ${bus.license_plate}` : 'Editar autocarro' };
}

export default async function EditBusPage({ params }) {
  const { busId } = await params;
  const auth = await requireStaff();
  if (auth.error) redirect('/login');

  const bus = await getBusStatus(busId, companyScope(auth.profile));
  if (!bus) notFound();

  // Read here rather than in the form: the guard has to be enforced against a
  // number the browser cannot influence (§2.1).
  const maxSoldSeat = await maxSoldSeatForBus(busId);

  return (
    <div>
      <BackButton fallbackHref={`/frota/${busId}`} />
      <PageHeader title="Editar autocarro" subtitle={bus.license_plate} />
      <BusForm bus={bus} maxSoldSeat={maxSoldSeat} mode="edit" />
    </div>
  );
}

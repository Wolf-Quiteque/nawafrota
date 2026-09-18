import { notFound, redirect } from 'next/navigation';
import { requireStaff, companyScope } from '@/lib/auth';
import { getBusStatus, maxSoldSeatForBus } from '@/lib/queries';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import BusForm from '@/components/BusForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Editar autocarro' };

export default async function EditBusPage({ params }) {
  const { busId } = await params;
  const auth = await requireStaff();
  if (auth.error) redirect('/login');

  const [bus, maxSoldSeat] = await Promise.all([
    getBusStatus(busId, companyScope(auth.profile)),
    maxSoldSeatForBus(busId),
  ]);
  if (!bus) notFound();

  return (
    <div>
      <BackButton fallbackHref={`/frota/${busId}`} />
      <PageHeader title="Editar autocarro" subtitle={bus.license_plate} />
      <BusForm bus={bus} maxSoldSeat={maxSoldSeat} mode="edit" />
    </div>
  );
}

import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import BusForm from '@/components/BusForm';

export const metadata = { title: 'Adicionar autocarro' };

export default async function NewBusPage() {
  const auth = await requireStaff();
  if (auth.error) redirect('/login');

  return (
    <div>
      <BackButton fallbackHref="/frota" />
      <PageHeader
        title="Adicionar autocarro"
        subtitle="Fica imediatamente disponível para agendar viagens."
      />
      <BusForm mode="create" />
    </div>
  );
}

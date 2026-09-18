import { redirect } from 'next/navigation';
import { requireFleetUser } from '@/lib/auth';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import DriverNav from '@/components/DriverNav';
import OfflineQueueFlusher from '@/components/OfflineQueueFlusher';
import NavigationProgress from '@/components/NavigationProgress';
import ConnectionBanner from '@/components/ConnectionBanner';
import { ToastProvider } from '@/components/ui/Toast';
import { isDriverRole } from '@/lib/session';

export default async function AppLayout({ children }) {
  const { error, profile } = await requireFleetUser();
  if (error) redirect('/login');

  // Drivers get two actions and nothing else (§6.7); the full fleet, reports
  // and settings are the office's.
  const driver = isDriverRole(profile.role);

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-background">
        <NavigationProgress />
        <TopBar profile={profile} />
        <ConnectionBanner />
        <OfflineQueueFlusher />
        <main className="mx-auto max-w-md px-4 pb-28 pt-3">{children}</main>
        {driver ? <DriverNav /> : <BottomNav />}
      </div>
    </ToastProvider>
  );
}

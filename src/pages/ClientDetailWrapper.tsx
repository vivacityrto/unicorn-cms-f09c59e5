import { DashboardLayout } from '@/components/DashboardLayout';
import ClientDetail from './ClientDetail';

export default function ClientDetailWrapper() {
  return (
    <DashboardLayout>
      <ClientDetail />
    </DashboardLayout>
  );
}

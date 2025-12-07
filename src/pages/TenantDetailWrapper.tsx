import { DashboardLayout } from '@/components/DashboardLayout';
import TenantDetail from './TenantDetail';

export default function TenantDetailWrapper() {
  return (
    <DashboardLayout>
      <TenantDetail />
    </DashboardLayout>
  );
}

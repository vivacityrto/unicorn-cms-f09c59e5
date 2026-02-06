import { DashboardLayout } from '@/components/DashboardLayout';
import TenantDocumentsHub from './TenantDocumentsHub';

export default function TenantDocumentsHubWrapper() {
  return (
    <DashboardLayout>
      <TenantDocumentsHub />
    </DashboardLayout>
  );
}

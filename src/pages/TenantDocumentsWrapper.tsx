import { DashboardLayout } from '@/components/DashboardLayout';
import TenantDocuments from './TenantDocuments';

export default function TenantDocumentsWrapper() {
  return (
    <DashboardLayout>
      <TenantDocuments />
    </DashboardLayout>
  );
}

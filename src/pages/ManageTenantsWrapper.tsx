import { DashboardLayout } from '@/components/DashboardLayout';
import ManageTenants from './ManageTenants';

export default function ManageTenantsWrapper() {
  return (
    <DashboardLayout>
      <ManageTenants />
    </DashboardLayout>
  );
}

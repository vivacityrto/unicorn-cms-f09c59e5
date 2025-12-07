import { DashboardLayout } from '@/components/DashboardLayout';
import TenantMembers from './TenantMembers';

export default function TenantMembersWrapper() {
  return (
    <DashboardLayout>
      <TenantMembers />
    </DashboardLayout>
  );
}

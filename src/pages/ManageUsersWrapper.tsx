import { DashboardLayout } from '@/components/DashboardLayout';
import ManageUsers from './ManageUsers';

export default function ManageUsersWrapper() {
  return (
    <DashboardLayout>
      <ManageUsers />
    </DashboardLayout>
  );
}

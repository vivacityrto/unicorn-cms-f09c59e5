import { DashboardLayout } from '@/components/DashboardLayout';
import UserProfile from './UserProfile';

export default function UserProfileWrapper() {
  return (
    <DashboardLayout>
      <UserProfile />
    </DashboardLayout>
  );
}

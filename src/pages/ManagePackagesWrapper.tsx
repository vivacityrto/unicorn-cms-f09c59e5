import { DashboardLayout } from '@/components/DashboardLayout';
import ManagePackages from './ManagePackages';

export default function ManagePackagesWrapper() {
  return (
    <DashboardLayout>
      <ManagePackages />
    </DashboardLayout>
  );
}

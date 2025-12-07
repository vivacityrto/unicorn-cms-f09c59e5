import { DashboardLayout } from '@/components/DashboardLayout';
import PackageDetail from './PackageDetail';

export default function AdminPackageDetailWrapper() {
  return (
    <DashboardLayout>
      <PackageDetail />
    </DashboardLayout>
  );
}

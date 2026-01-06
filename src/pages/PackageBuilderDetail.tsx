import { DashboardLayout } from '@/components/DashboardLayout';
import { PackageBuilderEditor } from '@/components/package-builder/PackageBuilderEditor';

export default function PackageBuilderDetail() {
  return (
    <DashboardLayout>
      <PackageBuilderEditor />
    </DashboardLayout>
  );
}
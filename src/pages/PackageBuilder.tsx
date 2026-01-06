import { DashboardLayout } from '@/components/DashboardLayout';
import { PackageBuilderOverview } from '@/components/package-builder/PackageBuilderOverview';
import { PageHeader } from '@/components/ui/page-header';

export default function PackageBuilder() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Package Builder"
          description="Create and manage packages with reusable stages, tasks, and automated workflows."
        />
        <PackageBuilderOverview />
      </div>
    </DashboardLayout>
  );
}
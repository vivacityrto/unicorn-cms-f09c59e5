import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { EosConfigurationsList } from '@/components/eos/configurations/EosConfigurationsList';

export default function EosConfigurations() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Manage Configurations"
          description="One Configuration per meeting type — agenda, frequency, facilitator seat, and participants, all in one place."
        />
        <EosConfigurationsList />
      </div>
    </DashboardLayout>
  );
}

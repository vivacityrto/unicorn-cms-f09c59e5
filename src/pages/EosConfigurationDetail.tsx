import { DashboardLayout } from '@/components/DashboardLayout';
import { EosConfigurationEditor } from '@/components/eos/configurations/EosConfigurationEditor';

export default function EosConfigurationDetail() {
  return (
    <DashboardLayout>
      <EosConfigurationEditor />
    </DashboardLayout>
  );
}

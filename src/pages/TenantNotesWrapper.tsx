import { DashboardLayout } from '@/components/DashboardLayout';
import TenantNotes from './TenantNotes';

export default function TenantNotesWrapper() {
  return (
    <DashboardLayout>
      <TenantNotes />
    </DashboardLayout>
  );
}
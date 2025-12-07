import { DashboardLayout } from '@/components/DashboardLayout';
import ManageDocuments from './ManageDocuments';

export default function ManageDocumentsWrapper() {
  return (
    <DashboardLayout>
      <ManageDocuments />
    </DashboardLayout>
  );
}

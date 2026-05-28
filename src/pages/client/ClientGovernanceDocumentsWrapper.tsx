import { ClientLayout } from "@/components/layout/ClientLayout";
import { ClientGovernanceDocumentsPage } from "@/components/client/ClientGovernanceDocumentsPage";

export default function ClientGovernanceDocumentsWrapper() {
  return (
    <ClientLayout>
      <ClientGovernanceDocumentsPage />
    </ClientLayout>
  );
}

import { ClientLayout } from "@/components/layout/ClientLayout";
import { ClientDocumentsPage } from "@/components/client/ClientDocumentsPage";

export default function ClientDocumentsWrapper() {
  return (
    <ClientLayout>
      <ClientDocumentsPage />
    </ClientLayout>
  );
}

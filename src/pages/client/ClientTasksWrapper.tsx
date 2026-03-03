import { ClientLayout } from "@/components/layout/ClientLayout";
import ClientTasksPage from "@/pages/ClientTasksPage";

export default function ClientTasksWrapper() {
  return (
    <ClientLayout>
      <ClientTasksPage />
    </ClientLayout>
  );
}

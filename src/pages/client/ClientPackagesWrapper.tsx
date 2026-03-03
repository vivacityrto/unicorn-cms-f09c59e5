import { ClientLayout } from "@/components/layout/ClientLayout";
import ClientPackagesPage from "@/components/client/ClientPackagesPage";

export default function ClientPackagesWrapper() {
  return (
    <ClientLayout>
      <ClientPackagesPage />
    </ClientLayout>
  );
}

import { ClientLayout } from "@/components/layout/ClientLayout";
import { ClientHomePage } from "@/components/client/ClientHomePage";

export default function ClientHomeWrapper() {
  return (
    <ClientLayout>
      <ClientHomePage />
    </ClientLayout>
  );
}

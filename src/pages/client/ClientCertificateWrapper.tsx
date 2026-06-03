import { ClientLayout } from "@/components/layout/ClientLayout";
import { MembershipCertificatePage } from "./MembershipCertificatePage";

export default function ClientCertificateWrapper() {
  return (
    <ClientLayout>
      <MembershipCertificatePage />
    </ClientLayout>
  );
}

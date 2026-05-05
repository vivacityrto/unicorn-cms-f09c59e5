import { ClientLayout } from "@/components/layout/ClientLayout";
import ClientSuggestionsPage from "@/pages/client/ClientSuggestionsPage";

export default function ClientSuggestionsWrapper() {
  return (
    <ClientLayout>
      <ClientSuggestionsPage />
    </ClientLayout>
  );
}

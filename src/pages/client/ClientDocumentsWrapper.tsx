import { ClientLayout } from "@/components/layout/ClientLayout";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Reuse existing ManageDocuments page content but in client layout
const ManageDocuments = lazy(() => import("@/pages/ManageDocuments"));

export default function ClientDocumentsWrapper() {
  return (
    <ClientLayout>
      <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
        <ManageDocuments />
      </Suspense>
    </ClientLayout>
  );
}

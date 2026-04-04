import { ClientLayout } from "@/components/layout/ClientLayout";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const ComplianceManagerPage = lazy(() => import("./ComplianceManagerPage"));

export default function AcademyComplianceManagerWrapper() {
  return (
    <ClientLayout>
      <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
        <ComplianceManagerPage />
      </Suspense>
    </ClientLayout>
  );
}

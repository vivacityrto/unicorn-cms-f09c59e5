import { ClientLayout } from "@/components/layout/ClientLayout";
import AcademyAccessGate from "@/components/academy/AcademyAccessGate";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const AcademyAssessmentResultPage = lazy(() => import("./AcademyAssessmentResultPage"));

export default function AcademyAssessmentResultWrapper() {
  return (
    <ClientLayout>
      <AcademyAccessGate>
        <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
          <AcademyAssessmentResultPage />
        </Suspense>
      </AcademyAccessGate>
    </ClientLayout>
  );
}

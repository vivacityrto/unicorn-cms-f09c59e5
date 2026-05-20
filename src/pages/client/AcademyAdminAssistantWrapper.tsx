import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const AdministrationAssistantPage = lazy(() => import("./AdministrationAssistantPage"));

export default function AcademyAdminAssistantWrapper() {
  return (
    <AcademyLayout>
        <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
          <AdministrationAssistantPage />
        </Suspense>
    </AcademyLayout>
  );
}

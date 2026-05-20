import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const ClientProfilePage = lazy(() => import("@/pages/client/ClientProfilePage"));

export default function AcademyProfileWrapper() {
  return (
    <AcademyLayout>
      <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
        <ClientProfilePage />
      </Suspense>
    </AcademyLayout>
  );
}

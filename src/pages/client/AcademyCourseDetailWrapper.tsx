import { ClientLayout } from "@/components/layout/ClientLayout";
import AcademyAccessGate from "@/components/academy/AcademyAccessGate";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const AcademyCourseDetailPage = lazy(() => import("./AcademyCourseDetailPage"));

export default function AcademyCourseDetailWrapper() {
  return (
    <ClientLayout>
      <AcademyAccessGate>
        <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
          <AcademyCourseDetailPage />
        </Suspense>
      </AcademyAccessGate>
    </ClientLayout>
  );
}

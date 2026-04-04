import { ClientLayout } from "@/components/layout/ClientLayout";
import AcademyAccessGate from "@/components/academy/AcademyAccessGate";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const AcademyDashboardPage = lazy(() => import("./AcademyDashboardPage"));

export default function AcademyDashboardWrapper() {
  return (
    <ClientLayout>
      <AcademyAccessGate>
        <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
          <AcademyDashboardPage />
        </Suspense>
      </AcademyAccessGate>
    </ClientLayout>
  );
}

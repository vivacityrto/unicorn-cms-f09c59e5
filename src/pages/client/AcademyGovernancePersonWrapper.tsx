import { ClientLayout } from "@/components/layout/ClientLayout";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const GovernancePersonPage = lazy(() => import("./GovernancePersonPage"));

export default function AcademyGovernancePersonWrapper() {
  return (
    <ClientLayout>
      <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
        <GovernancePersonPage />
      </Suspense>
    </ClientLayout>
  );
}

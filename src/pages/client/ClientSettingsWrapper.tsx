import { ClientLayout } from "@/components/layout/ClientLayout";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const SettingsPage = lazy(() => import("@/pages/SettingsWrapper"));

export default function ClientSettingsWrapper() {
  return (
    <ClientLayout>
      <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
        <SettingsPage />
      </Suspense>
    </ClientLayout>
  );
}

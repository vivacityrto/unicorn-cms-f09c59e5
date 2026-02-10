import { ClientLayout } from "@/components/layout/ClientLayout";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const ClientNotifications = lazy(() => import("@/pages/ClientNotifications"));

export default function ClientNotificationsWrapper() {
  return (
    <ClientLayout>
      <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
        <ClientNotifications />
      </Suspense>
    </ClientLayout>
  );
}

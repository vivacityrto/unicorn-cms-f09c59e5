import { ClientLayout } from "@/components/layout/ClientLayout";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const ClientCalendar = lazy(() => import("@/pages/ClientCalendar"));

export default function ClientCalendarWrapper() {
  return (
    <ClientLayout>
      <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
        <ClientCalendar />
      </Suspense>
    </ClientLayout>
  );
}

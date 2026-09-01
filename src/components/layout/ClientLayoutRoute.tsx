import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ClientLayout } from "@/components/layout/ClientLayout";

const CLIENT_LOADING_FALLBACK = (
  <div className="flex justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

/**
 * Layout-route element for the nested Client Portal routes in
 * src/routes/clientRoutes.tsx. Lazy-loaded on its own (see that file) so
 * ClientLayout and its dependencies (realtime channel setup, Ask Viv panel,
 * etc.) are not pulled into the main bundle for users who never visit the
 * client portal -- matching how each retired per-page *Wrapper.tsx file
 * used to lazy-load ClientLayout alongside its page component.
 *
 * The inner <Suspense> here (not just the app-level one in App.tsx) is
 * required, not decorative: it is what lets ClientLayout stay mounted while
 * a sibling client-portal page's own lazy chunk loads. Without it, that
 * page-chunk suspense would bubble up to the app-level boundary and unmount
 * this whole subtree -- including ClientLayout, its realtime subscription,
 * and the Ask Viv panel state -- defeating the point of the nested-route
 * conversion.
 */
export default function ClientLayoutRoute() {
  return (
    <ClientLayout>
      <Suspense fallback={CLIENT_LOADING_FALLBACK}>
        <Outlet />
      </Suspense>
    </ClientLayout>
  );
}

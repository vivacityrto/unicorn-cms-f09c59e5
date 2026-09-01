import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

const DASHBOARD_LOADING_FALLBACK = (
  <div className="flex justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

/**
 * Layout-route element for the nested staff routes in
 * src/routes/dashboardRoutes.tsx. Lazy-loaded on its own (see that file) so
 * DashboardLayout and its dependencies (the Ask Viv assistant, badge-count
 * hooks, profile-setup reminder, etc.) are not pulled into the main bundle
 * for any user before they reach an authenticated staff route -- matching
 * how each retired per-page *Wrapper.tsx file used to lazy-load
 * DashboardLayout alongside its page component.
 *
 * The inner <Suspense> here (not just the app-level one in App.tsx) is
 * required, not decorative: it is what lets DashboardLayout stay mounted
 * while a sibling staff page's own lazy chunk loads. Without it, that
 * page-chunk suspense would bubble up to the app-level boundary and unmount
 * this whole subtree -- including DashboardLayout, its Ask Viv panel state,
 * and badge-count subscriptions -- defeating the point of the nested-route
 * conversion.
 */
export default function DashboardLayoutRoute() {
  return (
    <DashboardLayout>
      <Suspense fallback={DASHBOARD_LOADING_FALLBACK}>
        <Outlet />
      </Suspense>
    </DashboardLayout>
  );
}

import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AcademyLayout } from "@/components/layout/AcademyLayout";

const ACADEMY_LOADING_FALLBACK = (
  <div className="flex justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

/**
 * Layout-route element for the nested Academy routes in
 * src/routes/academyRoutes.tsx. Lazy-loaded on its own (see that file) so
 * AcademyLayout and its dependencies are not pulled into the main bundle
 * for users who never visit an Academy page -- matching how each retired
 * per-page *Wrapper.tsx file used to lazy-load AcademyLayout alongside its
 * page component.
 *
 * The inner <Suspense> here (not just the app-level one in App.tsx) is
 * required, not decorative: it is what lets AcademyLayout stay mounted
 * while a sibling Academy page's own lazy chunk loads. Without it, that
 * page-chunk suspense would bubble up to the app-level boundary and
 * unmount this whole subtree -- including AcademyLayout -- defeating the
 * point of the nested-route conversion.
 */
export default function AcademyLayoutRoute() {
  return (
    <AcademyLayout>
      <Suspense fallback={ACADEMY_LOADING_FALLBACK}>
        <Outlet />
      </Suspense>
    </AcademyLayout>
  );
}

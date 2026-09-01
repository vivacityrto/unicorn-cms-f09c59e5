import { lazy } from "react";
import { Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const AcademyLayoutRoute = lazy(() => import("@/components/layout/AcademyLayoutRoute"));

const AcademyDashboardPage = lazy(() => import("@/pages/client/AcademyDashboardPage"));
const TrainerHubPage = lazy(() => import("@/pages/client/TrainerHubPage"));
const ComplianceManagerPage = lazy(() => import("@/pages/client/ComplianceManagerPage"));
const GovernancePersonPage = lazy(() => import("@/pages/client/GovernancePersonPage"));
const StudentSupportOfficerPage = lazy(() => import("@/pages/client/StudentSupportOfficerPage"));
const AdministrationAssistantPage = lazy(() => import("@/pages/client/AdministrationAssistantPage"));
const AcademyCourseDetailPage = lazy(() => import("@/pages/client/AcademyCourseDetailPage"));
const AcademyLessonViewerPage = lazy(() => import("@/pages/client/AcademyLessonViewerPage"));
const AcademyAssessmentPlayerPage = lazy(() => import("@/pages/client/AcademyAssessmentPlayerPage"));
const AcademyAssessmentResultPage = lazy(() => import("@/pages/client/AcademyAssessmentResultPage"));
const ClientProfilePage = lazy(() => import("@/pages/client/ClientProfilePage"));

/**
 * Academy pages that previously each used a dedicated *Wrapper.tsx file to
 * mount AcademyLayout individually (11 near-identical files, ~170 lines).
 * Converted to a nested layout route so AcademyLayout mounts once per
 * Academy visit instead of remounting -- and re-running its tenant/access
 * check -- on every click between these pages
 * (docs/kb/reference/codebase-optimization-plan-2026-08-28.md, P1.3).
 *
 * Deliberate behavior change, confirmed with Carl: sidebar-open and
 * section-expand state now persist across navigation among these routes,
 * and there is no repeat loading flash between them (previously, each page
 * change flashed AcademyLayout's academyAccessLoading spinner while the
 * tenant/access check re-ran from scratch).
 *
 * NOT everything under /academy is covered here: 8 other Academy pages
 * (courses, certificates, workbooks, events, community, and the 3 PDP
 * pages, all under src/pages/academy/) wrap AcademyLayout themselves
 * inside the page component rather than using a Wrapper file -- out of
 * scope for this slice, and still mount/unmount independently exactly as
 * before. Navigating between one of those 8 and one of the 11 below still
 * remounts AcademyLayout, same as it always has.
 *
 * AcademyLayoutRoute is lazy-loaded (src/components/layout/AcademyLayoutRoute.tsx)
 * so AcademyLayout and its dependency tree aren't pulled into the main
 * bundle for users who never visit Academy -- same as it was before this
 * change, when each Wrapper file lazy-loaded the layout alongside its page.
 */
export const academyLayoutRoutes = (
  <Route path="/academy" element={<ProtectedRoute><AcademyLayoutRoute /></ProtectedRoute>}>
    <Route index element={<AcademyDashboardPage />} />
    <Route path="trainer" element={<TrainerHubPage />} />
    <Route path="compliance-manager" element={<ComplianceManagerPage />} />
    <Route path="governance-person" element={<GovernancePersonPage />} />
    <Route path="student-support-officer" element={<StudentSupportOfficerPage />} />
    <Route path="administration-assistant" element={<AdministrationAssistantPage />} />
    <Route path="course/:slug" element={<AcademyCourseDetailPage />} />
    <Route path="course/:slug/lesson/:lessonId" element={<AcademyLessonViewerPage />} />
    <Route path="course/:slug/assessment/:assessmentId" element={<AcademyAssessmentPlayerPage />} />
    <Route path="course/:slug/assessment/:assessmentId/result/:attemptId" element={<AcademyAssessmentResultPage />} />
    <Route path="profile" element={<ClientProfilePage />} />
  </Route>
);

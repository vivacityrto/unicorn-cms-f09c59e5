import { Navigate, useParams } from "react-router-dom";

export default function OnboardingHubPage() {
  const { runId } = useParams<{ runId: string }>();
  return <Navigate to={`/admin/team-users/runs/${runId}?tab=onboarding`} replace />;
}

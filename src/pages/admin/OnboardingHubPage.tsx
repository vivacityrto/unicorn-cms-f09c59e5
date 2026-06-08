import { useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { OnboardingHub } from "@/components/admin/team-users/OnboardingHub";

export default function OnboardingHubPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const id = Number(runId);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/team-users")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Team Users
        </Button>
        {Number.isFinite(id) ? (
          <OnboardingHub runId={id} />
        ) : (
          <div className="text-sm text-destructive">Invalid run id</div>
        )}
      </div>
    </DashboardLayout>
  );
}

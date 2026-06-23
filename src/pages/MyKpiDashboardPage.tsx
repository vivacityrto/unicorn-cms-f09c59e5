import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { KpiDashboard } from "@/components/kpi/KpiDashboard";
import { MyKpiSignOffSection } from "@/components/kpi/MyKpiSignOffSection";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useKpiAccess } from "@/hooks/useKpiAccess";

export default function MyKpiDashboardPage() {
  const { profile, loading } = useAuth();
  const { canViewAnyStaff } = useKpiAccess();

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-8 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </DashboardLayout>
    );
  }

  if (!profile?.user_uuid) {
    return (
      <DashboardLayout>
        <div className="p-8 text-muted-foreground">Sign in to view your KPI dashboard.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">My KPI dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Your weekly KPI rollup across CSC, CST and Dev metrics.
            </p>
          </div>
          {canViewAnyStaff && (
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/kpi-review">Open reviewer view</Link>
            </Button>
          )}
        </div>
        <MyKpiSignOffSection />
        <KpiDashboard subjectUuid={profile.user_uuid} />
      </div>
    </DashboardLayout>
  );
}

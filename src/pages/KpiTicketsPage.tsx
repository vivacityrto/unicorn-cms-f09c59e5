import { DashboardLayout } from "@/components/DashboardLayout";
import { useKpiAccess } from "@/hooks/useKpiAccess";
import { ShieldAlert } from "lucide-react";
import { KpiTicketsBoard } from "@/components/kpi/KpiTicketsBoard";

export default function KpiTicketsPage() {
  const { canViewAnyStaff, loading } = useKpiAccess();

  if (loading) {
    return <DashboardLayout><div className="p-8 text-sm text-muted-foreground">Loading…</div></DashboardLayout>;
  }

  if (!canViewAnyStaff) {
    return (
      <DashboardLayout>
        <div className="p-8 max-w-md mx-auto text-center space-y-2">
          <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground" />
          <h1 className="text-lg font-semibold">Reviewer access required</h1>
          <p className="text-sm text-muted-foreground">
            This page is only available to KPI reviewers and SuperAdmins.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <KpiTicketsBoard />
      </div>
    </DashboardLayout>
  );
}

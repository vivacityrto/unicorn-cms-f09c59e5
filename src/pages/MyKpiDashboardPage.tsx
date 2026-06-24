import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { KpiDashboard } from "@/components/kpi/KpiDashboard";
import { MyKpiSignOffSection } from "@/components/kpi/MyKpiSignOffSection";
import { KpiEmailLogSection } from "@/components/kpi/KpiEmailLogSection";
import { KpiMonthlySummaryCards } from "@/components/kpi/KpiMonthlySummaryCards";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKpiAccess } from "@/hooks/useKpiAccess";
import type { KpiRole } from "@/hooks/useKpiSummary";

type Period = "weekly" | "monthly" | "quarterly";

const PERIOD_WEEKS: Record<Period, number> = {
  weekly: 1,
  monthly: 5,
  quarterly: 13,
};

const PERIOD_LABEL: Record<Period, string> = {
  weekly: "This week",
  monthly: "Last 4 weeks",
  quarterly: "Last 13 weeks",
};


const KPI_ROLE_TO_SHORT: Record<string, KpiRole> = {
  csc_consultant: "csc",
  cst_assistant: "cst",
  developer: "dev",
};

export default function MyKpiDashboardPage() {
  const { profile, loading } = useAuth();
  const { canViewAnyStaff } = useKpiAccess();
  const [period, setPeriod] = useState<Period>("weekly");

  const roles = useMemo<KpiRole[] | undefined>(() => {
    const short = profile?.kpi_role ? KPI_ROLE_TO_SHORT[profile.kpi_role] : undefined;
    return short ? [short] : undefined;
  }, [profile?.kpi_role]);

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
              Your KPI rollup and role-specific activity.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <TabsList>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
              </TabsList>
            </Tabs>
            {canViewAnyStaff && (
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/kpi-review">Open reviewer view</Link>
              </Button>
            )}
          </div>
        </div>

        {profile.kpi_role === "csc_consultant" && (
          <KpiMonthlySummaryCards subjectUuid={profile.user_uuid} period={period} />
        )}

        <KpiDashboard
          subjectUuid={profile.user_uuid}
          roles={roles}
          weeks={PERIOD_WEEKS[period]}
          periodLabel={PERIOD_LABEL[period]}
        />


        {(profile.kpi_role === "csc_consultant" || profile.kpi_role === "cst_assistant") && (
          <KpiEmailLogSection subjectUuid={profile.user_uuid} />
        )}

        <MyKpiSignOffSection />
      </div>
    </DashboardLayout>
  );
}

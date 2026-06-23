import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useKpiAccess } from "@/hooks/useKpiAccess";
import { KpiDashboard } from "@/components/kpi/KpiDashboard";
import { KpiStaffSelector } from "@/components/kpi/KpiStaffSelector";
import { Loader2, ShieldAlert, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiReviewPanel } from "@/components/kpi/KpiReviewPanel";
import type { KpiRole } from "@/hooks/useKpiSummary";

const ROLE_LABEL: Record<KpiRole, string> = {
  csc: "CSC",
  cst: "CST",
  dev: "Dev",
};

export default function KpiReviewerPage() {
  const { profile } = useAuth();
  const { canViewAnyStaff, loading } = useKpiAccess();
  const [searchParams] = useSearchParams();
  const initialRole = (searchParams.get("role") as KpiRole) || "csc";
  const initialSubject = searchParams.get("subject");
  const [role, setRole] = useState<KpiRole>(["csc", "cst", "dev"].includes(initialRole) ? initialRole : "csc");
  const [subjectUuid, setSubjectUuid] = useState<string | null>(initialSubject);

  useEffect(() => {
    // Default selection: reviewer's own uuid for quick start.
    if (!subjectUuid && profile?.user_uuid) setSubjectUuid(profile.user_uuid);
  }, [profile?.user_uuid, subjectUuid]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-8 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </DashboardLayout>
    );
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
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">KPI reviewer</h1>
            <p className="text-sm text-muted-foreground">
              Pick a KPI role and a staff member to review weekly performance.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/kpi-overview"><LayoutGrid className="h-4 w-4 mr-2" /> Overview board</Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <Tabs value={role} onValueChange={(v) => { setRole(v as KpiRole); setSubjectUuid(null); }}>
            <TabsList>
              {(Object.keys(ROLE_LABEL) as KpiRole[]).map((r) => (
                <TabsTrigger key={r} value={r}>{ROLE_LABEL[r]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <KpiStaffSelector value={subjectUuid} onChange={setSubjectUuid} filterRole={role} />
        </div>

        {subjectUuid ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <KpiDashboard subjectUuid={subjectUuid} roles={[role]} />
            <KpiReviewPanel subjectUuid={subjectUuid} role={role} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a staff member to load their dashboard.</p>
        )}
      </div>
    </DashboardLayout>
  );
}

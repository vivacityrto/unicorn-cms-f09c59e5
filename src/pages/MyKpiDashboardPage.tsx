import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { KpiDashboard } from "@/components/kpi/KpiDashboard";
import { MyKpiSignOffSection } from "@/components/kpi/MyKpiSignOffSection";
import { KpiEmailLogSection } from "@/components/kpi/KpiEmailLogSection";
import { KpiMonthlySummaryCards } from "@/components/kpi/KpiMonthlySummaryCards";
import { KpiTasksSection } from "@/components/kpi/KpiTasksSection";
import { KpiDeveloperTicketQueue } from "@/components/kpi/KpiDeveloperTicketQueue";
import { KpiReporterTicketView } from "@/components/kpi/KpiReporterTicketView";
import { RaiseTicketButton } from "@/components/kpi/RaiseTicketSheet";
import { Loader2, LayoutDashboard, CheckSquare, Ticket, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useKpiAccess } from "@/hooks/useKpiAccess";
import type { KpiRole } from "@/hooks/useKpiSummary";

type Period = "weekly" | "monthly" | "quarterly";

const PERIOD_WEEKS: Record<Period, number> = { weekly: 1, monthly: 5, quarterly: 13 };
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

type TabKey = "kpi_overview" | "tasks" | "tickets" | "email_log";

export default function MyKpiDashboardPage() {
  const { profile, loading } = useAuth();
  const { canViewAnyStaff } = useKpiAccess();
  const [period, setPeriod] = useState<Period>("weekly");
  const [taskCount, setTaskCount] = useState(0);
  const [ticketCount, setTicketCount] = useState(0);

  const roles = useMemo<KpiRole[] | undefined>(() => {
    const short = profile?.kpi_role ? KPI_ROLE_TO_SHORT[profile.kpi_role] : undefined;
    return short ? [short] : undefined;
  }, [profile?.kpi_role]);

  useEffect(() => {
    const uuid = profile?.user_uuid;
    if (!uuid) return;
    let cancelled = false;
    (async () => {
      const [tasksRes, ticketsRes] = await Promise.all([
        (supabase as any)
          .from("kpi_tasks")
          .select("id", { count: "exact", head: true })
          .eq("assignee_uuid", uuid)
          .eq("status", "pending"),
        (supabase as any)
          .from("kpi_tickets")
          .select("id", { count: "exact", head: true })
          .eq("assignee_uuid", uuid)
          .neq("status", "solved"),
      ]);
      if (cancelled) return;
      setTaskCount(tasksRes?.count ?? 0);
      setTicketCount(ticketsRes?.count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [profile?.user_uuid]);

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

  const kpiRole = profile.kpi_role ?? "";
  const isDev = kpiRole === "developer";
  const visibleTabs: TabKey[] = isDev
    ? ["kpi_overview", "tickets"]
    : ["kpi_overview", "tasks", "tickets", "email_log"];

  const cardsRole: "csc_consultant" | "cst_assistant" | "developer" =
    kpiRole === "cst_assistant" ? "cst_assistant" : kpiRole === "developer" ? "developer" : "csc_consultant";

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
          {canViewAnyStaff && (
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/kpi-review">Open reviewer view</Link>
            </Button>
          )}
        </div>

        <Tabs defaultValue="kpi_overview">
          <TabsList>
            {visibleTabs.includes("kpi_overview") && (
              <TabsTrigger value="kpi_overview" className="flex items-center gap-1.5">
                <LayoutDashboard className="h-4 w-4" /> KPI Overview
              </TabsTrigger>
            )}
            {visibleTabs.includes("tasks") && (
              <TabsTrigger value="tasks" className="flex items-center gap-1.5">
                <CheckSquare className="h-4 w-4" /> Tasks
                {taskCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">{taskCount}</Badge>
                )}
              </TabsTrigger>
            )}
            {visibleTabs.includes("tickets") && (
              <TabsTrigger value="tickets" className="flex items-center gap-1.5">
                <Ticket className="h-4 w-4" /> Tickets
                {ticketCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">{ticketCount}</Badge>
                )}
              </TabsTrigger>
            )}
            {visibleTabs.includes("email_log") && (
              <TabsTrigger value="email_log" className="flex items-center gap-1.5">
                <Mail className="h-4 w-4" /> Email log
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="kpi_overview" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <TabsList>
                  <TabsTrigger value="weekly">Weekly</TabsTrigger>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                  <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <KpiMonthlySummaryCards
              subjectUuid={profile.user_uuid}
              period={period}
              role={cardsRole}
            />
            <KpiDashboard
              subjectUuid={profile.user_uuid}
              roles={roles}
              weeks={PERIOD_WEEKS[period]}
              periodLabel={PERIOD_LABEL[period]}
              hideSections
            />
            <MyKpiSignOffSection />
          </TabsContent>

          {visibleTabs.includes("tasks") && (
            <TabsContent value="tasks" className="mt-4">
              <KpiTasksSection viewerRole={profile.kpi_role ?? null} />
            </TabsContent>
          )}

          <TabsContent value="tickets" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <RaiseTicketButton />
            </div>
            {profile.kpi_role === "developer" ? <KpiDeveloperTicketQueue /> : <KpiReporterTicketView />}
          </TabsContent>

          {visibleTabs.includes("email_log") && (
            <TabsContent value="email_log" className="mt-4">
              <KpiEmailLogSection subjectUuid={profile.user_uuid} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

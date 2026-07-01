import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useKpiAccess } from "@/hooks/useKpiAccess";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Headphones, ClipboardList, Code2, Users, BarChart3, ArrowRight, Gauge } from "lucide-react";
import { MyKpiContent } from "./MyKpiDashboardPage";

/**
 * /kpi — unified KPI landing page.
 * - "My KPI" tab: role-based KPI dashboard content (delegates to MyKpiContent).
 * - "Team KPI" tab: reviewer-only entry points into the org-wide overview and review flow.
 * - Role callout cards at the top explain scope for CSC, Admin Assistant, and Developer.
 */
export default function KpiPage() {
  const { profile } = useAuth();
  const { canViewAnyStaff } = useKpiAccess();
  const kpiRole = profile?.kpi_role ?? null;

  const showTeamTab = canViewAnyStaff;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start gap-3">
          <Gauge className="h-6 w-6 mt-1 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">KPI</h1>
            <p className="text-sm text-muted-foreground">
              Track your role-specific KPIs and review the team's performance.
            </p>
          </div>
        </div>

        {/* Role scope cards */}
        <div className="grid gap-3 md:grid-cols-3">
          <Card className={kpiRole === "csc_consultant" ? "border-primary" : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Headphones className="h-4 w-4" /> CSC Consultant
                {kpiRole === "csc_consultant" && <Badge className="ml-auto">You</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Client comms SLA, task completion, and stage progress.
            </CardContent>
          </Card>
          <Card className={kpiRole === "cst_assistant" ? "border-primary" : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardList className="h-4 w-4" /> Admin Assistant
                {kpiRole === "cst_assistant" && <Badge className="ml-auto">You</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Task throughput, quality, and turnaround across supported CSCs.
            </CardContent>
          </Card>
          <Card className={kpiRole === "developer" ? "border-primary" : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Code2 className="h-4 w-4" /> Developer
                {kpiRole === "developer" && <Badge className="ml-auto">You</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Ticket queue throughput and resolution time. Detailed metrics coming soon.
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="my_kpi">
          <TabsList>
            <TabsTrigger value="my_kpi" className="flex items-center gap-1.5">
              <Gauge className="h-4 w-4" /> My KPI
            </TabsTrigger>
            {showTeamTab && (
              <TabsTrigger value="team_kpi" className="flex items-center gap-1.5">
                <Users className="h-4 w-4" /> Team KPI
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="my_kpi" className="mt-4">
            <MyKpiContent showHeader={false} />
          </TabsContent>

          {showTeamTab && (
            <TabsContent value="team_kpi" className="mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart3 className="h-4 w-4" /> KPI Overview
                    </CardTitle>
                    <CardDescription>
                      Cross-team KPI rollups by role and period.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/admin/kpi-overview" className="inline-flex items-center gap-1.5">
                        Open KPI Overview <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Users className="h-4 w-4" /> KPI Review
                    </CardTitle>
                    <CardDescription>
                      Review individual staff KPI performance and add sign-off notes.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/admin/kpi-review" className="inline-flex items-center gap-1.5">
                        Open KPI Review <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

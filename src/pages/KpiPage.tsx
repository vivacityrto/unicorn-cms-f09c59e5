import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useKpiAccess } from "@/hooks/useKpiAccess";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { Download, Gauge, Users, BarChart3, ArrowRight, Headphones, ClipboardList, Code2 } from "lucide-react";
import { CscKpiCards } from "@/components/kpi-v2/CscKpiCards";
import { AssistantKpiCards } from "@/components/kpi-v2/AssistantKpiCards";
import { DeveloperPlaceholder } from "@/components/kpi-v2/DeveloperPlaceholder";
import { PerformanceGuide } from "@/components/kpi-v2/PerformanceGuide";
import { KpiInfoBanner } from "@/components/kpi-v2/KpiInfoBanner";
import { KPI_V2_PERIOD_LABEL, type KpiV2Period } from "@/components/kpi-v2/types";
import { toast } from "@/hooks/use-toast";

/**
 * /kpi — KPI Dashboard.
 * Renders only role-based donut-gauge cards, a period selector, an export
 * button, a performance guide, an info banner, and a reviewer-only Team KPI
 * toggle. No legacy KPI dashboard components are used on this page.
 */
export default function KpiPage() {
  const { profile } = useAuth();
  const { canViewAnyStaff } = useKpiAccess();
  const kpiRole = profile?.kpi_role ?? null;
  const subjectUuid = profile?.user_uuid ?? "";

  const [period, setPeriod] = useState<KpiV2Period>("weekly");
  const [showTeamKpi, setShowTeamKpi] = useState(false);

  // Set browser tab title so the DashboardLayout page label reads "KPI Dashboard".
  useEffect(() => {
    const previous = document.title;
    document.title = "KPI Dashboard · Unicorn";
    return () => {
      document.title = previous;
    };
  }, []);

  const roleLabel = useMemo(() => {
    if (kpiRole === "csc_consultant") return "CSC Consultant";
    if (kpiRole === "cst_assistant") return "Admin Assistant";
    if (kpiRole === "developer") return "Developer";
    return null;
  }, [kpiRole]);

  const handleExport = () => {
    // Client-side CSV of the currently visible gauges. Data is intentionally
    // fetched by each gauge card, so we export the header shape here and let
    // the user re-run with per-role detail once the reviewer report ships.
    const header = ["Period", "Role", "Subject"];
    const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || subjectUuid;
    const row = [KPI_V2_PERIOD_LABEL[period], roleLabel ?? "—", displayName];
    const csv = `${header.join(",")}\n${row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kpi-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: "Export ready", description: "Your KPI snapshot has been downloaded." });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Hero — brand purple→fuchsia gradient */}
        <div
          className="relative overflow-hidden rounded-xl px-6 py-6 text-white shadow-sm"
          style={{ background: "var(--viv-grad-hero)" }}
        >
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" aria-hidden />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center">
                <Gauge className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">KPI Dashboard</h1>
                <p className="text-sm text-white/85 mt-1">
                  Your live performance snapshot across the Unicorn platform.
                </p>
              </div>
            </div>
            {roleLabel && (
              <Badge className="self-start md:self-auto bg-white/15 hover:bg-white/20 text-white border border-white/25">
                {roleLabel === "CSC Consultant" && <Headphones className="h-3.5 w-3.5 mr-1.5" />}
                {roleLabel === "Admin Assistant" && <ClipboardList className="h-3.5 w-3.5 mr-1.5" />}
                {roleLabel === "Developer" && <Code2 className="h-3.5 w-3.5 mr-1.5" />}
                {roleLabel}
              </Badge>
            )}
          </div>
        </div>

        <KpiInfoBanner />

        {/* Controls: period selector · export · team toggle */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as KpiV2Period)}>
            <TabsList>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-3">
            {canViewAnyStaff && (
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-1.5">
                <Users className="h-4 w-4 text-[#7130A0]" />
                <Label htmlFor="team-kpi-toggle" className="text-xs font-medium cursor-pointer">
                  Team KPI
                </Label>
                <Switch id="team-kpi-toggle" checked={showTeamKpi} onCheckedChange={setShowTeamKpi} />
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        </div>

        {/* Role-specific gauge grid */}
        {!showTeamKpi && (
          <section aria-label="Your KPI gauges">
            {!subjectUuid ? (
              <div className="p-6 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
                Sign in to view your KPI dashboard.
              </div>
            ) : kpiRole === "csc_consultant" ? (
              <CscKpiCards subjectUuid={subjectUuid} period={period} />
            ) : kpiRole === "cst_assistant" ? (
              <AssistantKpiCards subjectUuid={subjectUuid} period={period} />
            ) : kpiRole === "developer" ? (
              <DeveloperPlaceholder />
            ) : (
              <div className="p-6 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
                KPI tracking isn't configured for your role yet. If you think this is wrong, contact an admin.
              </div>
            )}
          </section>
        )}

        {/* Team KPI toggle content (reviewer only) */}
        {showTeamKpi && canViewAnyStaff && (
          <section aria-label="Team KPI" className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4 text-[#7130A0]" /> KPI Overview
                </CardTitle>
                <CardDescription>Cross-team KPI rollups by role and period.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm">
                  <Link to="/admin/kpi-overview" className="inline-flex items-center gap-1.5">
                    Open KPI Overview <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-[#ED1878]" /> KPI Review
                </CardTitle>
                <CardDescription>Review individual staff performance and add sign-off notes.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm">
                  <Link to="/admin/kpi-review" className="inline-flex items-center gap-1.5">
                    Open KPI Review <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        )}

        <PerformanceGuide />
      </div>
    </DashboardLayout>
  );
}

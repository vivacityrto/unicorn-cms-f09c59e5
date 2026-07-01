import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useKpiAccess } from "@/hooks/useKpiAccess";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Download, Users } from "lucide-react";
import { CscKpiCards } from "@/components/kpi-v2/CscKpiCards";
import { AssistantKpiCards } from "@/components/kpi-v2/AssistantKpiCards";
import { DeveloperPlaceholder } from "@/components/kpi-v2/DeveloperPlaceholder";
import { PerformanceGuide } from "@/components/kpi-v2/PerformanceGuide";
import { KpiInfoBanner } from "@/components/kpi-v2/KpiInfoBanner";
import { KpiTeamSection } from "@/components/kpi-v2/KpiTeamSection";
import {
  KPI_V2_PERIOD_LABEL,
  KPI_V2_PERIOD_ORDER,
  type KpiV2Period,
} from "@/components/kpi-v2/types";
import { toast } from "@/hooks/use-toast";

/**
 * /kpi — KPI Dashboard.
 * Role-based donut-gauge cards, period dropdown, export, performance guide,
 * info banner, and a reviewer-only Team KPI toggle. No legacy KPI components.
 */
export default function KpiPage() {
  const { profile } = useAuth();
  const { canViewAnyStaff } = useKpiAccess();
  const kpiRole = profile?.kpi_role ?? null;
  const subjectUuid = profile?.user_uuid ?? "";

  const [period, setPeriod] = useState<KpiV2Period>("this_month");
  const [showTeamKpi, setShowTeamKpi] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = "KPI Dashboard · Unicorn";
    return () => {
      document.title = previous;
    };
  }, []);

  const roleLabel = useMemo(() => {
    if (kpiRole === "csc_consultant") return "Client Success Champion (CSC)";
    if (kpiRole === "cst_assistant") return "Administration Assistant";
    if (kpiRole === "developer") return "Developer";
    return null;
  }, [kpiRole]);

  const shortRoleLabel = useMemo(() => {
    if (kpiRole === "csc_consultant") return "CSC Consultant";
    if (kpiRole === "cst_assistant") return "Admin Assistant";
    if (kpiRole === "developer") return "Developer";
    return null;
  }, [kpiRole]);

  const firstName =
    profile?.first_name ||
    (profile?.email ? profile.email.split("@")[0] : "there");

  const handleExport = () => {
    const header = ["Period", "Role", "Subject"];
    const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || subjectUuid;
    const row = [KPI_V2_PERIOD_LABEL[period], shortRoleLabel ?? "—", displayName];
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
        {/* Compact page header row: role subtitle + welcome / last updated */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="min-w-0">
            {roleLabel && (
              <div className="font-binate text-sm text-muted-foreground">
                {roleLabel}
              </div>
            )}
            <div className="text-xl font-semibold text-foreground tracking-tight">
              Welcome back, {firstName}!
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Last updated: Just now
          </div>
        </div>

        <KpiInfoBanner />

        {/* Controls: period dropdown · export · team toggle */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as KpiV2Period)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KPI_V2_PERIOD_ORDER.map((key) => (
                <SelectItem key={key} value={key}>
                  {KPI_V2_PERIOD_LABEL[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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

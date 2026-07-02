import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useKpiAccess } from "@/hooks/useKpiAccess";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronLeft, ChevronRight, Download, Users } from "lucide-react";
import { CscKpiCards } from "@/components/kpi-v2/CscKpiCards";
import { AssistantKpiCards } from "@/components/kpi-v2/AssistantKpiCards";
import { DeveloperPlaceholder } from "@/components/kpi-v2/DeveloperPlaceholder";
import { PerformanceGuide } from "@/components/kpi-v2/PerformanceGuide";
import { KpiInfoBanner } from "@/components/kpi-v2/KpiInfoBanner";
import { KpiTeamSection } from "@/components/kpi-v2/KpiTeamSection";
import {
  canStepForward,
  defaultPeriod,
  getPeriodLabel,
  isCurrentPeriod,
  stepPeriod,
  todayIso,
  type KpiGranularity,
  type KpiV2Period,
} from "@/components/kpi-v2/types";
import { toast } from "@/hooks/use-toast";

const VALID_GRANULARITIES: KpiGranularity[] = ["week", "month", "quarter"];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function periodFromSearchParams(sp: URLSearchParams): KpiV2Period {
  const g = sp.get("g");
  const d = sp.get("d");
  if (
    g &&
    d &&
    (VALID_GRANULARITIES as string[]).includes(g) &&
    ISO_DATE_RE.test(d) &&
    !Number.isNaN(new Date(d).getTime())
  ) {
    return { granularity: g as KpiGranularity, anchorDate: d };
  }
  return defaultPeriod();
}

/**
 * /kpi — KPI Dashboard.
 * Role-based donut-gauge cards, granularity + stepper period picker with
 * URL state, export, performance guide, info banner, and a reviewer-only
 * Team KPI toggle.
 */
export default function KpiPage() {
  const { profile } = useAuth();
  const { canViewAnyStaff } = useKpiAccess();
  const kpiRole = profile?.kpi_role ?? null;
  const subjectUuid = profile?.user_uuid ?? "";

  const [searchParams, setSearchParams] = useSearchParams();
  const period = useMemo(() => periodFromSearchParams(searchParams), [searchParams]);

  const setPeriod = (next: KpiV2Period) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("g", next.granularity);
    sp.set("d", next.anchorDate);
    setSearchParams(sp, { replace: false });
  };

  const [showTeamKpi, setShowTeamKpi] = useState(canViewAnyStaff);

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

  const periodLabel = getPeriodLabel(period);
  const forwardAvailable = canStepForward(period);
  const atCurrent = isCurrentPeriod(period);

  const handleGranularityChange = (g: string) => {
    if (!g || !(VALID_GRANULARITIES as string[]).includes(g)) return;
    // Keep the same anchor date; the new bounds derive from it.
    setPeriod({ granularity: g as KpiGranularity, anchorDate: period.anchorDate });
  };

  const handlePrev = () => setPeriod(stepPeriod(period, -1));
  const handleNext = () => {
    if (!forwardAvailable) return;
    setPeriod(stepPeriod(period, 1));
  };
  const handleToday = () =>
    setPeriod({ granularity: period.granularity, anchorDate: todayIso() });

  const handleExport = () => {
    const header = ["Period", "Role", "Subject"];
    const displayName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
      profile?.email ||
      subjectUuid;
    const row = [periodLabel, shortRoleLabel ?? "—", displayName];
    const csv = `${header.join(",")}\n${row
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kpi-${period.granularity}-${period.anchorDate}.csv`;
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

        {/* Controls: granularity + stepper · export · team toggle */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={period.granularity}
              onValueChange={handleGranularityChange}
              size="sm"
              variant="outline"
            >
              <ToggleGroupItem value="week" aria-label="Week">Week</ToggleGroupItem>
              <ToggleGroupItem value="month" aria-label="Month">Month</ToggleGroupItem>
              <ToggleGroupItem value="quarter" aria-label="Quarter">Quarter</ToggleGroupItem>
            </ToggleGroup>

            <div className="flex items-center gap-1 rounded-md border border-border/60 bg-background px-1 py-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handlePrev}
                aria-label="Previous period"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[180px] text-center text-sm font-medium px-2">
                {periodLabel}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleNext}
                disabled={!forwardAvailable}
                aria-label="Next period"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {!atCurrent && (
              <Button variant="outline" size="sm" onClick={handleToday}>
                Today
              </Button>
            )}
          </div>

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

        {/* Team KPI overview (reviewer only) */}
        {showTeamKpi && canViewAnyStaff && (
          <section aria-label="Team KPI">
            <KpiTeamSection period={period} />
          </section>
        )}

        <PerformanceGuide />
      </div>
    </DashboardLayout>
  );
}

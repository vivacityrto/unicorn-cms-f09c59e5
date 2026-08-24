import { useState, useEffect, useMemo } from "react";
import { useClientPackageDashboards, useClientPackageDashboard, type ClientPackageDashboardRow } from "@/hooks/use-client-package-dashboard";
import { useClientPackageStages } from "@/hooks/use-client-package-stages";
import { useClientPackageWhatsNext } from "@/hooks/use-client-package-whats-next";
import { useClientPackageHoursByType } from "@/hooks/use-client-package-hours-by-type";
import { useClientPackageHoursRecent } from "@/hooks/use-client-package-hours-recent";
import { useClientPackageHoursTimeline } from "@/hooks/use-client-package-hours-timeline";
import { PinnedNoteBanner } from "@/components/client/package-dashboard/PinnedNoteBanner";
import { PackageHoursBreakdown } from "@/components/client/package-dashboard/PackageHoursBreakdown";
import { PackageBurndownChart } from "@/components/client/package-dashboard/PackageBurndownChart";
import { PackageRecentWork } from "@/components/client/package-dashboard/PackageRecentWork";
import { PackageStatusPill } from "@/components/client/package-dashboard/PackageStatusPill";
import { PackageStatTiles } from "@/components/client/package-dashboard/PackageStatTiles";
import { PackageActionRow } from "@/components/client/package-dashboard/PackageActionRow";
import { PackageStageStepper } from "@/components/client/package-dashboard/PackageStageStepper";
import { PackageWhatsNextPanel } from "@/components/client/package-dashboard/PackageWhatsNextPanel";
import { CollapsedPackageRow } from "@/components/client/package-dashboard/CollapsedPackageRow";
import { PackageHistorySection } from "@/components/client/package-dashboard/PackageHistorySection";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, AlertCircle, CalendarClock, CheckCircle2, ChevronUp, Clock, ListChecks, Package2 } from "lucide-react";
import { format } from "date-fns";
import { usePackageTypeOptions, getPackageTypeLabel } from "@/hooks/usePackageTypeOptions";
import { formatHours } from "./package-dashboard/formatters";

export default function ClientPackagesPage() {
  const { data: dashboards = [], isLoading, error } = useClientPackageDashboards();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Split: completed packages render as compact history rows; everything else
  // gets the full PackageCard treatment. is_complete is exposed by
  // v_client_package_dashboard. Treat null is_complete as active.
  const activePackages = useMemo(
    () => dashboards.filter(d => !d.is_complete),
    [dashboards],
  );

  const historicalPackages = useMemo(
    () =>
      dashboards
        .filter(d => d.is_complete)
        // Most-recent end_date first; rows with no end_date sort to the bottom.
        .sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? '')),
    [dashboards],
  );

  // Auto-expand the most recently-active ACTIVE package on first data load.
  // Historical packages never auto-expand — they live in the history section.
  // Only sets when expandedIds is still empty — never overrides later toggles.
  // Tie-break on identical last_activity_at: lowest package_instance_id wins,
  // keeping the initial expansion stable across reloads. Null activity sorts last.
  useEffect(() => {
    if (expandedIds.size > 0 || activePackages.length === 0) return;
    const sorted = [...activePackages].sort((a, b) => {
      const aAct = a.last_activity_at ?? '';
      const bAct = b.last_activity_at ?? '';
      const cmp = bAct.localeCompare(aAct);
      return cmp !== 0 ? cmp : a.package_instance_id - b.package_instance_id;
    });
    setExpandedIds(new Set([sorted[0].package_instance_id]));
    // Intentionally only depend on length: don't refire when row contents change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePackages.length]);

  const toggle = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-secondary">Packages</h1>
          <p className="text-sm text-muted-foreground mt-1">Your active packages and progress.</p>
        </div>
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-destructive">
          <p className="text-sm font-medium">Couldn't load packages — refresh to try again.</p>
        </CardContent>
      </Card>
    );
  }

  const hasAny = activePackages.length > 0 || historicalPackages.length > 0;
  const onlyHistory = activePackages.length === 0 && historicalPackages.length > 0;

  const overview = buildOverview(activePackages);

  return (
    <div className="w-full max-w-7xl space-y-8">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-secondary">Packages</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A clear view of your membership, progress, hours, and what needs attention next.
          </p>
        </div>
        {activePackages.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Last updated {overview.lastActivity ? format(new Date(overview.lastActivity), "d MMM yyyy") : "when work is recorded"}
          </p>
        )}
      </div>

      {activePackages.length > 0 && <PackageOverview overview={overview} />}

      {!hasAny && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Package2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm">No active packages found.</p>
          </CardContent>
        </Card>
      )}

      {/* Active packages — full cards (with multi-package collapse logic). */}
      {activePackages.length > 0 && (
        <section>
          <h2 className="sr-only">Your active packages</h2>
          <div className="space-y-4">
            {activePackages.map(d =>
              expandedIds.has(d.package_instance_id) ? (
                <PackageCard
                  key={d.package_instance_id}
                  packageInstanceId={d.package_instance_id}
                  onCollapse={() => toggle(d.package_instance_id)}
                />
              ) : (
                <CollapsedPackageRow
                  key={d.package_instance_id}
                  dashboard={d}
                  onExpand={() => toggle(d.package_instance_id)}
                />
              )
            )}
          </div>
        </section>
      )}

      {/* Friendly note for fully-retired tenants (history only). */}
      {onlyHistory && (
        <p className="text-sm text-muted-foreground">
          You don't have any active packages right now. Your history with us is below.
        </p>
      )}

      {/* Historical packages — compact rows, collapsed by default unless this
          tenant has no active packages (then opens by default so the page
          isn't empty-feeling). */}
      {historicalPackages.length > 0 && (
        <PackageHistorySection
          packages={historicalPackages}
          defaultExpanded={onlyHistory}
        />
      )}
    </div>
  );
}

interface PackageOverviewData {
  packageCount: number;
  hoursUsed: number;
  hoursRemaining: number;
  hoursTotal: number;
  stagesComplete: number;
  stagesTotal: number;
  openTasks: number;
  overdueTasks: number;
  nextRenewal: string | null;
  lastActivity: string | null;
}

function buildOverview(packages: ClientPackageDashboardRow[]): PackageOverviewData {
  const active = packages;
  const dates = active.map((p) => p.end_date).filter((date): date is string => Boolean(date)).sort();
  const activity = active.map((p) => p.last_activity_at).filter((date): date is string => Boolean(date)).sort().at(-1) ?? null;

  return {
    packageCount: active.length,
    hoursUsed: active.reduce((sum, p) => sum + Number(p.hours_used || 0), 0),
    hoursRemaining: active.reduce((sum, p) => sum + Number(p.hours_remaining || 0), 0),
    hoursTotal: active.reduce((sum, p) => sum + Number(p.hours_total || 0), 0),
    stagesComplete: active.reduce((sum, p) => sum + Number(p.stages_complete || 0), 0),
    stagesTotal: active.reduce((sum, p) => sum + Number(p.stages_total || 0), 0),
    openTasks: active.reduce((sum, p) => sum + Number(p.open_tasks || 0), 0),
    overdueTasks: active.reduce((sum, p) => sum + Number(p.overdue_tasks || 0), 0),
    nextRenewal: dates[0] ?? null,
    lastActivity: activity,
  };
}

function OverviewTile({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning" | "success";
}) {
  const toneClass = tone === "warning" ? "text-amber-700" : tone === "success" ? "text-emerald-700" : "text-foreground";
  return (
    <div className="rounded-xl border bg-background/80 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${toneClass}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function PackageOverview({ overview }: { overview: PackageOverviewData }) {
  const stageProgress = overview.stagesTotal > 0 ? Math.round((overview.stagesComplete / overview.stagesTotal) * 100) : 0;
  const hoursProgress = overview.hoursTotal > 0 ? Math.round((overview.hoursUsed / overview.hoursTotal) * 100) : 0;
  const renewal = overview.nextRenewal ? format(new Date(overview.nextRenewal), "d MMM yyyy") : "No renewal date set";

  return (
    <section aria-labelledby="package-overview-heading" className="rounded-2xl border bg-gradient-to-br from-primary/[0.08] via-background to-background p-5 md:p-6">
      <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 id="package-overview-heading" className="text-base font-semibold text-foreground">Your membership at a glance</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            See how your active packages are tracking overall, then open a package below for the full detail.
          </p>
        </div>
        <span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 md:mt-0">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {overview.packageCount} active {overview.packageCount === 1 ? "package" : "packages"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewTile icon={Clock} label="Hours remaining" value={formatHours(overview.hoursRemaining)} detail={`${formatHours(overview.hoursUsed)} used of ${formatHours(overview.hoursTotal)}`} />
        <OverviewTile icon={Activity} label="Overall progress" value={`${stageProgress}%`} detail={`${overview.stagesComplete} of ${overview.stagesTotal} stages complete`} tone="success" />
        <OverviewTile icon={ListChecks} label="Open tasks" value={`${overview.openTasks}`} detail={overview.overdueTasks > 0 ? `${overview.overdueTasks} need attention now` : "Nothing overdue"} tone={overview.overdueTasks > 0 ? "warning" : "default"} />
        <OverviewTile icon={CalendarClock} label="Next renewal" value={renewal} detail={`${hoursProgress}% of included hours used`} />
      </div>

      {overview.overdueTasks > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>You have {overview.overdueTasks} overdue {overview.overdueTasks === 1 ? "task" : "tasks"}. Open the relevant package below to see what needs action.</span>
        </div>
      )}
    </section>
  );
}

interface PackageCardProps {
  packageInstanceId: number;
  /**
   * When provided, renders a chevron-up control in the header that calls back
   * to collapse this card. Omit in any single-package context to keep the card
   * non-collapsible. Multiple cards may be expanded simultaneously — expanding
   * one does NOT auto-collapse another.
   */
  onCollapse?: () => void;
}

function PackageCard({ packageInstanceId, onCollapse }: PackageCardProps) {
  const {
    data: dashboard,
    isLoading: dashboardLoading,
    error: dashboardError,
  } = useClientPackageDashboard(packageInstanceId);
  const stages = useClientPackageStages(packageInstanceId);
  const whatsNext = useClientPackageWhatsNext(packageInstanceId);
  const hoursByType = useClientPackageHoursByType(packageInstanceId);
  const hoursRecent = useClientPackageHoursRecent(packageInstanceId);
  const timeline = useClientPackageHoursTimeline(packageInstanceId);
  const { options: packageTypes } = usePackageTypeOptions();

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 md:p-6 space-y-6">
        {/* Package header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Package2 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {/*
                Title prefers the friendly name resolved by v_client_package_dashboard
                (COALESCE(NULLIF(TRIM(packages.full_text), ''), packages.name)). While the
                dashboard query is in flight we render a small skeleton instead of a
                short-code placeholder so we never flash "M-DR" before "Diamond RTO Membership".
              */}
              {dashboard?.package_name ? (
                <h3 className="font-semibold text-foreground">{dashboard.package_name}</h3>
              ) : (
                <Skeleton className="h-5 w-40" />
              )}
              {dashboard?.package_type && dashboard.package_type !== dashboard.package_name && (
                <Badge variant="secondary" className="text-xs">{getPackageTypeLabel(dashboard.package_type, packageTypes)}</Badge>
              )}
            </div>
            {(dashboard?.start_date || dashboard?.end_date) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {dashboard?.start_date && <>Started {format(new Date(dashboard.start_date), "d MMM yyyy")}</>}
                {dashboard?.start_date && dashboard?.end_date && <> · </>}
                {dashboard?.end_date && <>Renews {format(new Date(dashboard.end_date), "d MMM yyyy")}</>}
              </p>
            )}
          </div>
          {dashboard ? (
            <PackageStatusPill status={dashboard.status_pill} />
          ) : (
            <Skeleton className="h-5 w-16" />
          )}
          {onCollapse && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onCollapse}
              aria-label={`Collapse ${dashboard?.package_name ?? 'package'}`}
              aria-expanded
              className="h-8 w-8 shrink-0"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Pinned-note banner (only when present) */}
        {dashboard?.pinned_note_text || dashboard?.pinned_note_title ? (
          <PinnedNoteBanner
            title={dashboard.pinned_note_title}
            text={dashboard.pinned_note_text}
            severity={dashboard.pinned_note_severity}
          />
        ) : null}

        {/* Stat tiles */}
        {dashboardLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : dashboardError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            Couldn't load package details. Refresh to retry.
          </div>
        ) : (
          <PackageStatTiles dashboard={dashboard ?? null} />
        )}

        {/* Where your hours went — sits directly under the stat tiles so it
            grounds the abstract Hours number in concrete categories. */}
        <div className="grid gap-6 lg:grid-cols-2">
          <PackageHoursBreakdown
            rows={hoursByType.data ?? []}
            isLoading={hoursByType.isLoading}
            isError={hoursByType.isError}
          />

          {/* Hours over time — actual cumulative vs ideal pacing. */}
          <PackageBurndownChart
            points={timeline.data ?? []}
            hoursTotal={Number(dashboard?.hours_total ?? 0)}
            hoursUsed={Number(dashboard?.hours_used ?? 0)}
            startDate={dashboard?.start_date ?? null}
            endDate={dashboard?.end_date ?? null}
            isLoading={timeline.isLoading}
            isError={timeline.isError}
          />
        </div>

        {/* Your journey — stage stepper (replaces phase accordion) */}
        <PackageStageStepper
          stages={stages.data ?? []}
          isLoading={stages.isLoading}
          isError={stages.isError}
        />

        {/* What's next for you */}
        <PackageWhatsNextPanel
          items={whatsNext.data ?? []}
          isLoading={whatsNext.isLoading}
          isError={whatsNext.isError}
          packageInstanceId={packageInstanceId}
        />

        {/* Recent work — last 10 time entries, no staff names, no $ flag */}
        <PackageRecentWork
          entries={hoursRecent.data ?? []}
          isLoading={hoursRecent.isLoading}
          isError={hoursRecent.isError}
        />

        {/* Action buttons */}
        <PackageActionRow
          packageInstanceId={packageInstanceId}
        />
      </CardContent>
    </Card>
  );
}

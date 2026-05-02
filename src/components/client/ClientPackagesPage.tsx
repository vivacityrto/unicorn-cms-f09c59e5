import { useState, useEffect, useMemo } from "react";
import { useClientPackageDashboards, useClientPackageDashboard } from "@/hooks/use-client-package-dashboard";
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
import { Package2, ChevronUp } from "lucide-react";
import { format } from "date-fns";

export default function ClientPackagesPage() {
  const { data: dashboards = [], isLoading } = useClientPackageDashboards();
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

  const hasAny = activePackages.length > 0 || historicalPackages.length > 0;
  const onlyHistory = activePackages.length === 0 && historicalPackages.length > 0;

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-secondary">Packages</h1>
        <p className="text-sm text-muted-foreground mt-1">Your active packages and progress.</p>
      </div>

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

  return (
    <Card>
      <CardContent className="p-5 space-y-6">
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
                <Badge variant="secondary" className="text-xs">{dashboard.package_type}</Badge>
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
        <PackageHoursBreakdown
          rows={hoursByType.data ?? []}
          isLoading={hoursByType.isLoading}
          isError={hoursByType.isError}
        />

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
          managerId={dashboard?.manager_id ?? null}
        />
      </CardContent>
    </Card>
  );
}

import { useState, useEffect } from "react";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useClientPackageInstances, type ClientPackageInstance } from "@/hooks/useClientPackageInstances";
import { useClientPackageDashboard } from "@/hooks/use-client-package-dashboard";
import { useClientPackageStages } from "@/hooks/use-client-package-stages";
import { useClientPackageWhatsNext } from "@/hooks/use-client-package-whats-next";
import { PinnedNoteBanner } from "@/components/client/package-dashboard/PinnedNoteBanner";
import { PackageStatusPill } from "@/components/client/package-dashboard/PackageStatusPill";
import { PackageStatTiles } from "@/components/client/package-dashboard/PackageStatTiles";
import { PackageActionRow } from "@/components/client/package-dashboard/PackageActionRow";
import { PackageStageStepper } from "@/components/client/package-dashboard/PackageStageStepper";
import { PackageWhatsNextPanel } from "@/components/client/package-dashboard/PackageWhatsNextPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package2 } from "lucide-react";
import { format } from "date-fns";

export default function ClientPackagesPage() {
  const { activeTenantId } = useClientTenant();
  const { fetchClientPackages } = useClientPackageInstances();
  const [packages, setPackages] = useState<ClientPackageInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeTenantId) return;
    setLoading(true);
    fetchClientPackages(activeTenantId)
      .then(setPackages)
      .finally(() => setLoading(false));
  }, [activeTenantId]);

  if (loading) {
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

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-secondary">Packages</h1>
        <p className="text-sm text-muted-foreground mt-1">Your active packages and progress.</p>
      </div>

      {packages.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Package2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm">No active packages found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {packages.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} />
          ))}
        </div>
      )}
    </div>
  );
}

function PackageCard({ pkg }: { pkg: ClientPackageInstance }) {
  const packageInstanceId = Number(pkg.id);
  const {
    data: dashboard,
    isLoading: dashboardLoading,
    error: dashboardError,
  } = useClientPackageDashboard(packageInstanceId);
  const stages = useClientPackageStages(packageInstanceId);
  const whatsNext = useClientPackageWhatsNext(packageInstanceId);

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
                (COALESCE(NULLIF(TRIM(packages.full_text), ''), packages.name)).
                pkg.package?.name (short code from useClientPackageInstances) is kept
                only as a loading placeholder until the dashboard query resolves.
              */}
              <h3 className="font-semibold text-foreground">
                {dashboard?.package_name ?? pkg.package?.name ?? "Package"}
              </h3>
              {dashboard?.package_type && dashboard.package_type !== (dashboard?.package_name ?? pkg.package?.name ?? "") && (
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
            <Badge
              variant={pkg.status === "active" ? "default" : "secondary"}
              className="capitalize text-xs"
            >
              {pkg.status}
            </Badge>
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

        {/* Action buttons */}
        <PackageActionRow
          packageInstanceId={packageInstanceId}
          managerId={dashboard?.manager_id ?? null}
        />
      </CardContent>
    </Card>
  );
}

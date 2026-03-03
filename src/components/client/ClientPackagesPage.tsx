import { useState, useEffect } from "react";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useClientPackageInstances, type ClientPackageInstance } from "@/hooks/useClientPackageInstances";
import { usePhaseProgress } from "@/hooks/usePhaseProgress";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Package2,
  CheckCircle2,
  Clock,
  Lock,
} from "lucide-react";

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
  const { phases, isLoading } = usePhaseProgress(packageInstanceId);

  const completedPhases = phases.filter((p) => String(p.status) === "2" || p.status === "completed").length;
  const totalPhases = phases.length;
  const pct = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {/* Package header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Package2 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">{pkg.package?.name ?? "Package"}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completedPhases} of {totalPhases} phases complete
            </p>
          </div>
          <Badge
            variant={pkg.status === "active" ? "default" : "secondary"}
            className="capitalize text-xs"
          >
            {pkg.status}
          </Badge>
        </div>

        {/* Progress bar */}
        {totalPhases > 0 && (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Overall progress</span>
              <span className="font-medium text-foreground">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>
        )}

        {/* Phase accordion */}
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : phases.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No phases configured.</p>
        ) : (
          <Accordion type="multiple" className="space-y-1">
            {phases.map((phase, idx) => {
              const isComplete = String(phase.status) === "2" || phase.status === "completed";
              const isLocked = !phase.is_passable && idx > 0 && !isComplete;

              return (
                <AccordionItem key={phase.phase_instance_id} value={phase.phase_instance_id} className="border rounded-lg px-1">
                  <AccordionTrigger className="py-3 px-3 hover:no-underline">
                    <div className="flex items-center gap-2 text-sm">
                      {isComplete ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : isLocked ? (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Clock className="h-4 w-4 text-amber-500" />
                      )}
                      <span className={isLocked ? "text-muted-foreground" : "font-medium text-foreground"}>
                        {phase.phase_title}
                      </span>
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {phase.completed_stages}/{phase.total_stages} stages
                      </Badge>
                      {phase.gate_type !== "none" && (
                        <Badge variant="outline" className="text-xs capitalize">
                          {phase.gate_type} gate
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    {isLocked ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/60 text-sm text-muted-foreground">
                        <Lock className="h-4 w-4" />
                        This phase is locked. Complete the previous phase to proceed.
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>{phase.completed_stages} of {phase.total_stages} stages complete ({phase.completed_required} of {phase.required_stages} required)</p>
                        {!phase.is_passable && phase.gate_type === "hard" && (
                          <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 text-destructive text-xs mt-2">
                            <Lock className="h-3.5 w-3.5" />
                            Hard gate — all required stages must be complete before proceeding.
                          </div>
                        )}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}

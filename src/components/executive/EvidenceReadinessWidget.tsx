/**
 * EvidenceReadinessWidget – Executive Dashboard
 *
 * Shows Evidence Readiness Overview metrics for the last 30 days.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, AlertTriangle, Clock, Users } from "lucide-react";

export function EvidenceReadinessWidget() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: metrics } = useQuery({
    queryKey: ["evidence-readiness-30d"],
    queryFn: async () => {
      // Gap checks run
      const { count: checksRun } = await supabase
        .from("evidence_gap_checks")
        .select("*", { count: "exact", head: true })
        .gte("generated_at", thirtyDaysAgo);

      // Mandatory gaps identified
      const { data: recentChecks } = await supabase
        .from("evidence_gap_checks")
        .select("missing_categories_json")
        .gte("generated_at", thirtyDaysAgo);

      let mandatoryGaps = 0;
      (recentChecks || []).forEach((c: any) => {
        const missing = c.missing_categories_json as any[];
        if (Array.isArray(missing)) {
          mandatoryGaps += missing.filter((m: any) => m.mandatory).length;
        }
      });

      // Tenants with unresolved gaps (draft status)
      const { data: unresolvedTenants } = await supabase
        .from("evidence_gap_checks")
        .select("tenant_id")
        .eq("status", "draft");

      const uniqueTenants = new Set((unresolvedTenants || []).map((t: any) => t.tenant_id));

      // Average close time (approved checks)
      const { data: closedChecks } = await supabase
        .from("evidence_gap_checks")
        .select("generated_at, reviewed_at")
        .eq("status", "approved")
        .not("reviewed_at", "is", null)
        .gte("generated_at", thirtyDaysAgo);

      let avgCloseHours = 0;
      if (closedChecks && closedChecks.length > 0) {
        const totalMs = closedChecks.reduce((sum, c) => {
          return sum + (new Date(c.reviewed_at!).getTime() - new Date(c.generated_at).getTime());
        }, 0);
        avgCloseHours = Math.round(totalMs / closedChecks.length / (1000 * 60 * 60));
      }

      return {
        checksRun: checksRun || 0,
        mandatoryGaps,
        tenantsWithGaps: uniqueTenants.size,
        avgCloseHours,
      };
    },
    staleTime: 60_000,
  });

  const items = [
    { label: "Checks Run", value: metrics?.checksRun || 0, icon: ClipboardCheck, color: "text-primary" },
    { label: "Mandatory Gaps", value: metrics?.mandatoryGaps || 0, icon: AlertTriangle, color: "text-red-600" },
    { label: "Tenants w/ Gaps", value: metrics?.tenantsWithGaps || 0, icon: Users, color: "text-amber-600" },
    { label: "Avg Close (hrs)", value: metrics?.avgCloseHours || 0, icon: Clock, color: "text-blue-600" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Evidence Readiness Overview
          <Badge variant="outline" className="text-[10px] font-normal">Last 30 days</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-3">
          {items.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="text-center">
                <Icon className={`h-4 w-4 mx-auto mb-1 ${item.color}`} />
                <p className="text-lg font-bold">{item.value}</p>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

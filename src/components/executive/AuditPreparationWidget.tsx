/**
 * AuditPreparationWidget – Executive Dashboard
 *
 * Shows Audit Preparation Activity metrics for the last 30 days:
 * - Packs generated
 * - Packs approved
 * - Tasks generated from packs
 * - Average review time
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, CheckCircle2, ListChecks, Clock } from "lucide-react";

export function AuditPreparationWidget() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: metrics } = useQuery({
    queryKey: ["audit-preparation-activity-30d"],
    queryFn: async () => {
      // Packs generated
      const { count: packsGenerated } = await supabase
        .from("audit_intelligence_packs")
        .select("*", { count: "exact", head: true })
        .gte("generated_at", thirtyDaysAgo);

      // Packs approved
      const { count: packsApproved } = await supabase
        .from("audit_intelligence_packs")
        .select("*", { count: "exact", head: true })
        .eq("status", "approved")
        .gte("generated_at", thirtyDaysAgo);

      // Tasks generated (from audit log)
      const { count: tasksGenerated } = await supabase
        .from("research_audit_log")
        .select("*", { count: "exact", head: true })
        .eq("action", "task_generated")
        .gte("created_at", thirtyDaysAgo);

      // Average review time (approved packs with reviewed_at)
      const { data: reviewedPacks } = await supabase
        .from("audit_intelligence_packs")
        .select("generated_at, reviewed_at")
        .not("reviewed_at", "is", null)
        .gte("generated_at", thirtyDaysAgo);

      let avgReviewHours = 0;
      if (reviewedPacks && reviewedPacks.length > 0) {
        const totalMs = reviewedPacks.reduce((sum, p) => {
          const gen = new Date(p.generated_at).getTime();
          const rev = new Date(p.reviewed_at!).getTime();
          return sum + (rev - gen);
        }, 0);
        avgReviewHours = Math.round(totalMs / reviewedPacks.length / (1000 * 60 * 60));
      }

      return {
        packsGenerated: packsGenerated || 0,
        packsApproved: packsApproved || 0,
        tasksGenerated: tasksGenerated || 0,
        avgReviewHours,
      };
    },
    staleTime: 60_000,
  });

  const items = [
    { label: "Packs Generated", value: metrics?.packsGenerated || 0, icon: ShieldCheck, color: "text-primary" },
    { label: "Approved", value: metrics?.packsApproved || 0, icon: CheckCircle2, color: "text-green-600" },
    { label: "Tasks Created", value: metrics?.tasksGenerated || 0, icon: ListChecks, color: "text-blue-600" },
    { label: "Avg Review (hrs)", value: metrics?.avgReviewHours || 0, icon: Clock, color: "text-amber-600" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Audit Preparation Activity
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

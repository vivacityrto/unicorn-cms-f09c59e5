/**
 * AIResearchActivityWidget – Executive Dashboard
 * 
 * Shows AI Research Activity for the last 7 days:
 * - Jobs created
 * - Jobs approved
 * - High severity risks flagged
 * - Pending reviews
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

export function AIResearchActivityWidget() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: metrics } = useQuery({
    queryKey: ["ai-research-activity-7d"],
    queryFn: async () => {
      // Jobs created in last 7 days
      const { count: jobsCreated } = await supabase
        .from("research_jobs")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo);

      // Jobs with approved findings
      const { data: approvedFindings } = await supabase
        .from("research_findings")
        .select("id, job_id, risk_flags_json")
        .eq("review_status", "approved")
        .gte("created_at", sevenDaysAgo);

      // Pending review count
      const { count: pendingReviews } = await supabase
        .from("research_findings")
        .select("*", { count: "exact", head: true })
        .eq("review_status", "draft");

      // Count high severity risks across all recent findings
      const { data: allRecentFindings } = await supabase
        .from("research_findings")
        .select("risk_flags_json")
        .gte("created_at", sevenDaysAgo);

      let highSeverityCount = 0;
      (allRecentFindings || []).forEach((f: any) => {
        const flags = f.risk_flags_json as any[];
        if (Array.isArray(flags)) {
          highSeverityCount += flags.filter((fl: any) => fl.severity === "high").length;
        }
      });

      return {
        jobsCreated: jobsCreated || 0,
        jobsApproved: approvedFindings?.length || 0,
        highSeverityRisks: highSeverityCount,
        pendingReviews: pendingReviews || 0,
      };
    },
    staleTime: 60_000,
  });

  const items = [
    { label: "Jobs Created", value: metrics?.jobsCreated || 0, icon: FlaskConical, color: "text-primary" },
    { label: "Approved", value: metrics?.jobsApproved || 0, icon: CheckCircle2, color: "text-green-600" },
    { label: "High Risks", value: metrics?.highSeverityRisks || 0, icon: AlertTriangle, color: "text-red-600" },
    { label: "Pending Review", value: metrics?.pendingReviews || 0, icon: Clock, color: "text-amber-600" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          AI Research Activity
          <Badge variant="outline" className="text-[10px] font-normal">Last 7 days</Badge>
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

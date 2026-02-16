/**
 * TemplateHealthWidget – Executive Dashboard widget
 * Shows template analysis metrics: templates analysed, missing clauses, high-risk gaps.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileSearch, Loader2 } from "lucide-react";

export function TemplateHealthWidget() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["template-health-widget"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("template_analysis_jobs")
        .select("id, status, generated_at")
        .gte("generated_at", thirtyDaysAgo)
        .order("generated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: summaries } = useQuery({
    queryKey: ["template-health-summaries"],
    queryFn: async () => {
      const jobIds = (jobs || []).map(j => j.id);
      if (!jobIds.length) return [];
      const { data, error } = await supabase
        .from("template_gap_summary")
        .select("template_analysis_job_id, missing_count, high_risk_gaps_count")
        .in("template_analysis_job_id", jobIds);
      if (error) throw error;
      return data || [];
    },
    enabled: (jobs || []).length > 0,
  });

  const metrics = useMemo(() => {
    const allJobs = jobs || [];
    const allSummaries = summaries || [];
    const withMissing = allSummaries.filter(s => s.missing_count > 0).length;
    const totalHighRisk = allSummaries.reduce((sum, s) => sum + (s.high_risk_gaps_count || 0), 0);
    const awaiting = allJobs.filter(j => j.status === "draft").length;
    return {
      total: allJobs.length,
      withMissing,
      totalHighRisk,
      awaiting,
    };
  }, [jobs, summaries]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-primary" />
          Template Health Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-xl font-bold text-foreground">{metrics.total}</p>
              <p className="text-[10px] text-muted-foreground">Analysed (30d)</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-amber-500">{metrics.withMissing}</p>
              <p className="text-[10px] text-muted-foreground">With Gaps</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-destructive">{metrics.totalHighRisk}</p>
              <p className="text-[10px] text-muted-foreground">High Risk Gaps</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-foreground">{metrics.awaiting}</p>
              <p className="text-[10px] text-muted-foreground">Awaiting Review</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

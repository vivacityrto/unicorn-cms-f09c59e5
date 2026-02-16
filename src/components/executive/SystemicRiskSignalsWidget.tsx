/**
 * SystemicRiskSignalsWidget – Executive Dashboard widget
 * Shows top rising clauses, themes, and high-severity cluster indicator.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radar, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";

export function SystemicRiskSignalsWidget() {
  const { data: events, isLoading } = useQuery({
    queryKey: ["systemic-risk-signals"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("risk_events")
        .select("standard_clause, theme_label, severity, tenant_id, detected_at")
        .eq("status", "open")
        .gte("detected_at", thirtyDaysAgo)
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const analysis = useMemo(() => {
    const all = events || [];
    // Top clauses
    const clauseCounts: Record<string, number> = {};
    const themeCounts: Record<string, number> = {};
    const highTenants = new Set<number>();
    for (const e of all) {
      if (e.standard_clause) clauseCounts[e.standard_clause] = (clauseCounts[e.standard_clause] || 0) + 1;
      if (e.theme_label) themeCounts[e.theme_label] = (themeCounts[e.theme_label] || 0) + 1;
      if (e.severity === "high") highTenants.add(e.tenant_id);
    }
    const topClauses = Object.entries(clauseCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topThemes = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { topClauses, topThemes, highClusterCount: highTenants.size, total: all.length };
  }, [events]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Radar className="h-4 w-4 text-primary" />
          Systemic Risk Signals
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : analysis.total === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No open risk signals in last 30 days.</p>
        ) : (
          <div className="space-y-4">
            {/* Rising Clauses */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Top Clauses</p>
              <div className="space-y-1">
                {analysis.topClauses.map(([clause, count]) => (
                  <div key={clause} className="flex items-center justify-between">
                    <span className="text-xs font-mono">{clause}</span>
                    <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Rising Themes */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Top Themes</p>
              <div className="space-y-1">
                {analysis.topThemes.map(([theme, count]) => (
                  <div key={theme} className="flex items-center justify-between">
                    <span className="text-xs truncate max-w-[200px]">{theme}</span>
                    <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Cluster Indicator */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className={`h-3.5 w-3.5 ${analysis.highClusterCount >= 3 ? 'text-destructive' : 'text-muted-foreground'}`} />
                <span className="text-xs">High severity tenants</span>
              </div>
              <Badge variant={analysis.highClusterCount >= 3 ? "destructive" : "outline"} className="text-[10px]">
                {analysis.highClusterCount}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

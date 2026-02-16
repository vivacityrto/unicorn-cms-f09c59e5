/**
 * ClientRiskForecastWidget – Executive Dashboard widget
 * Shows risk forecast distribution across all tenants.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp } from "lucide-react";

const statusOrder = ["high", "elevated", "emerging", "stable"] as const;

const statusColors: Record<string, string> = {
  stable: "bg-emerald-500",
  emerging: "bg-amber-500",
  elevated: "bg-orange-500",
  high: "bg-destructive",
};

export function ClientRiskForecastWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["client-risk-forecast-widget"],
    queryFn: async () => {
      // Get latest forecast per tenant (most recent date)
      const { data: forecasts, error } = await supabase
        .from("tenant_risk_forecasts")
        .select("tenant_id, composite_risk_index, forecast_risk_status, forecast_date")
        .order("forecast_date", { ascending: false });
      if (error) throw error;

      // Deduplicate to latest per tenant
      const latest = new Map<number, any>();
      (forecasts || []).forEach((f: any) => {
        if (!latest.has(f.tenant_id)) latest.set(f.tenant_id, f);
      });

      const all = Array.from(latest.values());
      const dist: Record<string, number> = { stable: 0, emerging: 0, elevated: 0, high: 0 };
      all.forEach((f: any) => { dist[f.forecast_risk_status] = (dist[f.forecast_risk_status] || 0) + 1; });

      // Count tenants with 14-day increase > 20%
      // (simplified: just count elevated + high as rising)
      const risingCount = dist.elevated + dist.high;

      return { distribution: dist, total: all.length, risingCount };
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Card>
      <CardHeader className="pb-1 flex flex-row items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <CardTitle className="text-xs">Risk Forecast</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.total === 0 ? (
          <p className="text-[10px] text-muted-foreground">No forecast data yet.</p>
        ) : (
          <>
            {/* Distribution bar */}
            <div className="flex h-3 rounded-full overflow-hidden bg-muted">
              {statusOrder.map((s) => {
                const pct = data.total > 0 ? (data.distribution[s] / data.total) * 100 : 0;
                if (pct === 0) return null;
                return (
                  <div
                    key={s}
                    className={`${statusColors[s]} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                );
              })}
            </div>

            {/* Labels */}
            <div className="grid grid-cols-2 gap-1">
              {statusOrder.map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${statusColors[s]}`} />
                  <span className="text-[10px] text-muted-foreground capitalize">{s}</span>
                  <span className="text-[10px] font-medium text-foreground ml-auto">{data.distribution[s]}</span>
                </div>
              ))}
            </div>

            {data.risingCount > 0 && (
              <Badge variant="destructive" className="text-[9px]">
                {data.risingCount} tenant{data.risingCount > 1 ? "s" : ""} elevated/high
              </Badge>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

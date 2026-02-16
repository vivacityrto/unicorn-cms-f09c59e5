/**
 * TenantRiskForecastPanel – Tenant page section
 * Displays the latest risk forecast with composite index, status badge, trend, and key drivers.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, ShieldCheck, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  stable: { color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  emerging: { color: "bg-amber-500/10 text-amber-700 border-amber-500/30", icon: <Info className="h-3.5 w-3.5" /> },
  elevated: { color: "bg-orange-500/10 text-orange-700 border-orange-500/30", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  high: { color: "bg-destructive/10 text-destructive border-destructive/30", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
};

interface Props {
  tenantId: number;
}

export function TenantRiskForecastPanel({ tenantId }: Props) {
  const { data: forecast, isLoading } = useQuery({
    queryKey: ["tenant-risk-forecast", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_risk_forecasts")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("forecast_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  // 7-day trend from history
  const { data: history } = useQuery({
    queryKey: ["risk-forecast-history", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risk_forecast_history")
        .select("snapshot_date, composite_risk_index")
        .eq("tenant_id", tenantId)
        .order("snapshot_date", { ascending: false })
        .limit(14);
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const trend = (() => {
    if (!history || history.length < 2) return "stable";
    const latest = history[0]?.composite_risk_index ?? 0;
    const weekAgo = history.find((h: any) => {
      const d = new Date(h.snapshot_date);
      const diff = (Date.now() - d.getTime()) / 86400000;
      return diff >= 6;
    });
    if (!weekAgo) return "stable";
    const diff = latest - (weekAgo.composite_risk_index ?? 0);
    if (diff > 5) return "deteriorating";
    if (diff < -5) return "improving";
    return "stable";
  })();

  const handleCreateTasks = () => {
    toast({
      title: "Intervention tasks",
      description: "Intervention task creation will be triggered from here. Feature pending full task integration.",
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!forecast) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Risk Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No forecast data available. Run the nightly forecast engine.</p>
        </CardContent>
      </Card>
    );
  }

  const cfg = statusConfig[forecast.forecast_risk_status] || statusConfig.stable;
  const drivers = (forecast.key_risk_drivers_json as string[]) || [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Risk Forecast</CardTitle>
          <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
            {cfg.icon}
            <span className="ml-1 capitalize">{forecast.forecast_risk_status}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Composite Index + Trend */}
        <div className="flex items-center gap-6">
          <div>
            <p className="text-3xl font-bold text-foreground">{Math.round(forecast.composite_risk_index)}</p>
            <p className="text-[10px] text-muted-foreground">Composite Risk Index</p>
          </div>
          <div className="flex items-center gap-1 text-xs">
            {trend === "improving" && <><TrendingDown className="h-3.5 w-3.5 text-emerald-600" /><span className="text-emerald-600">Improving</span></>}
            {trend === "stable" && <><Minus className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">Stable</span></>}
            {trend === "deteriorating" && <><TrendingUp className="h-3.5 w-3.5 text-destructive" /><span className="text-destructive">Deteriorating</span></>}
            <span className="text-[10px] text-muted-foreground ml-1">vs 7d ago</span>
          </div>
        </div>

        {/* Score breakdown */}
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: "Velocity", val: forecast.risk_velocity_score },
            { label: "Concentration", val: forecast.risk_concentration_score },
            { label: "Stagnation", val: forecast.stagnation_score },
            { label: "Evidence", val: forecast.evidence_instability_score },
            { label: "Regulator", val: forecast.regulator_exposure_score },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-sm font-semibold text-foreground">{Math.round(Number(s.val))}</p>
              <p className="text-[9px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Key Risk Drivers */}
        {drivers.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-foreground mb-1">Key Risk Drivers</p>
            <ul className="space-y-0.5">
              {drivers.map((d, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                  <span className="text-destructive mt-0.5">•</span> {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CSC Action Panel */}
        {(forecast.forecast_risk_status === "elevated" || forecast.forecast_risk_status === "high") && (
          <div className="border border-border rounded-md p-2 space-y-2 bg-muted/20">
            <p className="text-[10px] font-semibold text-foreground">Suggested Actions</p>
            <ul className="text-[10px] text-muted-foreground space-y-0.5">
              <li>• Review open high severity risks</li>
              <li>• Review evidence gap recurrence</li>
              <li>• Schedule consult</li>
              <li>• Review stage health summary</li>
            </ul>
            <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={handleCreateTasks}>
              Generate Intervention Task Set
            </Button>
          </div>
        )}

        {/* Mandatory disclaimer */}
        <p className="text-[9px] text-muted-foreground italic">
          This forecast highlights potential emerging risk patterns only and does not determine compliance status.
        </p>
      </CardContent>
    </Card>
  );
}

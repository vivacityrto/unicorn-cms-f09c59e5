/**
 * RegulatorActivityWidget – Executive Dashboard widget showing regulator activity metrics.
 * Metrics: Updates last 30 days, High/Critical count, Pending reviews, Avg review time.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

export function RegulatorActivityWidget() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data: metrics } = useQuery({
    queryKey: ["regulator-activity-30d"],
    queryFn: async () => {
      // Total changes detected last 30 days
      const { count: totalChanges } = await supabase
        .from("regulator_change_events")
        .select("*", { count: "exact", head: true })
        .gte("detected_at", thirtyDaysAgo);

      // High/Critical count
      const { count: highCritical } = await supabase
        .from("regulator_change_events")
        .select("*", { count: "exact", head: true })
        .gte("detected_at", thirtyDaysAgo)
        .in("impact_level", ["high", "critical"]);

      // Pending reviews
      const { count: pendingReviews } = await supabase
        .from("regulator_change_events")
        .select("*", { count: "exact", head: true })
        .eq("review_status", "pending");

      // Avg review time (reviewed events in last 30 days)
      const { data: reviewedEvents } = await supabase
        .from("regulator_change_events")
        .select("detected_at, reviewed_at")
        .gte("detected_at", thirtyDaysAgo)
        .not("reviewed_at", "is", null);

      let avgReviewHours = 0;
      if (reviewedEvents && reviewedEvents.length > 0) {
        const totalHours = reviewedEvents.reduce((sum, evt) => {
          const detected = new Date(evt.detected_at).getTime();
          const reviewed = new Date(evt.reviewed_at!).getTime();
          return sum + (reviewed - detected) / 3600000;
        }, 0);
        avgReviewHours = Math.round(totalHours / reviewedEvents.length);
      }

      return {
        totalChanges: totalChanges || 0,
        highCritical: highCritical || 0,
        pendingReviews: pendingReviews || 0,
        avgReviewHours,
      };
    },
    staleTime: 60_000,
  });

  const items = [
    { label: "Updates Detected", value: metrics?.totalChanges || 0, icon: Globe, color: "text-primary" },
    { label: "High/Critical", value: metrics?.highCritical || 0, icon: AlertTriangle, color: "text-red-600" },
    { label: "Pending Review", value: metrics?.pendingReviews || 0, icon: Clock, color: "text-amber-600" },
    { label: "Avg Review (hrs)", value: metrics?.avgReviewHours || 0, icon: CheckCircle2, color: "text-green-600" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          Regulator Activity
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

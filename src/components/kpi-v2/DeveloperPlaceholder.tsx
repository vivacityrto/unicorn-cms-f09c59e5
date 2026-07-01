import { Card, CardContent } from "@/components/ui/card";
import { Code2, Sparkles } from "lucide-react";

/**
 * DeveloperPlaceholder — coming-soon card for developer role.
 * Developer KPI methodology is still being defined, so this page
 * intentionally shows a low-key placeholder instead of the legacy
 * dev metrics grid to avoid conflicting signals.
 */
export function DeveloperPlaceholder() {
  return (
    <Card className="relative overflow-hidden border border-border/60">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#7130A0] via-[#ED1878] to-[#23C0DD]" />
      <CardContent className="py-10 px-6 flex flex-col items-center text-center gap-3">
        <div
          className="h-12 w-12 rounded-xl flex items-center justify-center text-white"
          style={{ background: "var(--viv-grad-hero)" }}
        >
          <Code2 className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Developer KPIs — coming soon</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">
            Metrics for ticket response, throughput, and delivery are being finalised.
            Your dashboard will populate automatically once methodology sign-off lands.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" /> Q3 rollout
        </div>
      </CardContent>
    </Card>
  );
}

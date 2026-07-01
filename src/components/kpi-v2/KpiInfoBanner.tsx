import { Info } from "lucide-react";

/**
 * KpiInfoBanner — thin explanatory banner set in brand tokens.
 * Uses a low-opacity gradient tint so it reads as info, not a hero.
 */
export function KpiInfoBanner() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-[#7130A0]/20 bg-gradient-to-r from-[#7130A0]/5 via-[#ED1878]/5 to-[#23C0DD]/5">
      <div className="flex items-start gap-3 px-4 py-3">
        <div
          className="mt-0.5 h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-white"
          style={{ background: "var(--viv-grad-hero)" }}
        >
          <Info className="h-4 w-4" />
        </div>
        <div className="text-sm text-foreground/80">
          <div className="font-semibold text-foreground">Your live KPI snapshot</div>
          <p className="text-muted-foreground">
            Metrics update as work is logged in Unicorn. Use the period selector to compare weekly, monthly,
            and quarterly performance. Missing metrics will populate as data sources come online.
          </p>
        </div>
      </div>
    </div>
  );
}

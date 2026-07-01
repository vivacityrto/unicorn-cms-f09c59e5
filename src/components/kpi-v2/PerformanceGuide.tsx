import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpCircle } from "lucide-react";

const BANDS = [
  { label: "On target", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", detail: "Meets or exceeds target." },
  { label: "At risk", className: "bg-amber-500/15 text-amber-700 border-amber-500/30", detail: "Within the warning band — action recommended." },
  { label: "Below target", className: "bg-rose-500/15 text-rose-700 border-rose-500/30", detail: "Below threshold — action required." },
  { label: "No data", className: "bg-muted text-muted-foreground border-border", detail: "Not enough activity in the selected period to grade." },
];

/**
 * PerformanceGuide — legend explaining how gauge colour and status pills
 * are derived. Rendered below the metrics so users can decode any card
 * without leaving the page.
 */
export function PerformanceGuide() {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
          <HelpCircle className="h-4 w-4 text-[#7130A0]" />
          Performance guide
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="grid gap-2 sm:grid-cols-2">
          {BANDS.map((b) => (
            <li key={b.label} className="flex items-start gap-2.5 text-sm">
              <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${b.className}`}>
                {b.label}
              </span>
              <span className="text-muted-foreground">{b.detail}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

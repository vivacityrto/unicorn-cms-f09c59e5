import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { DonutGauge } from "./DonutGauge";
import { cn } from "@/lib/utils";

export type KpiStatus = "on" | "risk" | "below" | "none";

const BADGE: Record<KpiStatus, { label: string; className: string }> = {
  on: {
    label: "On target",
    className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  },
  risk: {
    label: "At risk",
    className: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  },
  below: {
    label: "Below target",
    className: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  },
  none: {
    label: "No data",
    className: "bg-muted text-muted-foreground border-border",
  },
};

interface Props {
  label: string;
  description?: string;
  /** 0–100 for gauges; null for missing data. */
  value: number | null;
  /** Text rendered inside the gauge (e.g. "82%"). */
  primary: string;
  /** Secondary text under the primary (optional, e.g. "of 24"). */
  secondary?: string;
  target: string;
  status: KpiStatus;
  loading?: boolean;
  footer?: React.ReactNode;
  onClick?: () => void;
}

/**
 * KpiGaugeCard — presentation card wrapping a DonutGauge with metric metadata.
 * Layout: label + status pill on top, donut centred, target + footer below.
 * The status controls both the badge tone and the ring colour semantics
 * (brand gradient for "on", amber for "risk", rose for "below", muted otherwise).
 */
export function KpiGaugeCard({
  label,
  description,
  value,
  primary,
  secondary,
  target,
  status,
  loading,
  footer,
  onClick,
}: Props) {
  const tone =
    status === "on" ? "brand" : status === "risk" ? "amber" : status === "below" ? "rose" : "muted";

  const clickable = typeof onClick === "function";

  return (
    <Card
      onClick={onClick}
      onKeyDown={(e) => {
        if (!clickable) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${label} — view details` : undefined}
      className={cn(
        "relative overflow-hidden border border-border/60 shadow-sm transition-all",
        clickable
          ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:border-[#7130A0]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7130A0]/40"
          : "hover:shadow-md"
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#7130A0] via-[#ED1878] to-[#23C0DD] opacity-80" />
      <CardContent className="pt-6 pb-5 px-5 flex flex-col items-center gap-4">
        <div className="w-full flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-muted-foreground">
              {label}
            </div>
            {description && (
              <div className="mt-1 text-xs text-muted-foreground/80 line-clamp-2">{description}</div>
            )}
          </div>
          <Badge className={cn("shrink-0 border", BADGE[status].className)} variant="outline">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : BADGE[status].label}
          </Badge>
        </div>

        <DonutGauge value={value} primary={primary} secondary={secondary} tone={tone} />

        <div className="w-full flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{target}</span>
          {footer && <span className="text-muted-foreground">{footer}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

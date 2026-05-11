import { Badge } from "@/components/ui/badge";
import type { PdpAudience, PdpCycle } from "@/features/pdp/types";

interface Props {
  cycle: PdpCycle | null;
  audience: PdpAudience | null;
}

const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  planning:     { label: "Planning",     variant: "outline" },
  active:       { label: "Active",       variant: "default" },
  under_review: { label: "Under review", variant: "secondary" },
  completed:    { label: "Completed",    variant: "secondary" },
};

export function PdpHeaderBand({ cycle, audience }: Props) {
  const statusKey = (cycle?.status ?? "planning").toLowerCase();
  const meta = STATUS_META[statusKey] ?? STATUS_META.planning;
  const subtitle = cycle
    ? `${audience?.label ?? cycle.audience_code} · Cycle ${cycle.cycle_year}`
    : "Set up your professional development for this year";

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-[var(--viv-purple)]">
          My Professional Development Plan
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>
      {cycle && <Badge variant={meta.variant}>{meta.label}</Badge>}
    </div>
  );
}

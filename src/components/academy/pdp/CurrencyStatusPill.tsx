import { Badge } from "@/components/ui/badge";
import type { CurrencyStatus } from "@/features/pdp/types";

interface Props {
  status: CurrencyStatus | string | null | undefined;
}

const META: Record<CurrencyStatus, { label: string; bg: string; fg: string }> = {
  current:    { label: "Current",  bg: "#10B981", fg: "#FFFFFF" }, // emerald
  on_track:   { label: "On track", bg: "#23C0DD", fg: "#0B3B45" }, // cyan
  at_risk:    { label: "At risk",  bg: "#F9CB0C", fg: "#3F2E00" }, // macaron
  overdue:    { label: "Overdue",  bg: "#ED1878", fg: "#FFFFFF" }, // fuchsia
};

export function CurrencyStatusPill({ status }: Props) {
  const key = (status ?? "on_track") as CurrencyStatus;
  const meta = META[key] ?? META.on_track;
  return (
    <Badge
      className="px-3 py-1 text-xs font-semibold border-0"
      style={{ backgroundColor: meta.bg, color: meta.fg }}
    >
      {meta.label}
    </Badge>
  );
}

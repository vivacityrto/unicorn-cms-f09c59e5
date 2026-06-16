import type { UserCapacity } from "@/hooks/useUserCapacity";

interface Props {
  capacity?: UserCapacity;
}

export function CapacityPill({ capacity }: Props) {
  if (!capacity) return null;
  const label = capacity.isUnlimited
    ? `${capacity.used} users · Unlimited`
    : `${capacity.used} of ${capacity.limit} users`;
  const tone = capacity.atLimit
    ? "bg-destructive/10 text-destructive border-destructive/30"
    : capacity.isUnlimited
      ? "bg-muted text-muted-foreground border-border"
      : "bg-primary/10 text-primary border-primary/30";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

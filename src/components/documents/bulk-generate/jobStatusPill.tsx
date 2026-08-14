import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type JobStatus =
  | "queued"
  | "running"
  | "stalled"
  | "completed"
  | "cancelled"
  | "failed"
  | string;

const STYLES: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
  running: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  // stalled = distinct amber styling, per plan
  stalled: "bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  cancelled: "bg-slate-200 text-slate-700 border-slate-400 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
  failed: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
};

const LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  stalled: "Stalled",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

const ITEM_STYLES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
  leased: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  generated: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  succeeded: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  skipped: "bg-slate-200 text-slate-700 border-slate-400 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
  failed: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  cancelled: "bg-slate-200 text-slate-700 border-slate-400 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
};

const ITEM_LABELS: Record<string, string> = {
  pending: "Pending",
  leased: "In progress",
  generated: "Generated",
  succeeded: "Generated",
  skipped: "Skipped",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function JobStatusPill({
  status,
  className,
}: {
  status: JobStatus;
  className?: string;
}) {
  const s = String(status ?? "").toLowerCase();
  const style = STYLES[s] ?? "bg-muted text-foreground border-border";
  const label = LABELS[s] ?? s;
  return (
    <Badge
      variant="outline"
      className={cn("border font-medium", style, className)}
    >
      {label}
    </Badge>
  );
}

export function ItemStatePill({
  state,
  className,
}: {
  state: string;
  className?: string;
}) {
  const s = String(state ?? "").toLowerCase();
  const style = ITEM_STYLES[s] ?? "bg-muted text-foreground border-border";
  const label = ITEM_LABELS[s] ?? s;
  return (
    <Badge
      variant="outline"
      className={cn("border font-medium", style, className)}
    >
      {label}
    </Badge>
  );
}

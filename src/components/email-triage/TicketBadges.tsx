import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_CLASSES: Record<string, string> = {
  lead: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  client: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20",
  tech: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  billing: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  general: "bg-muted text-muted-foreground border-border",
};

const STATUS_CLASSES: Record<string, string> = {
  open: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  in_progress: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  closed: "bg-muted text-muted-foreground border-border",
};

export function CategoryBadge({
  value,
  label,
}: {
  value: string | null | undefined;
  label?: string;
}) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  const cls = CATEGORY_CLASSES[value] ?? "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="secondary" className={cn("font-medium", cls)}>
      {label ?? value}
    </Badge>
  );
}

export function StatusBadge({
  value,
  label,
}: {
  value: string | null | undefined;
  label?: string;
}) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  const cls = STATUS_CLASSES[value] ?? "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="secondary" className={cn("font-medium capitalize", cls)}>
      {label ?? value.replace(/_/g, " ")}
    </Badge>
  );
}

export function UrgentIcon({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <AlertTriangle
      className="h-4 w-4 text-destructive shrink-0"
      aria-label="Urgent"
    />
  );
}

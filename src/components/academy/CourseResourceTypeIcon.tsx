import { FileText, Link2 } from "lucide-react";
import type { CourseResourceKind } from "@/lib/academy/courseResources";
import { cn } from "@/lib/utils";

const LABELS: Record<CourseResourceKind, string> = {
  pdf: "PDF",
  word: "Word",
  link: "Link",
};

export function CourseResourceTypeIcon({
  kind,
  className,
}: {
  kind: CourseResourceKind;
  className?: string;
}) {
  const label = LABELS[kind];
  const iconClass = cn("h-3.5 w-3.5 shrink-0", className);
  return (
    <span className="inline-flex items-center" title={label} aria-label={label}>
      {kind === "link" ? (
        <Link2 className={cn(iconClass, "text-teal-600 dark:text-teal-400")} />
      ) : kind === "word" ? (
        <FileText className={cn(iconClass, "text-blue-600 dark:text-blue-400")} />
      ) : (
        <FileText className={cn(iconClass, "text-red-600 dark:text-red-400")} />
      )}
    </span>
  );
}

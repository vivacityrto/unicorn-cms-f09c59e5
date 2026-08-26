import { FileText, Link2, Sheet, FileCode, NotebookPen } from "lucide-react";
import type { CourseResourceKind } from "@/lib/academy/courseResources";
import { cn } from "@/lib/utils";

const LABELS: Record<CourseResourceKind, string> = {
  pdf: "PDF",
  word: "Word",
  excel: "Excel",
  markdown: "Markdown",
  link: "Link",
};

export function CourseResourceTypeIcon({
  kind,
  category,
  className,
}: {
  kind: CourseResourceKind;
  category?: string | null;
  className?: string;
}) {
  const iconClass = cn("h-3.5 w-3.5 shrink-0", className);

  if (category === "workbooks") {
    return (
      <span className="inline-flex items-center" title="Workbook" aria-label="Workbook">
        <NotebookPen className={cn(iconClass, "text-purple-600 dark:text-purple-400")} />
      </span>
    );
  }

  const label = LABELS[kind];
  return (
    <span className="inline-flex items-center" title={label} aria-label={label}>
      {kind === "link" ? (
        <Link2 className={cn(iconClass, "text-teal-600 dark:text-teal-400")} />
      ) : kind === "word" ? (
        <FileText className={cn(iconClass, "text-blue-600 dark:text-blue-400")} />
      ) : kind === "excel" ? (
        <Sheet className={cn(iconClass, "text-emerald-600 dark:text-emerald-400")} />
      ) : kind === "markdown" ? (
        <FileCode className={cn(iconClass, "text-slate-600 dark:text-slate-400")} />
      ) : (
        <FileText className={cn(iconClass, "text-red-600 dark:text-red-400")} />
      )}
    </span>
  );
}

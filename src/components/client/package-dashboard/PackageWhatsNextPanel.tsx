import { format, differenceInCalendarDays } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ClientPackageWhatsNextRow,
  TaskUrgency,
} from "@/hooks/use-client-package-whats-next";

interface Props {
  items: ClientPackageWhatsNextRow[];
  isLoading: boolean;
  isError: boolean;
  packageInstanceId: number;
}

const SectionHeading = () => (
  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
    What's next for you
  </h4>
);

const DOT_COLOR: Record<TaskUrgency, string> = {
  overdue: "bg-red-500",
  due_soon: "bg-amber-500",
  upcoming: "bg-blue-500",
  recurring: "bg-violet-500",
  untimed: "bg-slate-400",
};

export function PackageWhatsNextPanel({
  items,
  isLoading,
  isError,
  packageInstanceId,
}: Props) {
  if (isLoading) {
    return (
      <div className="mt-6 space-y-3">
        <SectionHeading />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-6 space-y-3">
        <SectionHeading />
        <Alert variant="destructive">
          <AlertDescription>Couldn't load tasks.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mt-6 space-y-2">
        <SectionHeading />
        <p className="text-sm text-muted-foreground">
          Nothing on your list right now. Nice work.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <SectionHeading />
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={`${item.source}-${item.task_uid}`}>
            <button
              type="button"
              // TODO(week2-routes): route to /tasks/{task_uid} for both sources
              className="w-full flex items-start gap-3 rounded-md border border-border bg-card hover:bg-accent/40 transition-colors px-3 py-2 text-left"
            >
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${DOT_COLOR[item.urgency]}`}
              />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-foreground truncate">
                  {item.title}
                </span>
                <span className={`block text-xs ${subLineColor(item.urgency)}`}>
                  {subLineText(item)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <a
        // TODO(week2-routes): route to /tasks?package_instance_id={packageInstanceId}
        href={`/tasks?package_instance_id=${packageInstanceId}`}
        className="inline-block text-xs font-medium text-primary hover:underline"
      >
        View all tasks
      </a>
    </div>
  );
}

function subLineColor(u: TaskUrgency): string {
  if (u === "overdue") return "text-red-500";
  if (u === "due_soon") return "text-amber-700 dark:text-amber-500";
  return "text-muted-foreground";
}

function subLineText(item: ClientPackageWhatsNextRow): string {
  const due = item.due_at ? new Date(item.due_at) : null;
  switch (item.urgency) {
    case "overdue":
      return due ? `Overdue — was due ${format(due, "d MMM")}` : "Overdue";
    case "due_soon": {
      if (!due) return "Due soon";
      const days = Math.max(0, differenceInCalendarDays(due, new Date()));
      return days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`;
    }
    case "upcoming":
      return due ? `Due ${format(due, "d MMM yyyy")}` : "Upcoming";
    case "recurring":
      return "Recurring — within 14 days";
    case "untimed":
    default:
      return "No due date";
  }
}

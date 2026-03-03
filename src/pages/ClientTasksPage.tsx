import { useState } from "react";
import { useClientAllTasks, type ClientAllTask } from "@/hooks/useClientAllTasks";
import { useTaskStatusOptions, getStatusLabel } from "@/hooks/useTaskStatusOptions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Clock, CheckCircle2, ListFilter } from "lucide-react";
import { format } from "date-fns";

type FilterType = "all" | "overdue" | "due_soon" | "completed";

export default function ClientTasksPage() {
  const { data: tasks = [], isLoading } = useClientAllTasks();
  const { statuses } = useTaskStatusOptions();
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered = tasks.filter((t) => {
    if (filter === "overdue") return t.isOverdue;
    if (filter === "due_soon") return t.isDueSoon;
    if (filter === "completed") return t.status === 2;
    return true;
  });

  const overdueCount = tasks.filter((t) => t.isOverdue).length;
  const dueSoonCount = tasks.filter((t) => t.isDueSoon).length;
  const completedCount = tasks.filter((t) => t.status === 2).length;

  const filters: { key: FilterType; label: string; count: number }[] = [
    { key: "all", label: "All", count: tasks.length },
    { key: "overdue", label: "Overdue", count: overdueCount },
    { key: "due_soon", label: "Due Soon", count: dueSoonCount },
    { key: "completed", label: "Completed", count: completedCount },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "hsl(270 47% 26%)" }}>
          Tasks
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          All your tasks across every package and stage.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.key)}
            className="gap-1.5"
          >
            {f.key === "overdue" && <AlertTriangle className="h-3.5 w-3.5" />}
            {f.key === "due_soon" && <Clock className="h-3.5 w-3.5" />}
            {f.key === "completed" && <CheckCircle2 className="h-3.5 w-3.5" />}
            {f.key === "all" && <ListFilter className="h-3.5 w-3.5" />}
            {f.label}
            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
              {f.count}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Task table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No tasks match this filter.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden" style={{ borderColor: "hsl(270 20% 88%)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50" style={{ borderColor: "hsl(270 20% 88%)" }}>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Task</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Package</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Stage</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Due Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => (
                  <TaskRow key={task.id} task={task} statuses={statuses} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, statuses }: { task: ClientAllTask; statuses: any[] }) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors" style={{ borderColor: "hsl(270 20% 88%)" }}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {task.isOverdue && (
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-destructive" />
          )}
          <span className="font-medium" style={{ color: "hsl(270 47% 26%)" }}>
            {task.taskName}
          </span>
        </div>
        {/* Mobile-only package/stage info */}
        <div className="md:hidden text-xs text-muted-foreground mt-0.5">
          {task.packageName} · {task.stageName}
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{task.packageName}</td>
      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{task.stageName}</td>
      <td className="px-4 py-3">
        {task.dueDate ? (
          <span className={task.isOverdue ? "text-destructive font-medium" : task.isDueSoon ? "text-orange-600 font-medium" : "text-muted-foreground"}>
            {format(new Date(task.dueDate), "dd MMM yyyy")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge
          variant={task.status === 2 ? "default" : task.isOverdue ? "destructive" : "secondary"}
          className="text-xs"
        >
          {getStatusLabel(task.status, statuses)}
        </Badge>
      </td>
    </tr>
  );
}

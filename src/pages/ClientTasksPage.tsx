import { useState } from "react";
import { useClientAllTasks, type ClientAllTask } from "@/hooks/useClientAllTasks";
import { useTaskStatusOptions, getStatusLabel } from "@/hooks/useTaskStatusOptions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Clock, CheckCircle2, ListFilter, Paperclip } from "lucide-react";
import { format } from "date-fns";

type FilterType = "all" | "overdue" | "due_soon" | "completed";

function priorityLabel(p: number | null | undefined) {
  switch (p) {
    case 1: return <Badge variant="destructive" className="text-xs">High</Badge>;
    case 2: return <Badge className="bg-amber-500/15 text-amber-700 border-amber-200 text-xs">Medium</Badge>;
    default: return <Badge variant="secondary" className="text-xs">Normal</Badge>;
  }
}

export default function ClientTasksPage() {
  const { data: tasks = [], isLoading } = useClientAllTasks();
  const { statuses } = useTaskStatusOptions();
  const [filter, setFilter] = useState<FilterType>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());

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

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((t) => t.id)));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-secondary">Tasks</h1>
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

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/60 border border-border">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selected
          </span>
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          {/* Future: Mark complete / Upload evidence bulk actions */}
        </div>
      )}

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
        <div className="border rounded-lg overflow-hidden border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 border-border">
                  <th className="px-4 py-3 w-10">
                    <Checkbox
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Task</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Package</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Stage</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Due Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    statuses={statuses}
                    isSelected={selected.has(task.id)}
                    onToggle={() => toggleSelect(task.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  statuses,
  isSelected,
  onToggle,
}: {
  task: ClientAllTask;
  statuses: any[];
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors border-border">
      <td className="px-4 py-3">
        <Checkbox checked={isSelected} onCheckedChange={onToggle} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {task.isOverdue && (
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-destructive" />
          )}
          {task.attachmentRequired && (
            <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          )}
          <span className="font-medium text-foreground">{task.taskName}</span>
        </div>
        <div className="md:hidden text-xs text-muted-foreground mt-0.5">
          {task.packageName} · {task.stageName}
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{task.packageName}</td>
      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{task.stageName}</td>
      <td className="px-4 py-3 hidden lg:table-cell">{priorityLabel(task.priority)}</td>
      <td className="px-4 py-3">
        {task.dueDate ? (
          <span className={task.isOverdue ? "text-destructive font-medium" : task.isDueSoon ? "text-amber-600 font-medium" : "text-muted-foreground"}>
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

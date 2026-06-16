import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useClientAllTasks, type UnifiedTask } from "@/hooks/useClientAllTasks";
import { useTaskStatusOptions, getStatusLabel } from "@/hooks/useTaskStatusOptions";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Clock, CheckCircle2, ListFilter, Paperclip, User } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type FilterType = "all" | "overdue" | "due_soon" | "completed";
type ViewType = "all" | "mine";

const ACTION_ITEM_STATUSES: { value: string; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "waiting_client", label: "Waiting on Client" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

function priorityLabel(p: number | null | undefined) {
  switch (p) {
    case 1:
      return <Badge variant="destructive" className="text-xs">Urgent</Badge>;
    case 2:
      return <Badge variant="destructive" className="text-xs">High</Badge>;
    case 3:
      return <Badge className="bg-amber-500/15 text-amber-700 border-amber-200 text-xs">Medium</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs">Low</Badge>;
  }
}

function isTaskCompleted(t: UnifiedTask) {
  if (t.source === "stage_task") return t.status === 2;
  return t.actionItemStatus === "done";
}

export default function ClientTasksPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: tasks = [], isLoading } = useClientAllTasks(showArchived);
  const { statuses } = useTaskStatusOptions();
  const { canManagePortalUsers } = useClientTenant();
  const { profile } = useAuth();
  const currentUserId = profile?.user_uuid ?? null;
  const queryClient = useQueryClient();

  const [view, setView] = useState<ViewType>("all");
  const [filter, setFilter] = useState<FilterType>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Optimistic local overrides for action-item status changes.
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});

  const effectiveTasks = useMemo(
    () =>
      tasks.map((t) =>
        t.actionItemId && statusOverrides[t.actionItemId]
          ? {
              ...t,
              status: statusOverrides[t.actionItemId],
              actionItemStatus: statusOverrides[t.actionItemId],
            }
          : t,
      ),
    [tasks, statusOverrides],
  );

  const viewScoped = useMemo(() => {
    if (view === "mine") {
      return effectiveTasks.filter(
        (t) => t.source === "action_item" && t.assigneeUserId === currentUserId,
      );
    }
    return effectiveTasks;
  }, [effectiveTasks, view, currentUserId]);

  const filtered = viewScoped.filter((t) => {
    if (filter === "overdue") return t.isOverdue;
    if (filter === "due_soon") return t.isDueSoon;
    if (filter === "completed") return isTaskCompleted(t);
    return true;
  });

  const overdueCount = viewScoped.filter((t) => t.isOverdue).length;
  const dueSoonCount = viewScoped.filter((t) => t.isDueSoon).length;
  const completedCount = viewScoped.filter((t) => isTaskCompleted(t)).length;
  const myCount = effectiveTasks.filter(
    (t) => t.source === "action_item" && t.assigneeUserId === currentUserId,
  ).length;

  const filters: { key: FilterType; label: string; count: number }[] = [
    { key: "all", label: "All", count: viewScoped.length },
    { key: "overdue", label: "Overdue", count: overdueCount },
    { key: "due_soon", label: "Due Soon", count: dueSoonCount },
    { key: "completed", label: "Completed", count: completedCount },
  ];

  const toggleSelect = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((t) => t.uid)));
    }
  };

  const handleActionItemStatusChange = async (
    actionItemId: string,
    previousStatus: string | null,
    newStatus: string,
  ) => {
    setStatusOverrides((prev) => ({ ...prev, [actionItemId]: newStatus }));
    const { error } = await supabase
      .from("client_action_items")
      .update({
        status: newStatus,
        completed_at: newStatus === "done" ? new Date().toISOString() : null,
        completed_by: newStatus === "done" ? currentUserId : null,
      })
      .eq("id", actionItemId);

    if (error) {
      // Revert optimistic state
      setStatusOverrides((prev) => {
        const next = { ...prev };
        if (previousStatus) next[actionItemId] = previousStatus;
        else delete next[actionItemId];
        return next;
      });
      toast.error(`Could not update status: ${error.message}`);
      return;
    }

    toast.success("Status updated");
    await queryClient.invalidateQueries({ queryKey: ["client-all-tasks"] });
    // Clear override once refetched data lands.
    setStatusOverrides((prev) => {
      const next = { ...prev };
      delete next[actionItemId];
      return next;
    });
  };

  const views: { key: ViewType; label: string; count: number }[] = [
    { key: "all", label: "All Tasks", count: effectiveTasks.length },
    { key: "mine", label: "My Tasks", count: myCount },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-secondary">Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All your tasks across every package and stage.
        </p>
      </div>

      {/* View tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {views.map((v) => (
          <Button
            key={v.key}
            variant={view === v.key ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setView(v.key);
              setSelected(new Set());
            }}
            className="gap-1.5"
          >
            {v.key === "mine" && <User className="h-3.5 w-3.5" />}
            {v.label}
            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
              {v.count}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Show archived toggle */}
      <div className="flex items-center justify-end gap-2">
        <Label htmlFor="show-archived-toggle" className="text-sm text-muted-foreground cursor-pointer">
          Show archived
        </Label>
        <Switch
          id="show-archived-toggle"
          checked={showArchived}
          onCheckedChange={setShowArchived}
        />
        {!showArchived && (
          <span className="text-xs text-muted-foreground">(hidden by default)</span>
        )}
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

      {/* Bulk action bar — Admin only */}
      {canManagePortalUsers && selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/60 border border-border">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selected
          </span>
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
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
                  {canManagePortalUsers && (
                    <th className="px-4 py-3 w-10">
                      <Checkbox
                        checked={selected.size === filtered.length && filtered.length > 0}
                        onCheckedChange={toggleAll}
                      />
                    </th>
                  )}
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Task</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Package</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Stage</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Assignee</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Due Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => (
                  <TaskRow
                    key={task.uid}
                    task={task}
                    statuses={statuses}
                    isSelected={selected.has(task.uid)}
                    onToggle={() => toggleSelect(task.uid)}
                    showCheckbox={canManagePortalUsers}
                    onActionItemStatusChange={handleActionItemStatusChange}
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
  showCheckbox = true,
  onActionItemStatusChange,
}: {
  task: UnifiedTask;
  statuses: any[];
  isSelected: boolean;
  onToggle: () => void;
  showCheckbox?: boolean;
  onActionItemStatusChange: (
    actionItemId: string,
    previousStatus: string | null,
    newStatus: string,
  ) => void | Promise<void>;
}) {
  const isActionItem = task.source === "action_item";

  return (
    <tr
      className={`border-b last:border-0 hover:bg-muted/30 transition-colors border-border ${
        task.isArchived ? "opacity-60" : ""
      }`}
    >
      {showCheckbox && (
        <td className="px-4 py-3">
          <Checkbox checked={isSelected} onCheckedChange={onToggle} />
        </td>
      )}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {task.isOverdue && (
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-destructive" />
          )}
          {task.attachmentRequired && (
            <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          )}
          <span
            className={`font-medium text-foreground ${
              task.isArchived ? "line-through" : ""
            }`}
          >
            {task.taskName}
          </span>
          {isActionItem && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Action
            </Badge>
          )}
        </div>
        <div className="md:hidden text-xs text-muted-foreground mt-0.5">
          {task.packageName}
          {task.stageName ? ` · ${task.stageName}` : ""}
          {task.assigneeName ? ` · ${task.assigneeName}` : ""}
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
        {task.packageName}
      </td>
      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
        {task.stageName ?? "—"}
      </td>
      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
        {task.assigneeName ?? "—"}
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">{priorityLabel(task.priority)}</td>
      <td className="px-4 py-3">
        {task.dueDate ? (
          <span
            className={
              task.isOverdue
                ? "text-destructive font-medium"
                : task.isDueSoon
                ? "text-amber-600 font-medium"
                : "text-muted-foreground"
            }
          >
            {format(new Date(task.dueDate), "dd MMM yyyy")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isActionItem ? (
            <Select
              value={(task.actionItemStatus ?? "todo") as string}
              onValueChange={(v) =>
                onActionItemStatusChange(task.actionItemId!, task.actionItemStatus, v)
              }
            >
              <SelectTrigger className="h-7 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_ITEM_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge
              variant={
                task.status === 2
                  ? "default"
                  : task.isOverdue
                  ? "destructive"
                  : "secondary"
              }
              className="text-xs"
            >
              {getStatusLabel(task.status as number, statuses)}
            </Badge>
          )}
          {task.isArchived && (
            <Badge variant="outline" className="text-xs">
              Archived
            </Badge>
          )}
        </div>
      </td>
    </tr>
  );
}

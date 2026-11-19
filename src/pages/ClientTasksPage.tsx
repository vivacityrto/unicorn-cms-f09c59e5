import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClientAllTasks, type UnifiedTask } from "@/hooks/useClientAllTasks";

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
import { AlertTriangle, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { summariseTasks } from "@/components/client/tasks/taskInsights";
import { TaskFilterCards, TasksBanner, TasksInsightPanel, type TaskFilter } from "@/components/client/tasks/TasksOverview";

type FilterType = TaskFilter;
type ViewType = "all" | "mine";

const ACTION_ITEM_STATUSES: { value: string; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "waiting_client", label: "Waiting on Client" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_OPTIONS: {
  value: "urgent" | "high" | "medium" | "low";
  label: string;
  triggerClass: string;
}[] = [
  { value: "urgent", label: "Urgent", triggerClass: "bg-destructive/15 text-destructive border-destructive/30" },
  { value: "high", label: "High", triggerClass: "bg-destructive/10 text-destructive border-destructive/30" },
  { value: "medium", label: "Medium", triggerClass: "bg-amber-500/15 text-amber-700 border-amber-200" },
  { value: "low", label: "Low", triggerClass: "bg-muted text-muted-foreground border-border" },
];

const UNASSIGNED = "__unassigned__";

function numericToPriorityString(p: number | null | undefined): "urgent" | "high" | "medium" | "low" {
  switch (p) {
    case 1:
      return "urgent";
    case 2:
      return "high";
    case 4:
      return "low";
    default:
      return "medium";
  }
}

function isTaskCompleted(t: UnifiedTask) {
  return t.actionItemStatus === "done";
}

type PortalUser = {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

function userDisplayName(u: PortalUser): string {
  const full = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  return full || u.email || "Unknown user";
}

export default function ClientTasksPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: tasks = [], isLoading } = useClientAllTasks(showArchived);
  
  const { canManagePortalUsers, activeTenantId } = useClientTenant();
  const { profile } = useAuth();
  const currentUserId = profile?.user_uuid ?? null;
  const queryClient = useQueryClient();

  const [view, setView] = useState<ViewType>("all");
  const [filter, setFilter] = useState<FilterType>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Optimistic local overrides for action-item edits.
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [assigneeOverrides, setAssigneeOverrides] = useState<Record<string, string | null>>({});
  const [priorityOverrides, setPriorityOverrides] = useState<
    Record<string, "urgent" | "high" | "medium" | "low">
  >({});

  const { data: portalUsers = [] } = useQuery<PortalUser[]>({
    queryKey: ["client-tenant-portal-users", activeTenantId],
    enabled: !!activeTenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, email")
        .eq("tenant_id", activeTenantId as number)
        .eq("is_vivacity_internal", false)
        .order("first_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PortalUser[];
    },
  });

  const effectiveTasks = useMemo(
    () =>
      tasks.map((t) => {
        if (!t.actionItemId) return t;
        let next = t;
        const statusOv = statusOverrides[t.actionItemId];
        if (statusOv) {
          next = { ...next, status: statusOv, actionItemStatus: statusOv };
        }
        if (t.actionItemId in assigneeOverrides) {
          const newAssignee = assigneeOverrides[t.actionItemId];
          const u = newAssignee ? portalUsers.find((p) => p.user_uuid === newAssignee) : null;
          next = {
            ...next,
            assigneeUserId: newAssignee,
            assigneeName: u ? userDisplayName(u) : null,
          };
        }
        const priorityOv = priorityOverrides[t.actionItemId];
        if (priorityOv) {
          const numeric = { urgent: 1, high: 2, medium: 3, low: 4 }[priorityOv];
          next = { ...next, priority: numeric };
        }
        return next;
      }),
    [tasks, statusOverrides, assigneeOverrides, priorityOverrides, portalUsers],
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

  const counts: Record<FilterType, number> = {
    all: viewScoped.length,
    overdue: overdueCount,
    due_soon: dueSoonCount,
    completed: completedCount,
  };
  const summary = useMemo(() => summariseTasks(viewScoped), [viewScoped]);

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
    setStatusOverrides((prev) => {
      const next = { ...prev };
      delete next[actionItemId];
      return next;
    });
  };

  const handleAssigneeChange = async (
    actionItemId: string,
    previousAssignee: string | null,
    newAssignee: string | null,
  ) => {
    setAssigneeOverrides((prev) => ({ ...prev, [actionItemId]: newAssignee }));
    const { error } = await supabase
      .from("client_action_items")
      .update({ assignee_user_id: newAssignee })
      .eq("id", actionItemId);

    if (error) {
      setAssigneeOverrides((prev) => ({ ...prev, [actionItemId]: previousAssignee }));
      toast.error(`Could not update assignee: ${error.message}`);
      return;
    }

    toast.success("Assignee updated");
    await queryClient.invalidateQueries({ queryKey: ["client-all-tasks"] });
    setAssigneeOverrides((prev) => {
      const next = { ...prev };
      delete next[actionItemId];
      return next;
    });
  };

  const handlePriorityChange = async (
    actionItemId: string,
    previousPriority: "urgent" | "high" | "medium" | "low",
    newPriority: "urgent" | "high" | "medium" | "low",
  ) => {
    setPriorityOverrides((prev) => ({ ...prev, [actionItemId]: newPriority }));
    const { error } = await supabase
      .from("client_action_items")
      .update({ priority: newPriority })
      .eq("id", actionItemId);

    if (error) {
      setPriorityOverrides((prev) => ({ ...prev, [actionItemId]: previousPriority }));
      toast.error(`Could not update priority: ${error.message}`);
      return;
    }

    toast.success("Priority updated");
    await queryClient.invalidateQueries({ queryKey: ["client-all-tasks"] });
    setPriorityOverrides((prev) => {
      const next = { ...prev };
      delete next[actionItemId];
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <TasksBanner
        summary={summary}
        mineCount={myCount}
        mineOnly={view === "mine"}
        onToggleMine={() => {
          setView(view === "mine" ? "all" : "mine");
          setSelected(new Set());
        }}
        archivedControl={
          <div className="flex items-center gap-2">
            <Label htmlFor="show-archived-toggle" className="cursor-pointer text-xs text-white/90">
              Show archived
            </Label>
            <Switch id="show-archived-toggle" checked={showArchived} onCheckedChange={setShowArchived} />
          </div>
        }
      />

      <TaskFilterCards summary={summary} counts={counts} active={filter} onSelect={setFilter} />

      <TasksInsightPanel summary={summary} />

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
                    isSelected={selected.has(task.uid)}
                    onToggle={() => toggleSelect(task.uid)}
                    showCheckbox={canManagePortalUsers}
                    portalUsers={portalUsers}
                    onActionItemStatusChange={handleActionItemStatusChange}
                    onAssigneeChange={handleAssigneeChange}
                    onPriorityChange={handlePriorityChange}
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
  isSelected,
  onToggle,
  showCheckbox = true,
  portalUsers,
  onActionItemStatusChange,
  onAssigneeChange,
  onPriorityChange,
}: {
  task: UnifiedTask;
  isSelected: boolean;
  onToggle: () => void;
  showCheckbox?: boolean;
  portalUsers: PortalUser[];
  onActionItemStatusChange: (
    actionItemId: string,
    previousStatus: string | null,
    newStatus: string,
  ) => void | Promise<void>;
  onAssigneeChange: (
    actionItemId: string,
    previousAssignee: string | null,
    newAssignee: string | null,
  ) => void | Promise<void>;
  onPriorityChange: (
    actionItemId: string,
    previousPriority: "urgent" | "high" | "medium" | "low",
    newPriority: "urgent" | "high" | "medium" | "low",
  ) => void | Promise<void>;
}) {
  const currentPriority = numericToPriorityString(task.priority);
  const priorityOption =
    PRIORITY_OPTIONS.find((p) => p.value === currentPriority) ?? PRIORITY_OPTIONS[2];

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
      <td className="px-4 py-3 hidden md:table-cell">
        <Select
          value={task.assigneeUserId ?? UNASSIGNED}
          onValueChange={(v) =>
            onAssigneeChange(
              task.actionItemId!,
              task.assigneeUserId ?? null,
              v === UNASSIGNED ? null : v,
            )
          }
        >
          <SelectTrigger className="h-7 w-[180px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED} className="text-xs">
              Unassigned
            </SelectItem>
            {portalUsers.map((u) => (
              <SelectItem key={u.user_uuid} value={u.user_uuid} className="text-xs">
                {userDisplayName(u)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <Select
          value={currentPriority}
          onValueChange={(v) =>
            onPriorityChange(
              task.actionItemId!,
              currentPriority,
              v as "urgent" | "high" | "medium" | "low",
            )
          }
        >
          <SelectTrigger
            className={`h-6 w-[110px] text-xs rounded-full border px-2.5 font-medium ${priorityOption.triggerClass}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-xs">
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
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

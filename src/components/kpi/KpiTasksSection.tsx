import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  CalendarIcon,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type KpiTaskStatus = "pending" | "done_on_time" | "rectified" | "delayed" | string;

interface KpiTaskRow {
  id: number;
  assignee_uuid: string;
  assigned_by: string | null;
  title: string;
  description: string | null;
  status: KpiTaskStatus;
  due_at: string | null;
  completed_at: string | null;
}

interface UserLite {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  kpi_role: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  done_on_time: "Done on time",
  rectified: "Rectified",
  delayed: "Delayed",
};

const ROLE_LABEL: Record<string, string> = {
  csc_consultant: "CSC consultant",
  cst_assistant: "CST assistant",
  developer: "Developer",
  reviewer: "Reviewer",
};

function fullName(u?: UserLite | null): string {
  if (!u) return "Unknown";
  const n = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return n || u.email || u.user_uuid;
}

function initials(u?: UserLite | null): string {
  if (!u) return "?";
  const a = (u.first_name?.[0] ?? "").toUpperCase();
  const b = (u.last_name?.[0] ?? "").toUpperCase();
  return (a + b) || (u.email?.[0] ?? "?").toUpperCase();
}

function dueTone(due: string | null): string {
  if (!due) return "text-muted-foreground";
  const ms = parseISO(due).getTime() - Date.now();
  if (ms < 0) return "text-rose-600 font-medium";
  if (ms <= 2 * 24 * 60 * 60 * 1000) return "text-amber-600";
  return "text-foreground";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd/MM/yyyy");
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: KpiTaskStatus }) {
  const label = STATUS_LABEL[status] ?? status;
  const cls =
    status === "done_on_time"
      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
      : status === "rectified"
      ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
      : status === "delayed"
      ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
      : "bg-slate-100 text-slate-700 hover:bg-slate-100";
  return <Badge className={cls}>{label}</Badge>;
}

function sortPending(a: KpiTaskRow, b: KpiTaskRow) {
  const at = a.due_at ? parseISO(a.due_at).getTime() : Number.POSITIVE_INFINITY;
  const bt = b.due_at ? parseISO(b.due_at).getTime() : Number.POSITIVE_INFINITY;
  return at - bt;
}

export function KpiTasksSection({ viewerRole = null }: { viewerRole?: string | null } = {}) {
  const isCst = viewerRole === "cst_assistant";
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [toMe, setToMe] = useState<KpiTaskRow[]>([]);
  const [byMe, setByMe] = useState<KpiTaskRow[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserLite>>({});
  const [loading, setLoading] = useState(true);
  const [assignable, setAssignable] = useState<UserLite[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showCompletedToMe, setShowCompletedToMe] = useState(false);
  const [showCompletedByMe, setShowCompletedByMe] = useState(false);

  // form state
  const [title, setTitle] = useState("");
  const [assigneeUuid, setAssigneeUuid] = useState<string>("");
  const [dueAt, setDueAt] = useState<Date | undefined>();
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        supabase
          .from("kpi_tasks")
          .select("id,assignee_uuid,assigned_by,title,description,status,due_at,completed_at")
          .eq("assignee_uuid", userId)
          .order("due_at", { ascending: true, nullsFirst: false }),
        supabase
          .from("kpi_tasks")
          .select("id,assignee_uuid,assigned_by,title,description,status,due_at,completed_at")
          .eq("assigned_by", userId)
          .order("due_at", { ascending: true, nullsFirst: false }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      const aRows = (a.data ?? []) as KpiTaskRow[];
      const bRows = (b.data ?? []) as KpiTaskRow[];
      setToMe(aRows);
      setByMe(bRows);

      const ids = new Set<string>();
      for (const r of aRows) if (r.assigned_by) ids.add(r.assigned_by);
      for (const r of bRows) ids.add(r.assignee_uuid);
      if (ids.size > 0) {
        const { data: users, error: uErr } = await supabase
          .from("users")
          .select("user_uuid, first_name, last_name, email, kpi_role")
          .in("user_uuid", Array.from(ids));
        if (uErr) throw uErr;
        const map: Record<string, UserLite> = {};
        for (const u of (users ?? []) as UserLite[]) map[u.user_uuid] = u;
        setUserMap(map);
      } else {
        setUserMap({});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load tasks";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, email, kpi_role")
        .not("kpi_role", "is", null)
        .neq("kpi_role", "developer")
        .or("kpi_pod.is.null,kpi_pod.neq.qa")
        .order("first_name", { ascending: true });
      if (error) {
        console.error("[KpiTasksSection] load assignables", error);
        return;
      }
      setAssignable((data ?? []) as UserLite[]);
    })();
  }, []);

  const markStatus = async (id: number, newStatus: KpiTaskStatus) => {
    if (!userId) return;
    // optimistic
    setToMe((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: newStatus, completed_at: new Date().toISOString() } : t
      )
    );
    const { error } = await supabase
      .from("kpi_tasks")
      .update({ status: newStatus, completed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("assignee_uuid", userId);
    if (error) {
      toast.error(error.message);
      await refresh();
    } else {
      toast.success(`Marked ${STATUS_LABEL[newStatus] ?? newStatus}`);
      await refresh();
    }
  };

  const handleSubmit = async () => {
    if (!userId || !title.trim() || !assigneeUuid || !dueAt) return;
    setSubmitting(true);
    const { error } = await supabase.from("kpi_tasks").insert({
      assignee_uuid: assigneeUuid,
      assigned_by: userId,
      title: title.trim(),
      description: description.trim() || null,
      status: "pending",
      due_at: dueAt.toISOString(),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Task assigned");
    setTitle("");
    setAssigneeUuid("");
    setDueAt(undefined);
    setDescription("");
    setSheetOpen(false);
    await refresh();
  };

  const toMeGroups = useMemo(() => {
    const now = Date.now();
    const pending = toMe.filter((t) => t.status === "pending");
    const completed = toMe.filter((t) => t.status !== "pending");
    const overdue = pending
      .filter((t) => t.due_at && parseISO(t.due_at).getTime() < now)
      .sort(sortPending);
    const upcoming = pending
      .filter((t) => !t.due_at || parseISO(t.due_at).getTime() >= now)
      .sort(sortPending);
    return { overdue, upcoming, completed };
  }, [toMe]);

  const byMeGroups = useMemo(() => {
    const now = Date.now();
    const pending = byMe.filter((t) => t.status === "pending");
    const completed = byMe.filter((t) => t.status !== "pending");
    const overdue = pending
      .filter((t) => t.due_at && parseISO(t.due_at).getTime() < now)
      .sort(sortPending);
    const upcoming = pending
      .filter((t) => !t.due_at || parseISO(t.due_at).getTime() >= now)
      .sort(sortPending);
    return { overdue, upcoming, completed };
  }, [byMe]);

  const formValid = !!title.trim() && !!assigneeUuid && !!dueAt;

  return (
    <div className="space-y-6">
      {/* PART 1 — Tasks assigned to me */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Tasks assigned to me</CardTitle>
              <CardDescription>
                Mark each task once complete. Status is locked after marking.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Assign a task
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : toMe.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks assigned to you.</p>
          ) : (
            <div className="space-y-2">
              {[...toMeGroups.overdue, ...toMeGroups.upcoming].map((t) => (
                <div
                  key={t.id}
                  className="flex items-start justify-between gap-4 rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground">
                      Assigned by {fullName(userMap[t.assigned_by ?? ""])}
                    </div>
                  </div>
                  <div className={cn("text-sm whitespace-nowrap", dueTone(t.due_at))}>
                    {fmtDate(t.due_at)}
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {isCst ? (
                      <>
                        <Button size="sm" onClick={() => markStatus(t.id, "done_on_time")}>
                          Done on time
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => markStatus(t.id, "rectified")}>
                          Rectified
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-rose-600 border-rose-200 hover:bg-rose-50"
                          onClick={() => markStatus(t.id, "delayed")}
                        >
                          Delayed
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" onClick={() => markStatus(t.id, "done_on_time")}>
                        Mark complete
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {toMeGroups.completed.length > 0 && (
                <Collapsible open={showCompletedToMe} onOpenChange={setShowCompletedToMe}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="mt-2">
                      {showCompletedToMe ? (
                        <ChevronDown className="h-4 w-4 mr-1" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mr-1" />
                      )}
                      Completed ({toMeGroups.completed.length})
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2">
                    {toMeGroups.completed.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{t.title}</div>
                          <div className="text-xs text-muted-foreground">
                            Assigned by {fullName(userMap[t.assigned_by ?? ""])} ·
                            {" "}completed {fmtDate(t.completed_at)}
                          </div>
                        </div>
                        <StatusBadge status={t.status} />
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* PART 2 — Tasks I've assigned */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tasks I've assigned</CardTitle>
          <CardDescription>Read-only view. Assignees mark their own status.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : byMe.length === 0 ? (
            <p className="text-sm text-muted-foreground">You haven't assigned any tasks yet.</p>
          ) : (
            <div className="space-y-2">
              {[...byMeGroups.overdue, ...byMeGroups.upcoming].map((t) => {
                const u = userMap[t.assignee_uuid];
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-4 rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{initials(u)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{t.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {fullName(u)}
                        </div>
                      </div>
                    </div>
                    <div className={cn("text-sm whitespace-nowrap", dueTone(t.due_at))}>
                      {fmtDate(t.due_at)}
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                );
              })}

              {byMeGroups.completed.length > 0 && (
                <Collapsible open={showCompletedByMe} onOpenChange={setShowCompletedByMe}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="mt-2">
                      {showCompletedByMe ? (
                        <ChevronDown className="h-4 w-4 mr-1" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mr-1" />
                      )}
                      Completed ({byMeGroups.completed.length})
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2">
                    {byMeGroups.completed.map((t) => {
                      const u = userMap[t.assignee_uuid];
                      return (
                        <div
                          key={t.id}
                          className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 p-3"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">{initials(u)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{t.title}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {fullName(u)} · completed {fmtDate(t.completed_at)}
                              </div>
                            </div>
                          </div>
                          <StatusBadge status={t.status} />
                        </div>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* PART 3 — Assign-a-task sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setTitle("");
            setAssigneeUuid("");
            setDueAt(undefined);
            setDescription("");
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Assign a task</SheetTitle>
            <SheetDescription>Create a new task for any KPI team member.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-1">
              <Label htmlFor="kpi-task-title">Task name</Label>
              <Input
                id="kpi-task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs doing?"
              />
            </div>

            <div className="space-y-1">
              <Label>Assign to</Label>
              <Select value={assigneeUuid} onValueChange={setAssigneeUuid}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a team member" />
                </SelectTrigger>
                <SelectContent>
                  {assignable.map((u) => (
                    <SelectItem key={u.user_uuid} value={u.user_uuid}>
                      <span className="flex items-center gap-2">
                        <span>{fullName(u)}</span>
                        {u.kpi_role && (
                          <Badge variant="outline" className="text-xs">
                            {ROLE_LABEL[u.kpi_role] ?? u.kpi_role}
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Deadline</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dueAt && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueAt ? format(dueAt, "dd/MM/yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueAt}
                    onSelect={setDueAt}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <Label htmlFor="kpi-task-desc">Description (optional)</Label>
              <Textarea
                id="kpi-task-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            <Button onClick={handleSubmit} disabled={!formValid || submitting} className="w-full">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Assigning…
                </>
              ) : (
                "Assign task"
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

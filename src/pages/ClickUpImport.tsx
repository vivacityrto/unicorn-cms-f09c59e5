import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CloudDownload, Loader2, MessageSquare, Download, CheckCircle2, ExternalLink, RefreshCw, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TenantCombobox } from "@/components/clickup/TenantCombobox";
import { useNavigate } from "react-router-dom";

interface TableCount {
  clickup_tasks_api: number;
  clickup_task_comments: number;
  clickup_time_entries: number;
}

interface ClickUpTask {
  id: number;
  task_id: string;
  custom_id: string | null;
  name: string | null;
  description: string | null;
  status: string | null;
  url: string | null;
  tenant_id: number | null;
}

export default function ClickUpImport() {
  const [apiSyncing, setApiSyncing] = useState(false);
  const [apiSyncResult, setApiSyncResult] = useState<{
    tasks_fetched: number;
    tasks_upserted: number;
    tenants_resolved: number;
    errors: string[];
  } | null>(null);
  const [fetchingComments, setFetchingComments] = useState(false);
  const [commentTenantId, setCommentTenantId] = useState("");
  const [commentResult, setCommentResult] = useState<{ fetched: number; stored: number; task_count?: number; errors: string[] } | null>(null);
  const [commentProgress, setCommentProgress] = useState<{ processed: number; total: number } | null>(null);
  const [counts, setCounts] = useState<TableCount | null>(null);
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tenants, setTenants] = useState<{ id: number; name: string }[]>([]);
  const [filterTenant, setFilterTenant] = useState<string>("unresolved");
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [taskSearch, setTaskSearch] = useState("");
  const [timeSyncing, setTimeSyncing] = useState(false);
  const [timeSyncProgress, setTimeSyncProgress] = useState<{ processed: number; entries: number } | null>(null);
  const [timeSyncResult, setTimeSyncResult] = useState<{ entries_synced: number; tasks_processed: number; errors: string[] } | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Fetch table counts
  const fetchCounts = useCallback(async () => {
    const [r1, r2, r3] = await Promise.all([
      supabase.from("clickup_tasks_api").select("id", { count: "exact", head: true }),
      supabase.from("clickup_task_comments").select("id", { count: "exact", head: true }),
      supabase.from("clickup_time_entries").select("id", { count: "exact", head: true }),
    ]);
    setCounts({
      clickup_tasks_api: r1.count ?? 0,
      clickup_task_comments: r2.count ?? 0,
      clickup_time_entries: r3.count ?? 0,
    });
  }, []);

  // Fetch tenants for dropdown
  useEffect(() => {
    supabase.from("tenants").select("id, name").order("name").then(({ data }) => {
      if (data) setTenants(data);
    });
    fetchCounts();
  }, [fetchCounts]);

  const SELECT_COLS = "id, task_id, custom_id, name, description, status, url, tenant_id";

  // Fetch tasks based on filter
  const fetchTasks = useCallback(async () => {
    setTasksLoading(true);
    const searchTerm = taskSearch.trim();

    try {
      if (searchTerm) {
        // Search across ALL tasks by name, custom_id, or task_id
        const searches = [
          supabase.from("clickup_tasks_api")
            .select("id, task_id, custom_id, name, description, status, url, tenant_id")
            .ilike("name", `%${searchTerm}%`)
            .order("name", { ascending: true })
            .limit(500),
          supabase.from("clickup_tasks_api")
            .select("id, task_id, custom_id, name, description, status, url, tenant_id")
            .ilike("custom_id", `%${searchTerm}%`)
            .order("name", { ascending: true })
            .limit(200),
          supabase.from("clickup_tasks_api")
            .select("id, task_id, custom_id, name, description, status, url, tenant_id")
            .ilike("task_id", `%${searchTerm}%`)
            .order("name", { ascending: true })
            .limit(200),
        ];
        const [r1, r2, r3] = await Promise.all(searches);
        const map = new Map<number, ClickUpTask>();
        for (const row of [...(r1.data ?? []), ...(r2.data ?? []), ...(r3.data ?? [])]) {
          map.set(row.id, row);
        }
        setTasks(Array.from(map.values()).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")));
      } else {
        // Paginate to get ALL tasks for the current filter
        const allTasks: ClickUpTask[] = [];
        let offset = 0;
        let hasMore = true;
        const batchSize = 500;

        while (hasMore) {
          let q = supabase
            .from("clickup_tasks_api")
            .select(SELECT_COLS)
            .order("name", { ascending: true })
            .range(offset, offset + batchSize - 1);

          if (filterTenant === "unresolved") {
            q = q.is("tenant_id", null);
          } else if (filterTenant && filterTenant !== "all") {
            q = q.eq("tenant_id", parseInt(filterTenant, 10));
          }

          const { data, error } = await q;
          if (error) throw error;
          if (data && data.length > 0) {
            allTasks.push(...(data as unknown as ClickUpTask[]));
            offset += batchSize;
            hasMore = data.length === batchSize;
          } else {
            hasMore = false;
          }
        }
        setTasks(allTasks);
      }
    } catch (err) {
      toast({ title: "Failed to load tasks", description: (err as Error).message, variant: "destructive" });
    }
    setTasksLoading(false);
  }, [filterTenant, taskSearch, toast]);

  // Debounce search to avoid excessive queries
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTasks();
    }, taskSearch.trim() ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchTasks]);

  const handleApiSync = async () => {
    setApiSyncing(true);
    setApiSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("sync-clickup-tasks", {
        body: { mode: "sync_all" },
      });
      if (error) throw error;
      setApiSyncResult(data);
      fetchCounts();
      fetchTasks();
      toast({
        title: "API Sync Complete",
        description: `${data?.tasks_upserted ?? 0} tasks synced, ${data?.tenants_resolved ?? 0} tenants resolved.`,
      });
    } catch (err) {
      toast({ title: "API Sync failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setApiSyncing(false);
    }
  };

  const handleFetchComments = async () => {
    const tid = parseInt(commentTenantId, 10);
    if (isNaN(tid)) {
      toast({ title: "Invalid tenant ID", description: "Enter a tenant ID, or 0 to fetch all.", variant: "destructive" });
      return;
    }
    setFetchingComments(true);
    setCommentResult(null);
    setCommentProgress(null);

    let offset = 0;
    const batchSize = 50;
    let totalFetched = 0;
    let totalStored = 0;
    let totalTaskCount = 0;
    const allErrors: string[] = [];

    try {
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke("fetch-clickup-comments", {
          body: { action: "fetch_by_tenant", tenant_id: tid, batch_size: batchSize, offset },
        });
        if (error) throw error;

        totalFetched += data?.fetched ?? 0;
        totalStored += data?.stored ?? 0;
        totalTaskCount += data?.task_count ?? 0;
        if (data?.errors?.length) allErrors.push(...data.errors);

        setCommentProgress({ processed: data?.next_offset ?? offset, total: data?.total_tasks ?? 0 });

        hasMore = data?.has_more ?? false;
        offset = data?.next_offset ?? offset + batchSize;

        // Brief pause between batches
        if (hasMore) await new Promise(r => setTimeout(r, 500));
      }

      setCommentResult({ fetched: totalFetched, stored: totalStored, task_count: totalTaskCount, errors: allErrors });
      fetchCounts();
      toast({
        title: tid === 0 ? "All Comments Fetched" : "Comments Fetched",
        description: `${totalStored} comments stored from ${totalTaskCount} tasks.`,
      });
    } catch (err) {
      toast({ title: "Comment fetch failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setFetchingComments(false);
      setCommentProgress(null);
    }
  };

  const handleAssignTenant = async (taskId: number, tenantId: number) => {
    // Find the task to get its task_id for bulk matching
    const task = tasks.find(t => t.id === taskId);
    if (!task?.task_id) {
      // Fallback: just update the single row
      setUpdatingTaskId(taskId);
      const { error } = await supabase
        .from("clickup_tasks_api")
        .update({ tenant_id: tenantId })
        .eq("id", taskId);
      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Tenant assigned" });
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, tenant_id: tenantId } : t));
      }
      setUpdatingTaskId(null);
      return;
    }

    // Count how many task rows and comment rows share this task_id with null tenant_id
    const [taskCountRes, commentCountRes] = await Promise.all([
      supabase
        .from("clickup_tasks_api")
        .select("id", { count: "exact", head: true })
        .eq("task_id", task.task_id)
        .is("tenant_id", null),
      supabase
        .from("clickup_task_comments")
        .select("id", { count: "exact", head: true })
        .eq("task_id", task.task_id)
        .is("tenant_id", null),
    ]);

    if (taskCountRes.error) {
      toast({ title: "Error checking tasks", description: taskCountRes.error.message, variant: "destructive" });
      return;
    }

    const taskMatchCount = taskCountRes.count ?? 0;
    const commentMatchCount = commentCountRes.count ?? 0;

    // Prompt user with counts
    const parts: string[] = [];
    if (taskMatchCount > 0) parts.push(`${taskMatchCount} task(s)`);
    if (commentMatchCount > 0) parts.push(`${commentMatchCount} comment(s)`);

    if (parts.length > 0) {
      const confirmed = window.confirm(
        `This will assign the tenant to ${parts.join(" and ")} for task_id ${task.custom_id || task.task_id} where tenant is currently unset.\n\nContinue?`
      );
      if (!confirmed) return;
    }

    setUpdatingTaskId(taskId);

    // Bulk update tasks and comments in parallel
    const [taskUpdateRes, commentUpdateRes] = await Promise.all([
      supabase
        .from("clickup_tasks_api")
        .update({ tenant_id: tenantId })
        .eq("task_id", task.task_id)
        .is("tenant_id", null),
      supabase
        .from("clickup_task_comments")
        .update({ tenant_id: tenantId })
        .eq("task_id", task.task_id)
        .is("tenant_id", null),
    ]);

    if (taskUpdateRes.error || commentUpdateRes.error) {
      const msg = taskUpdateRes.error?.message || commentUpdateRes.error?.message || "Unknown error";
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    } else {
      const desc = [
        taskMatchCount > 0 ? `${taskMatchCount} task(s)` : null,
        commentMatchCount > 0 ? `${commentMatchCount} comment(s)` : null,
      ].filter(Boolean).join(", ");
      toast({ title: "Tenant assigned", description: desc || undefined });
      // Update local state for all matching tasks
      setTasks(prev => prev.map(t =>
        t.task_id === task.task_id && t.tenant_id === null
          ? { ...t, tenant_id: tenantId }
          : t
      ));
    }
    setUpdatingTaskId(null);
  };

  const handleTimeSync = async () => {
    setTimeSyncing(true);
    setTimeSyncResult(null);
    setTimeSyncProgress(null);

    let offset = 0;
    let totalEntries = 0;
    let totalTasks = 0;
    const allErrors: string[] = [];

    try {
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke("sync-clickup-time", {
          body: { mode: "sync_all", offset },
        });
        if (error) throw error;

        totalEntries += data?.entries_synced ?? 0;
        totalTasks += data?.tasks_processed ?? 0;
        if (data?.errors?.length) allErrors.push(...data.errors);

        setTimeSyncProgress({ processed: totalTasks, entries: totalEntries });

        hasMore = data?.has_more ?? false;
        offset = data?.next_offset ?? offset + 50;

        if (hasMore) await new Promise(r => setTimeout(r, 500));
      }

      setTimeSyncResult({ entries_synced: totalEntries, tasks_processed: totalTasks, errors: allErrors });
      fetchCounts();
      toast({
        title: "Time Sync Complete",
        description: `${totalEntries} time entries synced from ${totalTasks} tasks.`,
      });
    } catch (err) {
      toast({ title: "Time sync failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setTimeSyncing(false);
      setTimeSyncProgress(null);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/tasks")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">ClickUp Sync</h1>
            <p className="text-sm text-muted-foreground">
              Sync tasks and comments from ClickUp API
            </p>
          </div>
        </div>

        {/* Table Counts */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Tasks (API)", key: "clickup_tasks_api" as const },
            { label: "Comments", key: "clickup_task_comments" as const },
            { label: "Time Entries", key: "clickup_time_entries" as const },
          ].map(({ label, key }) => (
            <Card key={key} className="border-primary/30">
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold text-foreground">
                  {counts ? counts[key].toLocaleString() : "…"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* API Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CloudDownload className="h-5 w-5" /> Sync from ClickUp API
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pull all tasks from the <strong>Membership</strong> list. Tasks upserted into <code className="text-xs bg-muted px-1 rounded">clickup_tasks_api</code>, tenant IDs resolved from <code className="text-xs bg-muted px-1 rounded">unicorn_url</code>.
            </p>
            <Button onClick={handleApiSync} disabled={apiSyncing}>
              {apiSyncing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Syncing…</>
              ) : (
                <><CloudDownload className="h-4 w-4 mr-2" />Full Sync</>
              )}
            </Button>
            {apiSyncResult && (
              <div className="rounded-md border p-3 space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>{apiSyncResult.tasks_fetched} fetched, {apiSyncResult.tasks_upserted} upserted, {apiSyncResult.tenants_resolved} tenants resolved</span>
                </div>
                {apiSyncResult.errors.length > 0 && (
                  <div className="text-xs text-destructive mt-1">
                    <p className="font-medium">{apiSyncResult.errors.length} errors:</p>
                    <ul className="list-disc pl-4 max-h-24 overflow-y-auto">
                      {apiSyncResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fetch Comments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5" /> Fetch ClickUp Comments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Fetch threaded comments for tasks. Enter a tenant ID, or <strong>0</strong> to fetch comments for <strong>all</strong> tasks. Upserts on <code className="text-xs bg-muted px-1 rounded">comment_id</code> — safe to re-run.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-xs">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tenant ID (0 = all)</label>
                <Input
                  type="number"
                  placeholder="0 for all, or e.g. 7530"
                  value={commentTenantId}
                  onChange={(e) => setCommentTenantId(e.target.value)}
                />
              </div>
               <Button onClick={handleFetchComments} disabled={fetchingComments || !commentTenantId} variant="outline">
                <Download className={`h-4 w-4 mr-2 ${fetchingComments ? "animate-spin" : ""}`} />
                {fetchingComments ? "Fetching…" : commentTenantId === "0" ? "Fetch All Comments" : "Fetch Comments"}
              </Button>
            </div>
            {commentProgress && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Processing tasks: {commentProgress.processed} / {commentProgress.total}</span>
                  <span>{commentProgress.total > 0 ? Math.round((commentProgress.processed / commentProgress.total) * 100) : 0}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${commentProgress.total > 0 ? (commentProgress.processed / commentProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
            {commentResult && (
              <div className="rounded-md border p-3 space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>{commentResult.stored} comments stored from {commentResult.task_count ?? '?'} tasks ({commentResult.fetched} fetched)</span>
                </div>
                {commentResult.errors.length > 0 && (
                  <div className="text-xs text-destructive mt-1">
                    <ul className="list-disc pl-4 max-h-24 overflow-y-auto">
                      {commentResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sync Time Entries */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" /> Sync ClickUp Time Entries
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Fetch detailed time tracking entries from ClickUp for all synced tasks. Upserts on <code className="text-xs bg-muted px-1 rounded">clickup_interval_id</code> — safe to re-run.
            </p>
            <Button onClick={handleTimeSync} disabled={timeSyncing}>
              {timeSyncing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Syncing Time…</>
              ) : (
                <><Clock className="h-4 w-4 mr-2" />Sync All Time Entries</>
              )}
            </Button>
            {timeSyncProgress && (
              <div className="text-sm text-muted-foreground">
                Tasks processed: <strong>{timeSyncProgress.processed}</strong> · Time entries found: <strong>{timeSyncProgress.entries}</strong>
              </div>
            )}
            {timeSyncResult && (
              <div className="rounded-md border p-3 space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>{timeSyncResult.entries_synced} time entries synced from {timeSyncResult.tasks_processed} tasks</span>
                </div>
                {timeSyncResult.errors.length > 0 && (
                  <div className="text-xs text-destructive mt-1">
                    <p className="font-medium">{timeSyncResult.errors.length} errors:</p>
                    <ul className="list-disc pl-4 max-h-24 overflow-y-auto">
                      {timeSyncResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Task List with Tenant Assignment */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Tasks — Manual Tenant Assignment</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search by name or ID..."
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  className="w-[220px] h-9"
                />
                <Select value={filterTenant} onValueChange={setFilterTenant}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter tasks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unresolved">Unresolved only</SelectItem>
                    <SelectItem value="all">All tasks</SelectItem>
                    {tenants.slice(0, 50).map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={fetchTasks} disabled={tasksLoading}>
                  <RefreshCw className={`h-4 w-4 ${tasksLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No tasks found for this filter.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-2">
                  {tasks.length} tasks{taskSearch.trim() ? " — searching all tasks" : ""}
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Custom ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden md:table-cell">Status</TableHead>
                      <TableHead>ClickUp</TableHead>
                      <TableHead>Tenant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map(task => (
                      <TableRow key={task.id}>
                        <TableCell className="font-mono text-xs">{task.custom_id || "—"}</TableCell>
                        <TableCell className="max-w-[250px]">
                          <div className="truncate text-sm font-medium">{task.name || "—"}</div>
                          {task.description && (
                            <div className="truncate text-xs text-muted-foreground">{task.description.slice(0, 80)}</div>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {task.status ? (
                            <Badge variant="outline" className="text-xs">{task.status}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {task.url ? (
                            <a href={task.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                              <ExternalLink className="h-3 w-3" /> Open
                            </a>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="min-w-[180px]">
                          <div className="flex items-center gap-1">
                            <TenantCombobox
                              tenants={tenants}
                              value={task.tenant_id}
                              onSelect={(tid) => handleAssignTenant(task.id, tid)}
                              disabled={updatingTaskId === task.id}
                            />
                            {task.tenant_id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => navigate(`/tenant/${task.tenant_id}`)}
                                title="Open tenant record"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

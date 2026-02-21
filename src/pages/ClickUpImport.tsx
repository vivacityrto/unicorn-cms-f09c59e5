import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CloudDownload, Loader2, MessageSquare, Download, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";

interface TableCount {
  clickup_tasks_api: number;
  clickup_task_comments: number;
  clickup_tasks: number;
  clickup_tasksdb: number;
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
  const [counts, setCounts] = useState<TableCount | null>(null);
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tenants, setTenants] = useState<{ id: number; name: string }[]>([]);
  const [filterTenant, setFilterTenant] = useState<string>("unresolved");
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Fetch table counts
  const fetchCounts = useCallback(async () => {
    const [r1, r2, r3, r4] = await Promise.all([
      supabase.from("clickup_tasks_api").select("id", { count: "exact", head: true }),
      supabase.from("clickup_task_comments").select("id", { count: "exact", head: true }),
      supabase.from("clickup_tasks").select("id", { count: "exact", head: true }),
      supabase.from("clickup_tasksdb").select("id", { count: "exact", head: true }),
    ]);
    setCounts({
      clickup_tasks_api: r1.count ?? 0,
      clickup_task_comments: r2.count ?? 0,
      clickup_tasks: r3.count ?? 0,
      clickup_tasksdb: r4.count ?? 0,
    });
  }, []);

  // Fetch tenants for dropdown
  useEffect(() => {
    supabase.from("tenants").select("id, name").order("name").then(({ data }) => {
      if (data) setTenants(data);
    });
    fetchCounts();
  }, [fetchCounts]);

  // Fetch tasks based on filter
  const fetchTasks = useCallback(async () => {
    setTasksLoading(true);
    let query = supabase
      .from("clickup_tasks_api")
      .select("id, task_id, custom_id, name, description, status, url, tenant_id")
      .order("name", { ascending: true })
      .limit(200);

    if (filterTenant === "unresolved") {
      query = query.is("tenant_id", null);
    } else if (filterTenant && filterTenant !== "all") {
      query = query.eq("tenant_id", parseInt(filterTenant, 10));
    }

    const { data } = await query;
    setTasks(data ?? []);
    setTasksLoading(false);
  }, [filterTenant]);

  useEffect(() => {
    fetchTasks();
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
      toast({ title: "Invalid tenant ID", description: "Please enter a numeric tenant ID.", variant: "destructive" });
      return;
    }
    setFetchingComments(true);
    setCommentResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-clickup-comments", {
        body: { action: "fetch_by_tenant", tenant_id: tid },
      });
      if (error) throw error;
      setCommentResult(data);
      fetchCounts();
      toast({
        title: "Comments Fetched",
        description: `${data?.stored ?? 0} comments stored from ${data?.task_count ?? 0} tasks.`,
      });
    } catch (err) {
      toast({ title: "Comment fetch failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setFetchingComments(false);
    }
  };

  const handleAssignTenant = async (taskId: number, tenantId: number) => {
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Tasks (API)", key: "clickup_tasks_api" as const, primary: true },
            { label: "Comments", key: "clickup_task_comments" as const },
            { label: "Tasks (Legacy)", key: "clickup_tasks" as const },
            { label: "TasksDB (Legacy)", key: "clickup_tasksdb" as const },
          ].map(({ label, key, primary }) => (
            <Card key={key} className={primary ? "border-primary/30" : "opacity-70"}>
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
              Fetch threaded comments for all tasks belonging to a tenant. Linked via <code className="text-xs bg-muted px-1 rounded">task_id</code>.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-xs">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tenant ID</label>
                <Input
                  type="number"
                  placeholder="e.g. 7530"
                  value={commentTenantId}
                  onChange={(e) => setCommentTenantId(e.target.value)}
                />
              </div>
              <Button onClick={handleFetchComments} disabled={fetchingComments || !commentTenantId} variant="outline">
                <Download className={`h-4 w-4 mr-2 ${fetchingComments ? "animate-spin" : ""}`} />
                {fetchingComments ? "Fetching…" : "Fetch Comments"}
              </Button>
            </div>
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

        {/* Task List with Tenant Assignment */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Tasks — Manual Tenant Assignment</CardTitle>
              <div className="flex items-center gap-2">
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
                <p className="text-xs text-muted-foreground mb-2">{tasks.length} tasks shown (max 200)</p>
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
                          <Select
                            value={task.tenant_id ? String(task.tenant_id) : ""}
                            onValueChange={(val) => handleAssignTenant(task.id, parseInt(val, 10))}
                            disabled={updatingTaskId === task.id}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Assign tenant…" />
                            </SelectTrigger>
                            <SelectContent>
                              {tenants.map(t => (
                                <SelectItem key={t.id} value={String(t.id)} className="text-xs">
                                  {t.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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

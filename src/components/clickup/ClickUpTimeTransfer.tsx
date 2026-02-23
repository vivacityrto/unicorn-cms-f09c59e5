import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

import { Loader2, ArrowRight, CheckCircle2, Clock, ArrowLeft, Package, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

interface TaskWithTime {
  task_id: string;
  custom_id: string | null;
  name: string | null;
  packageinstance_id: number | null;
  entry_count: number;
  transferred_count: number;
}

interface TimeInterval {
  id: number;
  clickup_interval_id: string;
  task_id: string;
  user_name: string | null;
  user_email: string | null;
  duration_ms: number;
  duration_minutes: number | null;
  start_at: string | null;
  end_at: string | null;
  description: string | null;
  billable: boolean;
  imported_to_time_entries: boolean;
}

// Email → user_uuid mapping (pre-fetched)
type UserMap = Map<string, string>;

export function ClickUpTimeTransfer() {
  const [tenants, setTenants] = useState<{ id: number; name: string }[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<TaskWithTime[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [intervals, setIntervals] = useState<TimeInterval[]>([]);
  const [intervalsLoading, setIntervalsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [transferring, setTransferring] = useState(false);
  const [userMap, setUserMap] = useState<UserMap>(new Map());
  const [packageInstances, setPackageInstances] = useState<{ id: number; package_id: number; package_name: string; start_date: string | null; end_date: string | null; is_active: boolean; logged_minutes: number }[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const { toast } = useToast();

  const [tenantsLoading, setTenantsLoading] = useState(true);

  // Fetch tenants that have transferable time data + user map
  useEffect(() => {
    setTenantsLoading(true);
    Promise.all([
      (supabase as any)
        .from("clickup_time_entries")
        .select("tenant_id")
        .eq("imported_to_time_entries", false),
      supabase.from("tenants").select("id, name").order("name"),
      supabase.from("users").select("user_uuid, email"),
    ]).then(([timeRes, tenantRes, userRes]: any[]) => {
      // Build set of tenant IDs with transferable data
      const tenantIdsWithData = new Set<number>();
      for (const row of (timeRes.data ?? [])) {
        if (row.tenant_id) tenantIdsWithData.add(row.tenant_id);
      }
      if (tenantRes.data) {
        setTenants(
          tenantRes.data
            .filter((t: any) => tenantIdsWithData.has(t.id))
            .map((t: any) => ({ ...t, name: t.name?.trim() ?? "" }))
        );
      }
      if (userRes.data) {
        const map = new Map<string, string>();
        for (const u of userRes.data) {
          if (u.email && u.user_uuid) map.set(u.email.toLowerCase(), u.user_uuid);
        }
        setUserMap(map);
      }
      setTenantsLoading(false);
    });
  }, []);

  // Fetch package instances for selected tenant
  useEffect(() => {
    if (!selectedTenantId) { setPackageInstances([]); return; }
    setPackagesLoading(true);
    (async () => {
      try {
        const { data: instances } = await (supabase as any)
          .from("package_instances")
          .select("id, package_id, start_date, end_date, is_active")
          .eq("tenant_id", selectedTenantId)
          .order("start_date", { ascending: false });

        if (!instances || instances.length === 0) {
          setPackageInstances([]);
          setPackagesLoading(false);
          return;
        }

        // Fetch package names and existing time totals in parallel
        const instanceIds = instances.map((i: any) => i.id);
        const packageIds = [...new Set(instances.map((i: any) => i.package_id).filter(Boolean))];
        
        const [pkgRes, timeRes] = await Promise.all([
          (supabase as any).from("packages").select("id, name").in("id", packageIds),
          (supabase as any).from("time_entries").select("package_instance_id, duration_minutes").eq("tenant_id", selectedTenantId).in("package_instance_id", instanceIds),
        ]);

        const pkgMap = new Map<number, string>();
        for (const p of (pkgRes.data ?? [])) pkgMap.set(p.id, p.name);

        // Sum logged minutes per package instance
        const loggedMap = new Map<number, number>();
        for (const te of (timeRes.data ?? [])) {
          loggedMap.set(te.package_instance_id, (loggedMap.get(te.package_instance_id) ?? 0) + (te.duration_minutes ?? 0));
        }

        setPackageInstances(instances.map((i: any) => ({
          id: i.id,
          package_id: i.package_id,
          package_name: pkgMap.get(i.package_id) ?? `Package #${i.package_id}`,
          start_date: i.start_date,
          end_date: i.end_date,
          is_active: i.is_active ?? false,
          logged_minutes: loggedMap.get(i.id) ?? 0,
        })));
      } catch (err) {
        console.error("Failed to load package instances", err);
        setPackageInstances([]);
      }
      setPackagesLoading(false);
    })();
  }, [selectedTenantId]);

  // Fetch tasks with time entries for selected tenant
  const fetchTasks = useCallback(async () => {
    if (!selectedTenantId) { setTasks([]); return; }
    setTasksLoading(true);
    setSelectedTaskId(null);
    setIntervals([]);
    try {
      // Get tasks for this tenant that have time entries
      const { data: timeEntries, error } = await (supabase as any)
        .from("clickup_time_entries")
        .select("task_id, imported_to_time_entries")
        .eq("tenant_id", selectedTenantId);
      if (error) throw error;

      // Group by task_id
      const taskMap = new Map<string, { total: number; transferred: number }>();
      for (const e of (timeEntries ?? [])) {
        const existing = taskMap.get(e.task_id) ?? { total: 0, transferred: 0 };
        existing.total++;
        if (e.imported_to_time_entries) existing.transferred++;
        taskMap.set(e.task_id, existing);
      }

      if (taskMap.size === 0) {
        setTasks([]);
        setTasksLoading(false);
        return;
      }

      // Fetch task details
      const taskIds = Array.from(taskMap.keys());
      const { data: taskDetails } = await (supabase as any)
        .from("clickup_tasks_api")
        .select("task_id, custom_id, name, packageinstance_id")
        .in("task_id", taskIds);

      const detailMap = new Map<string, any>();
      for (const t of (taskDetails ?? [])) detailMap.set(t.task_id, t);

      const result: TaskWithTime[] = taskIds.map(tid => {
        const detail = detailMap.get(tid);
        const counts = taskMap.get(tid)!;
        return {
          task_id: tid,
          custom_id: detail?.custom_id ?? null,
          name: detail?.name ?? tid,
          packageinstance_id: detail?.packageinstance_id ?? null,
          entry_count: counts.total,
          transferred_count: counts.transferred,
        };
      }).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

      setTasks(result);
    } catch (err) {
      toast({ title: "Failed to load tasks", description: (err as Error).message, variant: "destructive" });
    }
    setTasksLoading(false);
  }, [selectedTenantId, toast]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Fetch intervals for selected task
  const fetchIntervals = useCallback(async () => {
    if (!selectedTaskId || !selectedTenantId) { setIntervals([]); return; }
    setIntervalsLoading(true);
    setSelectedIds(new Set());
    try {
      const { data, error } = await (supabase as any)
        .from("clickup_time_entries")
        .select("id, clickup_interval_id, task_id, user_name, user_email, duration_ms, duration_minutes, start_at, end_at, description, billable, imported_to_time_entries")
        .eq("task_id", selectedTaskId)
        .eq("tenant_id", selectedTenantId)
        .order("start_at", { ascending: true });
      if (error) throw error;
      setIntervals(data ?? []);
    } catch (err) {
      toast({ title: "Failed to load intervals", description: (err as Error).message, variant: "destructive" });
    }
    setIntervalsLoading(false);
  }, [selectedTaskId, selectedTenantId, toast]);

  useEffect(() => { fetchIntervals(); }, [fetchIntervals]);

  // Transferable (not yet imported) intervals
  const transferable = useMemo(() => intervals.filter(i => !i.imported_to_time_entries), [intervals]);

  const toggleId = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === transferable.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transferable.map(i => i.id)));
    }
  };

  // Get the package instance for this task
  const currentTask = tasks.find(t => t.task_id === selectedTaskId);

  const handleTransfer = async () => {
    if (selectedIds.size === 0 || !selectedTenantId || !currentTask) return;

    if (!currentTask.packageinstance_id) {
      toast({ title: "No package instance", description: "Assign a package instance to this task before transferring time.", variant: "destructive" });
      return;
    }

    const toTransfer = intervals.filter(i => selectedIds.has(i.id));

    // Check user mapping
    const unmappedEmails = new Set<string>();
    for (const i of toTransfer) {
      if (i.user_email && !userMap.has(i.user_email.toLowerCase())) {
        unmappedEmails.add(i.user_email);
      }
    }
    if (unmappedEmails.size > 0) {
      toast({
        title: "Unmapped users",
        description: `Cannot transfer: ${Array.from(unmappedEmails).join(", ")} have no user_uuid mapping.`,
        variant: "destructive",
      });
      return;
    }

    setTransferring(true);
    try {
      const rows = toTransfer.map(i => ({
        tenant_id: selectedTenantId,
        client_id: selectedTenantId,
        package_id: currentTask.packageinstance_id,
        package_instance_id: currentTask.packageinstance_id,
        user_id: userMap.get(i.user_email?.toLowerCase() ?? "") ?? null,
        work_type: "general",
        is_billable: i.billable ?? true,
        start_at: i.start_at,
        end_at: i.end_at,
        duration_minutes: i.duration_minutes ?? Math.round((i.duration_ms ?? 0) / 60000),
        notes: i.description ?? null,
        source: "clickup",
        scope_tag: "both",
      }));

      // Filter out any with null user_id
      const validRows = rows.filter(r => r.user_id !== null);
      if (validRows.length === 0) {
        toast({ title: "No valid entries", description: "All entries have unmapped users.", variant: "destructive" });
        setTransferring(false);
        return;
      }

      const { error: insertError } = await (supabase as any)
        .from("time_entries")
        .insert(validRows);

      if (insertError) throw insertError;

      // Mark as imported in clickup_time_entries
      const importedIds = toTransfer.filter(i => userMap.has(i.user_email?.toLowerCase() ?? "")).map(i => i.id);
      await (supabase as any)
        .from("clickup_time_entries")
        .update({ imported_to_time_entries: true })
        .in("id", importedIds);

      toast({
        title: "Transfer complete",
        description: `${validRows.length} time entries transferred to time_entries.`,
      });

      // Refresh
      fetchIntervals();
      fetchTasks();
      setSelectedIds(new Set());
    } catch (err) {
      toast({ title: "Transfer failed", description: (err as Error).message, variant: "destructive" });
    }
    setTransferring(false);
  };

  const formatDuration = (ms: number) => {
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    try { return format(new Date(iso), "dd/MM/yyyy HH:mm"); } catch { return iso; }
  };

  return (
    <div className="space-y-4">
      {/* Tenant Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5" /> Transfer ClickUp Time to Time Entries
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select a tenant, then drill into tasks to review and transfer verified time intervals to the production <code className="text-xs bg-muted px-1 rounded">time_entries</code> table.
          </p>
          {tenantsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : tenants.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No tenants with transferable time data.</p>
          ) : (
            <div className="max-h-[360px] overflow-y-auto border rounded-md divide-y">
              {tenants.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTenantId(t.id)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-muted/50 ${
                    selectedTenantId === t.id ? "bg-accent text-accent-foreground font-medium" : ""
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Package Instances for selected tenant */}
      {selectedTenantId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" /> Package Instances
              </CardTitle>
              <a
                href={`/tenant/${selectedTenantId}`}
                onClick={(e) => { e.preventDefault(); window.open(`/tenant/${selectedTenantId}`, '_blank', 'noopener,noreferrer,width=1200,height=800'); }}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
              >
                View Tenant <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </CardHeader>
          <CardContent>
            {packagesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : packageInstances.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">No package instances for this tenant.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead className="text-center">Time Logged</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packageInstances.map(pi => {
                    const h = Math.floor(pi.logged_minutes / 60);
                    const m = pi.logged_minutes % 60;
                    const timeStr = pi.logged_minutes > 0 ? (h > 0 ? `${h}h ${m}m` : `${m}m`) : "—";
                    return (
                      <TableRow key={pi.id}>
                        <TableCell className="font-mono text-xs">{pi.id}</TableCell>
                        <TableCell className="text-sm font-medium">{pi.package_name}</TableCell>
                        <TableCell className="text-xs">{pi.start_date ?? "—"}</TableCell>
                        <TableCell className="text-xs">{pi.end_date ?? "—"}</TableCell>
                        <TableCell className="text-center text-xs font-medium">{timeStr}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={pi.is_active ? "default" : "outline"} className="text-xs">
                            {pi.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Task List for Tenant */}
      {selectedTenantId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Tasks with Time Entries
                {tasks.length > 0 && <Badge variant="outline" className="ml-2">{tasks.length}</Badge>}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No time entries found for this tenant.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Custom ID</TableHead>
                    <TableHead>Task Name</TableHead>
                    <TableHead className="text-center">Entries</TableHead>
                    <TableHead className="text-center">Transferred</TableHead>
                    <TableHead className="text-center">Package</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map(task => (
                    <TableRow
                      key={task.task_id}
                      className={`cursor-pointer ${selectedTaskId === task.task_id ? "bg-accent/40" : "hover:bg-muted/50"}`}
                      onClick={() => setSelectedTaskId(task.task_id)}
                    >
                      <TableCell className="font-mono text-xs">
                        {task.custom_id ? (
                          <a
                            href={`https://app.clickup.com/t/6919241/${task.custom_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                            onClick={e => e.stopPropagation()}
                          >
                            {task.custom_id}
                          </a>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="max-w-[250px]">
                        <div className="truncate text-sm font-medium">{task.name || "—"}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{task.entry_count}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {task.transferred_count > 0 ? (
                          <Badge className="bg-green-100 text-green-800 border-green-300">
                            {task.transferred_count}/{task.entry_count}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Select
                          value={task.packageinstance_id?.toString() ?? "none"}
                          onValueChange={async (val) => {
                            const newId = val === "none" ? null : Number(val);
                            const { error } = await (supabase as any)
                              .from("clickup_tasks_api")
                              .update({ packageinstance_id: newId })
                              .eq("task_id", task.task_id);
                            if (error) {
                              toast({ title: "Failed to update package", description: error.message, variant: "destructive" });
                              return;
                            }
                            setTasks(prev => prev.map(t => t.task_id === task.task_id ? { ...t, packageinstance_id: newId } : t));
                            toast({ title: "Package updated" });
                          }}
                        >
                          <SelectTrigger
                            className="h-7 w-auto min-w-[140px] text-xs"
                            onClick={e => e.stopPropagation()}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {packageInstances.map(pi => {
                              const startStr = pi.start_date ? format(new Date(pi.start_date + "T00:00:00"), "dd/MM/yyyy") : "?";
                              const endStr = pi.end_date ? format(new Date(pi.end_date + "T00:00:00"), "dd/MM/yyyy") : "current";
                              return (
                                <SelectItem key={pi.id} value={pi.id.toString()}>
                                  {pi.package_name} ({startStr} — {endStr})
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Interval Detail for selected task */}
      {selectedTaskId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedTaskId(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-base">
                  Time Intervals — {currentTask?.name ?? selectedTaskId}
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {transferable.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size} of {transferable.length} selected
                  </span>
                )}
                <Button
                  onClick={handleTransfer}
                  disabled={transferring || selectedIds.size === 0}
                  size="sm"
                >
                  {transferring ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Transferring…</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 mr-1" />Transfer Selected ({selectedIds.size})</>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {intervalsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : intervals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No intervals found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      {transferable.length > 0 && (
                        <Checkbox
                          checked={selectedIds.size === transferable.length && transferable.length > 0}
                          onCheckedChange={toggleAll}
                        />
                      )}
                    </TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Billable</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {intervals.map(interval => {
                    const isTransferred = interval.imported_to_time_entries;
                    const userMapped = interval.user_email ? userMap.has(interval.user_email.toLowerCase()) : false;
                    return (
                      <TableRow key={interval.id} className={isTransferred ? "opacity-50" : ""}>
                        <TableCell>
                          {!isTransferred && (
                            <Checkbox
                              checked={selectedIds.has(interval.id)}
                              onCheckedChange={() => toggleId(interval.id)}
                              disabled={!userMapped}
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{interval.user_name ?? "—"}</div>
                          {interval.user_email && !userMapped && (
                            <div className="text-destructive text-[10px]">⚠ unmapped</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatDate(interval.start_at)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatDate(interval.end_at)}</TableCell>
                        <TableCell className="text-xs font-medium">{formatDuration(interval.duration_ms)}</TableCell>
                        <TableCell className="text-xs max-w-[200px]">
                          <div className="truncate">{interval.description || "—"}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          {interval.billable ? (
                            <Badge variant="outline" className="text-[10px]">Yes</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {isTransferred ? (
                            <Badge className="bg-green-100 text-green-800 border-green-300 text-[10px]">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Done
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Pending</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Package, Wand2, Save } from "lucide-react";
import { format } from "date-fns";

interface UnmatchedTask {
  id: number;
  task_id: string;
  custom_id: string | null;
  name: string | null;
  tenant_id: number;
  tenant_name: string;
  date_created: string | null;
  earliest_entry: string | null;
  latest_entry: string | null;
  packageinstance_id: number | null;
}

interface PkgInstance {
  id: number;
  package_name: string;
  start_date: string | null;
  end_date: string | null;
  is_rto: boolean;
}

export function PackageInstanceAssignment() {
  const [tasks, setTasks] = useState<UnmatchedTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoMatching, setAutoMatching] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<number | null>(null);
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [pkgCache, setPkgCache] = useState<Record<number, PkgInstance[]>>({});
  const [stats, setStats] = useState({ assigned: 0, withTenant: 0, noEntries: 0 });
  const { toast } = useToast();

  const fmtDate = (d: string | null) => {
    if (!d) return "current";
    try { return format(new Date(d), "dd/MM/yyyy"); } catch { return d; }
  };

  const fetchStats = useCallback(async () => {
    const [r1, r2, r3] = await Promise.all([
      supabase.from("clickup_tasks_api").select("id", { count: "exact", head: true })
        .not("tenant_id", "is", null).not("packageinstance_id", "is", null),
      supabase.from("clickup_tasks_api").select("id", { count: "exact", head: true })
        .not("tenant_id", "is", null),
      // Tasks with tenant but no time entries
      supabase.rpc("rpc_match_clickup_to_rto_membership").then(() => null), // just for count below
    ]);
    setStats({
      assigned: r1.count ?? 0,
      withTenant: r2.count ?? 0,
      noEntries: 0, // will be set from auto-match results
    });
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      // Get unmatched tasks (has tenant_id, no packageinstance_id)
      const { data: rawTasks, error } = await (supabase as any)
        .from("clickup_tasks_api")
        .select("id, task_id, custom_id, name, tenant_id, packageinstance_id, date_created, tenants!clickup_tasks_api_tenant_id_fkey(name)")
        .not("tenant_id", "is", null)
        .is("packageinstance_id", null)
        .order("name", { ascending: true })
        .limit(500);

      if (error) throw error;

      // Get time entry date ranges for these tasks
      const taskIds = (rawTasks || []).map((t: any) => t.task_id);
      let entryRanges: Record<string, { earliest: string; latest: string }> = {};

      if (taskIds.length > 0) {
        const { data: entries } = await supabase
          .from("clickup_time_entries")
          .select("task_id, start_at")
          .in("task_id", taskIds);

        if (entries) {
          for (const e of entries) {
            const tid = e.task_id;
            if (!tid) continue;
            if (!entryRanges[tid]) {
              entryRanges[tid] = { earliest: e.start_at!, latest: e.start_at! };
            } else {
              if (e.start_at! < entryRanges[tid].earliest) entryRanges[tid].earliest = e.start_at!;
              if (e.start_at! > entryRanges[tid].latest) entryRanges[tid].latest = e.start_at!;
            }
          }
        }
      }

      const mapped: UnmatchedTask[] = (rawTasks || []).map((t: any) => ({
        id: t.id,
        task_id: t.task_id,
        custom_id: t.custom_id,
        name: t.name,
        tenant_id: t.tenant_id,
        tenant_name: t.tenants?.name?.trim() ?? `Tenant ${t.tenant_id}`,
        date_created: t.date_created ?? null,
        earliest_entry: entryRanges[t.task_id]?.earliest ?? null,
        latest_entry: entryRanges[t.task_id]?.latest ?? null,
        packageinstance_id: t.packageinstance_id,
      }));

      setTasks(mapped);

      // Fetch package instances for unique tenants
      const tenantIds = [...new Set(mapped.map(t => t.tenant_id))];
      const newCache: Record<number, PkgInstance[]> = {};

      for (const tid of tenantIds) {
        if (pkgCache[tid]) {
          newCache[tid] = pkgCache[tid];
          continue;
        }
        const { data: piData } = await supabase
          .from("package_instances")
          .select("id, package_id, start_date, end_date")
          .eq("tenant_id", tid)
          .order("start_date", { ascending: false });

        if (piData && piData.length > 0) {
          // Fetch package names separately (no FK relationship)
          const packageIds = [...new Set(piData.map(pi => pi.package_id).filter(Boolean))];
          const { data: pkgData } = await supabase
            .from("packages")
            .select("id, name")
            .in("id", packageIds);
          const pkgMap: Record<number, string> = {};
          (pkgData || []).forEach((p: any) => { pkgMap[p.id] = p.name; });

          newCache[tid] = piData.map((pi: any) => ({
            id: pi.id,
            package_name: pkgMap[pi.package_id] ?? "Unknown",
            start_date: pi.start_date,
            end_date: pi.end_date,
            is_rto: /^M-.*R/.test(pkgMap[pi.package_id] ?? ""),
          }));
        } else {
          newCache[tid] = [];
        }
      }
      setPkgCache(prev => ({ ...prev, ...newCache }));

      // Update stats
      const [r1, r2] = await Promise.all([
        supabase.from("clickup_tasks_api").select("id", { count: "exact", head: true })
          .not("tenant_id", "is", null).not("packageinstance_id", "is", null),
        supabase.from("clickup_tasks_api").select("id", { count: "exact", head: true })
          .not("tenant_id", "is", null),
      ]);
      setStats(prev => ({
        ...prev,
        assigned: r1.count ?? 0,
        withTenant: r2.count ?? 0,
      }));
    } catch (err) {
      toast({ title: "Failed to load unmatched tasks", description: (err as Error).message, variant: "destructive" });
    }
    setLoading(false);
  }, [toast, pkgCache]);

  useEffect(() => {
    fetchTasks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAutoMatch = async () => {
    setAutoMatching(true);
    try {
      const { data, error } = await supabase.rpc("rpc_match_clickup_to_rto_membership");
      if (error) throw error;
      const result = data as any;
      toast({
        title: "Auto-Match Complete",
        description: `${result.matched} matched, ${result.unmatched} unmatched, ${result.no_entries} without entries.`,
      });
      setStats(prev => ({ ...prev, noEntries: result.no_entries }));
      fetchTasks();
    } catch (err) {
      toast({ title: "Auto-match failed", description: (err as Error).message, variant: "destructive" });
    }
    setAutoMatching(false);
  };

  const handleSave = async (task: UnmatchedTask) => {
    const piId = selections[task.id];
    if (!piId) return;
    setSavingTaskId(task.id);
    try {
      const { error } = await supabase
        .from("clickup_tasks_api")
        .update({ packageinstance_id: parseInt(piId, 10) })
        .eq("id", task.id);
      if (error) throw error;
      toast({ title: "Package instance assigned" });
      setTasks(prev => prev.filter(t => t.id !== task.id));
      setSelections(prev => { const n = { ...prev }; delete n[task.id]; return n; });
      setStats(prev => ({ ...prev, assigned: prev.assigned + 1 }));
    } catch (err) {
      toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" });
    }
    setSavingTaskId(null);
  };

  const getSortedPackages = (tenantId: number): PkgInstance[] => {
    const pkgs = pkgCache[tenantId] || [];
    // RTO memberships first, then others
    return [...pkgs].sort((a, b) => {
      if (a.is_rto && !b.is_rto) return -1;
      if (!a.is_rto && b.is_rto) return 1;
      return 0;
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5" /> Assign Package Instances
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleAutoMatch} disabled={autoMatching}>
              {autoMatching ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Matching…</>
              ) : (
                <><Wand2 className="h-4 w-4 mr-2" />Auto-Match RTO Memberships</>
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={fetchTasks} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="flex gap-4 text-sm">
          <span className="text-muted-foreground">
            Assigned: <strong className="text-foreground">{stats.assigned}</strong> / {stats.withTenant} with tenant
          </span>
          {stats.noEntries > 0 && (
            <span className="text-muted-foreground">
              · No time entries: <strong className="text-foreground">{stats.noEntries}</strong>
            </span>
          )}
          <span className="text-muted-foreground">
            · Unmatched: <strong className="text-foreground">{tasks.length}</strong>
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            All tasks with tenants have been assigned a package instance. ✓
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Custom ID</TableHead>
                <TableHead>Task Name</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Time Range</TableHead>
                <TableHead className="min-w-[280px]">Package Instance</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map(task => {
                const pkgs = getSortedPackages(task.tenant_id);
                return (
                  <TableRow key={task.id}>
                    <TableCell className="font-mono text-xs">
                      {task.custom_id ? (
                        <a
                          href={`https://app.clickup.com/t/6919241/${task.custom_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline hover:text-primary/80"
                        >
                          {task.custom_id}
                        </a>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="truncate text-sm font-medium">{task.name || "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm">{task.tenant_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(task.date_created)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {task.earliest_entry ? (
                        <>
                          {fmtDate(task.earliest_entry)}
                          {task.latest_entry && task.latest_entry !== task.earliest_entry && (
                            <> — {fmtDate(task.latest_entry)}</>
                          )}
                        </>
                      ) : (
                        <span className="italic">No entries</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={selections[task.id] || ""}
                        onValueChange={(val) => setSelections(prev => ({ ...prev, [task.id]: val }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select package..." />
                        </SelectTrigger>
                        <SelectContent>
                          {pkgs.map(pkg => (
                            <SelectItem key={pkg.id} value={String(pkg.id)}>
                              <span className={pkg.is_rto ? "font-medium" : ""}>
                                {pkg.package_name}
                              </span>
                              {" "}
                              <span className="text-muted-foreground">
                                ({fmtDate(pkg.start_date)} — {fmtDate(pkg.end_date)})
                              </span>
                            </SelectItem>
                          ))}
                          {pkgs.length === 0 && (
                            <SelectItem value="none" disabled>No packages found</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={!selections[task.id] || savingTaskId === task.id}
                        onClick={() => handleSave(task)}
                      >
                        {savingTaskId === task.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useUserAccess } from "@/hooks/useUserAccess";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowLeft, Play, Pause, X, Download, Copy } from "lucide-react";
import { format } from "date-fns";

interface WorkerInvokeResult {
  remaining?: number;
  status?: string;
  aborted?: string;
}

interface Job {
  id: string;
  action: string;
  status: string;
  filter_json: unknown;
  cap: number;
  batch_size: number;
  throttle_ms: number;
  total_resolved: number;
  total_planned: number;
  total_sent: number;
  total_skipped: number;
  total_failed: number;
  notes: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface Item {
  id: number;
  user_uuid: string;
  tenant_id: number | null;
  email: string | null;
  state_snapshot: string;
  planned_action: string;
  outcome: string;
  reason: string | null;
  attempts: number;
  processed_at: string | null;
  action_link: string | null;
}

export default function CohortAccessSenderJob() {
  const { jobId } = useParams<{ jobId: string }>();
  const { isVivacityStaff, isLoading: accessLoading } = useUserAccess();

  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [tenantNames, setTenantNames] = useState<Map<number, string>>(new Map());
  const [draining, setDraining] = useState(false);
  const [autoDrain, setAutoDrain] = useState(true);
  const drainAbortRef = useRef(false);

  const refresh = async () => {
    if (!jobId) return;
    const [{ data: j }, { data: it }] = await Promise.all([
      supabase.from("cohort_send_jobs").select("*").eq("id", jobId).maybeSingle(),
      supabase.from("cohort_send_job_items").select("*").eq("job_id", jobId).order("id").limit(1000),
    ]);
    if (j) setJob(j as unknown as Job);
    if (it) {
      setItems(it as unknown as Item[]);
      const uniqueIds = Array.from(
        new Set((it as Item[]).map((i) => i.tenant_id).filter((id): id is number => id != null))
      );
      if (uniqueIds.length > 0) {
        const { data: tenants } = await supabase.from("tenants").select("id, name").in("id", uniqueIds);
        const map = new Map<number, string>();
        for (const t of (tenants ?? []) as Array<{ id: number; name: string }>) {
          if (t?.id != null && t?.name) map.set(t.id, t.name);
        }
        setTenantNames(map);
      } else {
        setTenantNames(new Map());
      }
    }
  };

  useEffect(() => { refresh(); }, [jobId]);

  // Drain loop: invoke worker repeatedly while job is running and tab is open.
  useEffect(() => {
    if (!job || !autoDrain) return;
    if (job.status !== "running") return;
    if (draining) return;

    drainAbortRef.current = false;
    let cancelled = false;
    (async () => {
      setDraining(true);
      try {
        while (!cancelled && !drainAbortRef.current) {
          const { data, error } = await supabase.functions.invoke("cohort-access-sender-worker", {
            body: { job_id: job.id },
          });
          if (error) {
            toast({ title: "Worker error", description: error.message, variant: "destructive" });
            break;
          }
          await refresh();
          const result = data as WorkerInvokeResult | null;
          const remaining = result?.remaining;
          const status = result?.status;
          const aborted = result?.aborted;
          if (status === "paused" || status === "cancelled" || status === "completed") break;
          if (typeof remaining === "number" && remaining === 0) break;
          if (aborted) {
            toast({ title: "Worker aborted", description: aborted, variant: "destructive" });
            break;
          }
          // small breather between drains
          await new Promise((r) => setTimeout(r, 750));
        }
      } finally {
        setDraining(false);
      }
    })();

    return () => { cancelled = true; drainAbortRef.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status, autoDrain]);

  // Light polling while running but no active drain (e.g. autoDrain off)
  useEffect(() => {
    if (!job) return;
    if (job.status !== "running" || autoDrain) return;
    const i = setInterval(refresh, 3000);
    return () => clearInterval(i);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, autoDrain]);

  const setStatus = async (status: "paused" | "running" | "cancelled") => {
    if (!jobId) return;
    const { error } = await supabase.rpc("set_cohort_job_status", { p_job_id: jobId, p_status: status });
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    await refresh();
  };

  const exportCsv = () => {
    if (!items.length) return;
    const headers = ["email", "tenant_id", "state_snapshot", "planned_action", "outcome", "reason", "action_link", "attempts", "processed_at"];
    const lines = [headers.join(",")];
    for (const it of items) {
      const row = [it.email ?? "", it.tenant_id ?? "", it.state_snapshot, it.planned_action, it.outcome, (it.reason ?? "").replace(/"/g, '""'), it.action_link ?? "", it.attempts, it.processed_at ?? ""];
      lines.push(row.map((v) => /[",\n]/.test(String(v)) ? `"${v}"` : String(v)).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cohort-job-${job?.id?.slice(0, 8)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const summary = useMemo(() => {
    if (!job) return null;
    const done = job.total_sent + job.total_skipped + job.total_failed;
    const pct = job.total_resolved > 0 ? Math.round((done / job.total_resolved) * 100) : 0;
    const remaining = items.filter((i) => i.outcome === "pending").length;
    return { done, pct, remaining };
  }, [job, items]);

  if (accessLoading) return <div className="p-8"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  if (!isVivacityStaff) return <div className="p-8">Vivacity staff only.</div>;
  if (!job) return <div className="p-8 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading job…</div>;

  return (
      <div className="container mx-auto p-6 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/admin/cohort-sender" className="text-sm text-muted-foreground inline-flex items-center">
              <ArrowLeft className="h-3 w-3 mr-1" /> All cohort jobs
            </Link>
            <h1 className="text-2xl font-semibold mt-1">Job {job.id.slice(0, 8)}</h1>
            <p className="text-sm text-muted-foreground">
              {job.action} · created {format(new Date(job.created_at), "dd/MM/yyyy HH:mm")}
            </p>
          </div>
          <div className="flex gap-2">
            {job.status === "running" && (
              <Button variant="outline" onClick={() => setStatus("paused")}>
                <Pause className="h-4 w-4 mr-2" /> Pause
              </Button>
            )}
            {(job.status === "paused" || job.status === "stalled") && (
              <Button variant="outline" onClick={() => setStatus("running")}>
                <Play className="h-4 w-4 mr-2" /> Resume
              </Button>
            )}
            {(job.status === "running" || job.status === "paused" || job.status === "stalled") && (
              <Button variant="outline" onClick={() => setStatus("cancelled")}>
                <X className="h-4 w-4 mr-2" /> Cancel
              </Button>
            )}
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-2" /> Export outcomes CSV
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Progress</CardTitle>
            <Badge variant={job.status === "completed" ? "default" : job.status === "running" ? "secondary" : "outline"}>
              {job.status}{draining ? " · sending…" : ""}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={summary?.pct ?? 0} />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <Stat label="Resolved" value={job.total_resolved} />
              <Stat label="Sent" value={job.total_sent} />
              <Stat label="Skipped" value={job.total_skipped} />
              <Stat label="Failed" value={job.total_failed} />
              <Stat label="Remaining" value={summary?.remaining ?? 0} />
            </div>
            <p className="text-xs text-muted-foreground">
              Sending only runs while this page is open. Closing the tab pauses the drain — reopen this page to resume.
              {" "}
              <label className="ml-2 inline-flex items-center gap-1">
                <input type="checkbox" checked={autoDrain} onChange={(e) => setAutoDrain(e.target.checked)} /> auto-drain
              </label>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recipients ({items.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="max-h-[600px] overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Planned</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Link</TableHead>
                    <TableHead>Processed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-xs">{it.email}</TableCell>
                      <TableCell className="text-xs">{tenantNames.get(it.tenant_id as number) ?? (it.tenant_id ? it.tenant_id.toString() : "—")}</TableCell>
                      <TableCell><Badge variant="outline">{it.state_snapshot}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{it.planned_action}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={
                          it.outcome === "sent" ? "default" :
                          it.outcome === "failed" ? "destructive" :
                          it.outcome === "skipped" ? "secondary" : "outline"
                        }>{it.outcome}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{it.reason ?? ""}</TableCell>
                      <TableCell className="text-xs">
                        {it.action_link ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(it.action_link as string);
                                toast({ title: "Link copied — send via Teams or email." });
                              } catch {
                                toast({ title: "Copy failed — copy manually", description: it.action_link as string });
                              }
                            }}
                          >
                            <Copy className="h-3 w-3 mr-1" /> Copy
                          </Button>
                        ) : ""}
                      </TableCell>
                      <TableCell className="text-xs">{it.processed_at ? format(new Date(it.processed_at), "dd/MM HH:mm:ss") : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

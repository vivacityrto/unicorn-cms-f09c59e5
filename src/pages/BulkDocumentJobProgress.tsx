import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccess } from "@/hooks/useUserAccess";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCcw,
  SkipForward,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { format } from "date-fns";
import {
  JobStatusPill,
  ItemStatePill,
} from "@/components/documents/bulk-generate/jobStatusPill";
import { scopeSummary } from "@/components/documents/bulk-generate/scopeSummary";
import {
  errorCodeLabel,
  outcomeSummary,
} from "@/components/documents/bulk-generate/errorCodeLabel";
import {
  launcherCancel,
  launcherRetry,
} from "@/components/documents/bulk-generate/useBulkGenerateLauncher";

type Job = {
  id: string;
  created_by: string;
  scope: string;
  tenant_ids: number[] | null;
  package_ids: number[] | null;
  stage_ids: number[] | null;
  document_ids: number[] | null;
  status: string;
  total_items: number;
  generated_count: number;
  skipped_count: number;
  failed_count: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  error_summary: Record<string, unknown> | null;
  provisioning_summary: Record<string, unknown> | null;
};

type Item = {
  id: number;
  tenant_id: number;
  package_instance_id: number;
  stageinstance_id: number;
  document_id: number;
  state: string;
  last_error: string | null;
  last_error_code: string | null;
  outcome: unknown;
  started_at: string | null;
  finished_at: string | null;
  leased_at: string | null;
  lease_expires_at: string | null;
};

const TERMINAL = new Set(["completed", "cancelled", "failed"]);

function formatDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso) return "—";
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const secs = Math.max(0, Math.round((end - start) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rs = secs % 60;
  if (mins < 60) return `${mins}m ${rs}s`;
  const hrs = Math.floor(mins / 60);
  const rm = mins % 60;
  return `${hrs}h ${rm}m`;
}

export default function BulkDocumentJobProgress() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isVivacityStaff, isLoading: accessLoading } = useUserAccess();

  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [openTenants, setOpenTenants] = useState<Record<number, boolean>>({});

  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ["bulk-document-job", jobId],
    enabled: !!jobId && isVivacityStaff,
    refetchInterval: (q) => {
      const row = q.state.data as Job | undefined;
      if (!row) return 3000;
      return TERMINAL.has(row.status) ? false : 3000;
    },
    queryFn: async (): Promise<Job | null> => {
      const { data, error } = await supabase
        .from("bulk_document_jobs")
        .select("*")
        .eq("id", jobId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Job | null;
    },
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["bulk-document-job-items", jobId],
    enabled: !!jobId && isVivacityStaff,
    refetchInterval: () => (job && TERMINAL.has(job.status) ? false : 3000),
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase
        .from("bulk_document_job_items")
        .select(
          "id, tenant_id, package_instance_id, stageinstance_id, document_id, state, last_error, last_error_code, outcome, started_at, finished_at, leased_at, lease_expires_at",
        )
        .eq("job_id", jobId!)
        .order("id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  const tenantIds = useMemo(
    () => Array.from(new Set(items.map((i) => i.tenant_id))),
    [items],
  );
  const documentIds = useMemo(
    () => Array.from(new Set(items.map((i) => i.document_id))),
    [items],
  );

  const { data: tenantNames } = useQuery({
    queryKey: ["bulk-document-job", "tenant-names", tenantIds],
    enabled: tenantIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, rto_name")
        .in("id", tenantIds);
      if (error) throw error;
      const map = new Map<number, string>();
      for (const t of (data ?? []) as {
        id: number;
        name: string | null;
        rto_name: string | null;
      }[]) {
        map.set(t.id, t.name ?? t.rto_name ?? `Tenant #${t.id}`);
      }
      return map;
    },
  });

  const { data: documentTitles } = useQuery({
    queryKey: ["bulk-document-job", "document-titles", documentIds],
    enabled: documentIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title")
        .in("id", documentIds);
      if (error) throw error;
      const map = new Map<number, string>();
      for (const d of (data ?? []) as { id: number; title: string | null }[]) {
        map.set(d.id, d.title ?? `Document #${d.id}`);
      }
      return map;
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<number, Item[]>();
    for (const it of items) {
      const arr = map.get(it.tenant_id) ?? [];
      arr.push(it);
      map.set(it.tenant_id, arr);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const na = tenantNames?.get(a[0]) ?? "";
      const nb = tenantNames?.get(b[0]) ?? "";
      return na.localeCompare(nb);
    });
  }, [items, tenantNames]);




  const onCancel = async () => {
    if (!jobId) return;
    setCancelling(true);
    try {
      await launcherCancel(jobId);
      toast({ title: "Cancellation requested" });
      qc.invalidateQueries({ queryKey: ["bulk-document-job", jobId] });
    } catch (e) {
      toast({
        title: "Cancel failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  const onRetry = async () => {
    if (!jobId) return;
    setRetrying(true);
    try {
      await launcherRetry(jobId);
      toast({ title: "Retry queued" });
      qc.invalidateQueries({ queryKey: ["bulk-document-job", jobId] });
      qc.invalidateQueries({ queryKey: ["bulk-document-job-items", jobId] });
    } catch (e) {
      toast({
        title: "Retry failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setRetrying(false);
    }
  };

  if (accessLoading || jobLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isVivacityStaff) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="rounded-md border p-6 text-sm text-muted-foreground">
            You don't have access to this page.
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="rounded-md border p-6 text-sm text-muted-foreground">
            Job not found.
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isRunning = job.status === "running";
  const isStalled = job.status === "stalled";
  const isPolling = !TERMINAL.has(job.status);

  const nowMs = Date.now();
  const eligibleRetry = items.filter(
    (i) =>
      i.state === "failed" ||
      i.state === "cancelled" ||
      (i.state === "leased" &&
        i.lease_expires_at !== null &&
        new Date(i.lease_expires_at).getTime() < nowMs),
  ).length;
  const canRetry = eligibleRetry > 0 || isStalled;

  // Currently-generating banner data (client-side; no new query).
  const leasedNow = useMemo(
    () =>
      items
        .filter((i) => i.state === "leased" && i.leased_at)
        .sort(
          (a, b) =>
            new Date(a.leased_at!).getTime() - new Date(b.leased_at!).getTime(),
        ),
    [items],
  );
  const activeItem = leasedNow[0];
  const showActive = isRunning && !!activeItem;

  // Overall progress segments (authoritative counters from job row).
  const total = Math.max(0, job.total_items);
  const gCount = Math.max(0, job.generated_count);
  const sCount = Math.max(0, job.skipped_count);
  const fCount = Math.max(0, job.failed_count);
  const doneCount = Math.min(total, gCount + sCount + fCount);
  const pCount = Math.max(0, total - doneCount);
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const seg = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <DashboardLayout>
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/manage-documents/bulk-jobs")}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            All jobs
          </Button>
          <div>
            <h1 className="text-[22px] font-bold flex items-center gap-3">
              Bulk generation job
              <JobStatusPill status={job.status} />
              {isPolling && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              {scopeSummary(job)} · Started{" "}
              {job.started_at
                ? format(new Date(job.started_at), "dd MMM yyyy HH:mm")
                : "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={cancelling}
              className="gap-2"
            >
              {cancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              Cancel
            </Button>
          )}
          {canRetry && (
            <Button
              onClick={onRetry}
              disabled={retrying}
              className="gap-2 bg-amber-500 hover:bg-amber-600 text-white"
            >
              {retrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              Retry Failed &amp; Pending
              {eligibleRetry > 0 ? ` (${eligibleRetry})` : ""}
            </Button>
          )}
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Overall progress</span>
          <span className="font-medium text-foreground">
            {pct}% · {doneCount.toLocaleString()}/{total.toLocaleString()}
          </span>
        </div>
        <SegmentedBar
          height={10}
          segments={[
            { pct: seg(gCount), className: "bg-emerald-500" },
            { pct: seg(sCount), className: "bg-slate-400" },
            { pct: seg(fCount), className: "bg-red-500" },
            { pct: seg(pCount), className: "bg-blue-500" },
          ]}
        />
      </div>

      {/* Currently generating */}
      {showActive && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 flex items-center gap-3 animate-fade-in">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inset-0 rounded-full bg-blue-500 opacity-75 animate-ping" />
            <span className="relative rounded-full bg-blue-500 h-2.5 w-2.5" />
          </span>
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          <div className="text-sm min-w-0 flex-1">
            <div className="text-blue-900 truncate">
              <span className="font-medium">Generating:</span>{" "}
              {tenantNames?.get(activeItem.tenant_id) ??
                `Tenant #${activeItem.tenant_id}`}{" "}
              —{" "}
              {documentTitles?.get(activeItem.document_id) ??
                `Document #${activeItem.document_id}`}
            </div>
            {leasedNow.length > 1 && (
              <div className="text-xs text-blue-700/80">
                + {leasedNow.length - 1} more in this batch
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryTile label="Total" value={job.total_items} />
        <SummaryTile
          label="Generated"
          value={job.generated_count}
          tone="emerald"
          icon={CheckCircle2}
          percent={total > 0 ? Math.round((gCount / total) * 100) : undefined}
        />
        <SummaryTile
          label="Skipped"
          value={job.skipped_count}
          tone="slate"
          icon={SkipForward}
          percent={total > 0 ? Math.round((sCount / total) * 100) : undefined}
        />
        <SummaryTile
          label="Failed"
          value={job.failed_count}
          tone="red"
          icon={XCircle}
          percent={total > 0 ? Math.round((fCount / total) * 100) : undefined}
        />
        <SummaryTile
          label="Duration"
          value={formatDuration(job.started_at, job.finished_at)}
          isString
          icon={Clock}
        />
      </div>

      {/* Items grouped by tenant */}
      {itemsLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">
          No items on this job.
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map(([tid, list]) => {
            const generated = list.filter(
              (i) => i.state === "generated" || i.state === "succeeded",
            ).length;
            const skipped = list.filter((i) => i.state === "skipped").length;
            const failed = list.filter((i) => i.state === "failed").length;
            const pending = list.filter(
              (i) => i.state === "pending" || i.state === "leased",
            ).length;
            const isOpen = openTenants[tid] ?? false;
            return (
              <Collapsible
                key={tid}
                open={isOpen}
                onOpenChange={(v) =>
                  setOpenTenants((prev) => ({ ...prev, [tid]: v }))
                }
              >
                <div className="rounded-md border">
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-3 hover:bg-muted/50 text-left">
                      <div className="flex items-center gap-2">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <span className="font-medium text-sm">
                          {tenantNames?.get(tid) ?? `Tenant #${tid}`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {list.length} item{list.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div
                        className="flex items-center gap-3"
                        title={`generated: ${generated} · skipped: ${skipped} · failed: ${failed} · pending: ${pending}`}
                      >
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {generated + skipped + failed}/{list.length}
                        </span>
                        <div className="w-24">
                          <SegmentedBar
                            height={6}
                            segments={[
                              {
                                pct:
                                  list.length > 0
                                    ? (generated / list.length) * 100
                                    : 0,
                                className: "bg-emerald-500",
                              },
                              {
                                pct:
                                  list.length > 0
                                    ? (skipped / list.length) * 100
                                    : 0,
                                className: "bg-slate-400",
                              },
                              {
                                pct:
                                  list.length > 0
                                    ? (failed / list.length) * 100
                                    : 0,
                                className: "bg-red-500",
                              },
                              {
                                pct:
                                  list.length > 0
                                    ? (pending / list.length) * 100
                                    : 0,
                                className: "bg-blue-500",
                              },
                            ]}
                          />
                        </div>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-32">State</TableHead>
                          <TableHead>Document</TableHead>
                          <TableHead>Result</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((it) => (
                          <TableRow key={it.id}>
                            <TableCell>
                              <ItemStatePill state={it.state} />
                            </TableCell>
                            <TableCell className="text-sm">
                              {documentTitles?.get(it.document_id) ??
                                `Document #${it.document_id}`}
                            </TableCell>
                            <TableCell className="text-sm">
                              <ItemResult item={it} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
    </DashboardLayout>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  isString,
}: {
  label: string;
  value: number | string;
  tone?: "emerald" | "slate" | "red";
  isString?: boolean;
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "red"
        ? "text-red-700"
        : tone === "slate"
          ? "text-slate-700"
          : "";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${toneCls}`}>
        {isString ? value : (value as number).toLocaleString()}
      </div>
    </div>
  );
}

function ItemResult({ item }: { item: Item }) {
  if (item.state === "generated" || item.state === "succeeded") {
    const s = outcomeSummary(item.outcome);
    return (
      <div>
        <div className="text-emerald-700">{s.label}</div>
        {s.detail && (
          <div className="text-xs text-muted-foreground">{s.detail}</div>
        )}
      </div>
    );
  }
  if (item.state === "skipped" || item.state === "failed" || item.state === "cancelled") {
    const label =
      errorCodeLabel(item.last_error_code) ||
      (item.state === "cancelled" ? "Cancelled" : "");
    return (
      <div>
        <div className={item.state === "failed" ? "text-red-700" : "text-slate-700"}>
          {label || "—"}
        </div>
        {item.last_error && (
          <div className="text-xs text-muted-foreground line-clamp-2">
            {item.last_error}
          </div>
        )}
      </div>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

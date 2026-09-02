import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccess } from "@/hooks/useUserAccess";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  History,
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
  stalledReasonLabel,
} from "@/components/documents/bulk-generate/errorCodeLabel";
import {
  launcherCancel,
  launcherRetry,
  launcherSkipItems,
  launcherRequeueSkipped,
} from "@/components/documents/bulk-generate/useBulkGenerateLauncher";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

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
  requeued_to_job_id: string | null;
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

// "Duration" above is raw wall-clock since started_at — for a job that has
// stalled and been retried more than once, that number conflates real
// processing time with idle/stalled gaps (e.g. a job open 39h47m might have
// had only a few hours of actual worker activity). "Last activity" answers
// the question that number can't: how stale is this job's chain right now.
function formatAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Math.max(0, Date.now() - new Date(iso).getTime());
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type StallHistoryEntry = { reason: string; at: string; source: "worker" | "watchdog" | string };

// error_summary.stall_history is additive (see stall_bulk_document_job and
// reclaim_stale_bulk_document_locks) — every stall event appended, never
// cleared, unlike stalled_reason/stalled_at which are overwritten on each
// stall and only ever reflect the MOST RECENT event.
function getStallHistory(errorSummary: Record<string, unknown> | null): StallHistoryEntry[] {
  const raw = errorSummary?.stall_history;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is StallHistoryEntry =>
      !!e && typeof e === "object" && typeof (e as StallHistoryEntry).reason === "string",
  );
}

export default function BulkDocumentJobProgress() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isVivacityStaff, isLoading: accessLoading } = useUserAccess();

  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryDialogOpen, setRetryDialogOpen] = useState(false);
  const [skippedDialogOpen, setSkippedDialogOpen] = useState(false);
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
      // PostgREST caps rows per request (commonly 1000) regardless of an
      // explicit .limit() — jobs with more items than that cap were silently
      // truncated, undercounting both the per-tenant list and retry-eligible
      // items. Page through with .range() until a page comes back short.
      const PAGE_SIZE = 1000;
      const all: Item[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("bulk_document_job_items")
          .select(
            "id, tenant_id, package_instance_id, stageinstance_id, document_id, state, last_error, last_error_code, outcome, started_at, finished_at, leased_at, lease_expires_at, requeued_to_job_id",
          )
          .eq("job_id", jobId!)
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data ?? []) as Item[];
        all.push(...page);
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all;
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

  // Most recent item-level activity across the whole job — distinct from
  // job.started_at/"Duration" (raw wall-clock since creation, which conflates
  // real processing time with any idle/stalled gaps). Falls back to
  // started_at for a job with no item activity yet.
  const lastActivityAt = useMemo(() => {
    let latest: string | null = null;
    for (const it of items) {
      for (const ts of [it.finished_at, it.leased_at, it.started_at]) {
        if (ts && (!latest || ts > latest)) latest = ts;
      }
    }
    return latest ?? job?.started_at ?? null;
  }, [items, job?.started_at]);

  // Currently-generating banner data (client-side; no new query).
  // Must be declared before any early returns to keep hook order stable.
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

  // Items eligible for retry (failed, cancelled, or leased-expired). Declared
  // before early returns to keep hook order stable and to satisfy the
  // onRetryConfirm closure that captures this value.
  const retryEligibleItems = useMemo(() => {
    const now = Date.now();
    return items.filter(
      (i) =>
        i.state === "failed" ||
        i.state === "cancelled" ||
        (i.state === "leased" &&
          i.lease_expires_at !== null &&
          new Date(i.lease_expires_at).getTime() < now),
    );
  }, [items]);

  // Skipped items (typically no_published_version) — no automatic retry
  // path exists for these (retry_bulk_document_job deliberately excludes
  // 'skipped'), so they're surfaced separately for review/requeue.
  const skippedItems = useMemo(
    () => items.filter((i) => i.state === "skipped"),
    [items],
  );

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

  const onRetryConfirm = async (excludedItemIds: number[]) => {
    if (!jobId) return;
    setRetrying(true);
    try {
      if (excludedItemIds.length > 0) {
        await launcherSkipItems(jobId, excludedItemIds);
      }
      // If everything was excluded, don't fire a retry — nothing left to do.
      const willRetry = excludedItemIds.length < retryEligibleItems.length;
      if (willRetry) {
        await launcherRetry(jobId);
        toast({
          title: "Retry queued",
          description:
            excludedItemIds.length > 0
              ? `${excludedItemIds.length} item(s) excluded, remaining will retry.`
              : undefined,
        });
      } else {
        toast({
          title: "Items excluded",
          description: `${excludedItemIds.length} item(s) marked as skipped. No retry queued.`,
        });
      }
      setRetryDialogOpen(false);
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
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!isVivacityStaff) {
    return (
      <div className="p-6">
        <div className="rounded-md border p-6 text-sm text-muted-foreground">
          You don't have access to this page.
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6">
        <div className="rounded-md border p-6 text-sm text-muted-foreground">
          Job not found.
        </div>
      </div>
    );
  }

  const isRunning = job.status === "running";
  const isStalled = job.status === "stalled";
  const isPolling = !TERMINAL.has(job.status);

  const nowMs = Date.now();
  const eligibleRetry = retryEligibleItems.length;
  const remainingWork = items.filter(
    (i) =>
      i.state === "pending" ||
      i.state === "failed" ||
      i.state === "cancelled" ||
      (i.state === "leased" &&
        i.lease_expires_at !== null &&
        new Date(i.lease_expires_at).getTime() < nowMs),
  ).length;
  const canRetry = (eligibleRetry > 0 || isStalled) && job.status !== "running";
  const stallHistory = getStallHistory(job.error_summary);

  // Currently-generating banner data (client-side; no new query).
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
              {job.status === "stalled" &&
              (job.error_summary as { stalled_reason?: string } | null)
                ?.stalled_reason ? (
                <span className="text-xs text-muted-foreground font-normal">
                  {stalledReasonLabel(
                    (job.error_summary as { stalled_reason?: string })
                      .stalled_reason as string,
                  )}
                </span>
              ) : null}
              {stallHistory.length > 1 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground border rounded-full px-2 py-0.5"
                    >
                      <History className="h-3 w-3" />
                      Stalled {stallHistory.length}×
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-96" align="start">
                    <div className="text-xs font-medium mb-2">Stall history</div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {[...stallHistory].reverse().map((h, idx) => (
                        <div key={idx} className="text-xs border-l-2 border-muted pl-2">
                          <div className="text-muted-foreground">
                            {format(new Date(h.at), "dd MMM yyyy HH:mm:ss")} ·{" "}
                            {h.source === "watchdog" ? "watchdog" : "worker"}
                          </div>
                          <div className="mt-0.5">{stalledReasonLabel(h.reason).replace(/^Stalled — /, "")}</div>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
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
          {(isRunning || isStalled) && (
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
              {isStalled ? "Don't retry (cancel job)" : "Cancel"}
            </Button>
          )}
          {canRetry && (
            <Button
              onClick={() => setRetryDialogOpen(true)}
              disabled={retrying}
              className="gap-2 bg-amber-500 hover:bg-amber-600 text-white"
            >
              {retrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              Retry Failed &amp; Pending
              {remainingWork > 0 ? ` (${remainingWork})` : ""}
            </Button>
          )}
          {skippedItems.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setSkippedDialogOpen(true)}
              className="gap-2"
            >
              <SkipForward className="h-4 w-4" />
              Review Skipped ({skippedItems.length})
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
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 flex items-center gap-3 animate-fade-in dark:border-blue-800 dark:bg-blue-950/40">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inset-0 rounded-full bg-blue-500 opacity-75 animate-ping" />
            <span className="relative rounded-full bg-blue-500 h-2.5 w-2.5" />
          </span>
          <Loader2 className="h-4 w-4 animate-spin text-blue-700 dark:text-blue-300" />
          <div className="text-sm min-w-0 flex-1">
            <div className="text-blue-900 dark:text-blue-200 truncate">
              <span className="font-medium">Generating:</span>{" "}
              {tenantNames?.get(activeItem.tenant_id) ??
                `Tenant #${activeItem.tenant_id}`}{" "}
              —{" "}
              {documentTitles?.get(activeItem.document_id) ??
                `Document #${activeItem.document_id}`}
            </div>
            {leasedNow.length > 1 && (
              <div className="text-xs text-blue-700/80 dark:text-blue-300/80">
                + {leasedNow.length - 1} more in this batch
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
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
        <SummaryTile
          label="Last Activity"
          value={formatAgo(lastActivityAt)}
          isString
          icon={History}
          // isRunning but no item activity in 3+ min is exactly what the
          // resume-stalled backstop cron treats as idle — flag it the same
          // way here so staff don't have to do the math themselves.
          tone={
            isRunning &&
            lastActivityAt &&
            Date.now() - new Date(lastActivityAt).getTime() > 3 * 60 * 1000
              ? "red"
              : undefined
          }
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

      <RetryDialog
        open={retryDialogOpen}
        onOpenChange={setRetryDialogOpen}
        items={retryEligibleItems}
        pendingCount={items.filter((i) => i.state === "pending").length}
        tenantNames={tenantNames}
        documentTitles={documentTitles}
        submitting={retrying}
        onConfirm={onRetryConfirm}
      />

      <SkippedDocumentsDialog
        open={skippedDialogOpen}
        onOpenChange={setSkippedDialogOpen}
        items={skippedItems}
        documentTitles={documentTitles}
        onRequeued={(newJobId) => navigate(`/manage-documents/bulk-jobs/${newJobId}`)}
      />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  isString,
  icon: Icon,
  percent,
}: {
  label: string;
  value: number | string;
  tone?: "emerald" | "slate" | "red";
  isString?: boolean;
  icon?: LucideIcon;
  percent?: number;
}) {
  const toneText =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "red"
        ? "text-red-700 dark:text-red-400"
        : tone === "slate"
          ? "text-slate-700 dark:text-slate-300"
          : "";
  const toneBg =
    tone === "emerald"
      ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800"
      : tone === "red"
        ? "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800"
        : tone === "slate"
          ? "bg-slate-50 border-slate-200 dark:bg-slate-800/60 dark:border-slate-600"
          : "";
  return (
    <div className={`rounded-md border p-3 ${toneBg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-muted-foreground">{label}</div>
        {Icon && <Icon className={`h-4 w-4 ${toneText || "text-muted-foreground"}`} />}
      </div>
      <div className={`text-xl font-semibold ${toneText}`}>
        {isString ? value : (value as number).toLocaleString()}
      </div>
      {typeof percent === "number" && (
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {percent}% of total
        </div>
      )}
    </div>
  );
}

function SegmentedBar({
  height,
  segments,
}: {
  height: number;
  segments: Array<{ pct: number; className: string }>;
}) {
  return (
    <div
      className="w-full flex overflow-hidden rounded-full bg-muted"
      style={{ height }}
    >
      {segments.map((s, i) =>
        s.pct > 0 ? (
          <div
            key={i}
            className={s.className}
            style={{ width: `${s.pct}%`, height: "100%" }}
          />
        ) : null,
      )}
    </div>
  );
}

function ItemResult({ item }: { item: Item }) {
  if (item.state === "generated" || item.state === "succeeded") {
    const s = outcomeSummary(item.outcome);
    return (
      <div>
        <div className="text-emerald-700 dark:text-emerald-400">{s.label}</div>
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
        <div
          className={
            item.state === "failed"
              ? "text-red-700 dark:text-red-400"
              : "text-slate-700 dark:text-slate-400"
          }
        >
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

function RetryDialog({
  open,
  onOpenChange,
  items,
  pendingCount,
  tenantNames,
  documentTitles,
  submitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: Item[];
  pendingCount: number;
  tenantNames: Map<number, string> | undefined;
  documentTitles: Map<number, string> | undefined;
  submitting: boolean;
  onConfirm: (excludedItemIds: number[]) => void;
}) {
  // Selection state — checked = retry, unchecked = exclude/skip.
  // Default all checked whenever the dialog opens with a new item set.
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const itemsKey = items.map((i) => i.id).join(",");
  // Reset selection whenever the dialog opens or the eligible set changes.
  useEffect(() => {
    if (open) {
      const next: Record<number, boolean> = {};
      for (const it of items) next[it.id] = true;
      setChecked(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemsKey]);

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

  const retryCount = items.filter((i) => checked[i.id]).length;
  const skipCount = items.length - retryCount;

  const toggleItem = (id: number) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleTenant = (tenantId: number, newValue: boolean) => {
    setChecked((prev) => {
      const next = { ...prev };
      for (const it of items) {
        if (it.tenant_id === tenantId) next[it.id] = newValue;
      }
      return next;
    });
  };

  const confirmLabel =
    retryCount > 0 && skipCount > 0
      ? `Retry ${retryCount} · Skip ${skipCount}`
      : retryCount > 0
        ? `Retry ${retryCount} item${retryCount === 1 ? "" : "s"}`
        : `Skip ${skipCount} item${skipCount === 1 ? "" : "s"}`;

  const handleConfirm = () => {
    const excluded = items.filter((i) => !checked[i.id]).map((i) => i.id);
    onConfirm(excluded);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Retry failed items</DialogTitle>
          <DialogDescription>
            Uncheck any items you don't want to retry — for example docs with no
            template file, or items that keep failing for the same tenant.
            Unchecked items will be marked as <strong>skipped</strong> on this
            job and won't run again.
            {pendingCount > 0 && (
              <>
                {" "}This job also has{" "}
                <strong>{pendingCount.toLocaleString()} pending item{pendingCount === 1 ? "" : "s"}</strong>{" "}
                that were never attempted — those aren't shown here (nothing to
                decide on them) but will resume automatically once the job is
                un-stalled.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto rounded-md border">
          {grouped.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No retry-eligible items.
            </div>
          ) : (
            grouped.map(([tenantId, tItems]) => {
              const tenantChecked = tItems.filter(
                (i) => checked[i.id],
              ).length;
              const allChecked = tenantChecked === tItems.length;
              const noneChecked = tenantChecked === 0;
              return (
                <div
                  key={tenantId}
                  className="border-b last:border-b-0"
                >
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/40">
                    <Checkbox
                      checked={
                        allChecked ? true : noneChecked ? false : "indeterminate"
                      }
                      onCheckedChange={(v) => toggleTenant(tenantId, v === true)}
                      aria-label="Toggle all items for this tenant"
                    />
                    <div className="text-sm font-medium flex-1 truncate">
                      {tenantNames?.get(tenantId) ?? `Tenant #${tenantId}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {tenantChecked} of {tItems.length}
                    </div>
                  </div>
                  <ul className="divide-y">
                    {tItems.map((it) => {
                      const errLabel =
                        errorCodeLabel(it.last_error_code) ||
                        (it.state === "cancelled" ? "Cancelled" : "");
                      return (
                        <li
                          key={it.id}
                          className="flex items-start gap-2 px-3 py-2"
                        >
                          <Checkbox
                            checked={!!checked[it.id]}
                            onCheckedChange={() => toggleItem(it.id)}
                            aria-label="Retry this item"
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm truncate">
                              {documentTitles?.get(it.document_id) ??
                                `Document #${it.document_id}`}
                            </div>
                            {errLabel && (
                              <div className="text-xs text-muted-foreground">
                                {errLabel}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || items.length === 0}
            className="gap-2 bg-amber-500 hover:bg-amber-600 text-white"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Skipped items (typically outcome.reason='no_published_version') have no
// automatic retry path — retry_bulk_document_job deliberately excludes
// 'skipped' state. This dialog groups them by document (not tenant, since
// the fix is per-document: publish it), shows each document's live publish
// status, and lets staff create a follow-up job cloning exactly the skipped
// (tenant, document) tuples — via requeue_skipped_bulk_document_items — so
// the same client list gets the document generated, nothing more.
function SkippedDocumentsDialog({
  open,
  onOpenChange,
  items,
  documentTitles,
  onRequeued,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: Item[];
  documentTitles: Map<number, string> | undefined;
  onRequeued: (jobId: string) => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const documentIds = useMemo(
    () => Array.from(new Set(items.map((i) => i.document_id))),
    [items],
  );

  const { data: publishedDocIds } = useQuery({
    queryKey: ["bulk-document-job", "skipped-doc-publish-status", documentIds],
    enabled: open && documentIds.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Set<number>> => {
      const { data, error } = await supabase
        .from("document_versions")
        .select("document_id")
        .in("document_id", documentIds)
        .eq("status", "published");
      if (error) throw error;
      return new Set((data ?? []).map((d) => d.document_id as number));
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<number, Item[]>();
    for (const it of items) {
      const arr = map.get(it.document_id) ?? [];
      arr.push(it);
      map.set(it.document_id, arr);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const ta = documentTitles?.get(a[0]) ?? "";
      const tb = documentTitles?.get(b[0]) ?? "";
      return ta.localeCompare(tb);
    });
  }, [items, documentTitles]);

  // Per-document requeue status, so staff can see at a glance whether some
  // (or all) of a document's skipped items were already cloned into an
  // earlier follow-up job — the exact "did someone already handle this"
  // signal that was missing before, and the reason a second follow-up job
  // could get created for the same items without anyone noticing.
  const requeueInfo = useMemo(() => {
    const map = new Map<
      number,
      { requeuedCount: number; totalCount: number; jobIds: string[] }
    >();
    for (const [docId, its] of grouped) {
      const jobIds = Array.from(
        new Set(
          its
            .map((i) => i.requeued_to_job_id)
            .filter((id): id is string => !!id),
        ),
      );
      map.set(docId, {
        requeuedCount: its.filter((i) => i.requeued_to_job_id).length,
        totalCount: its.length,
        jobIds,
      });
    }
    return map;
  }, [grouped]);

  // Default-check documents that are already published AND not already
  // fully requeued (nothing to lose by including them); leave unpublished
  // or fully-handled ones unchecked by default — staff can still check one
  // manually if they know it's about to be published, or if a prior
  // follow-up job genuinely needs a second attempt.
  useEffect(() => {
    if (!open || !publishedDocIds) return;
    setChecked((prev) => {
      const next = { ...prev };
      for (const [docId] of grouped) {
        if (next[docId] === undefined) {
          const info = requeueInfo.get(docId);
          const fullyRequeued = !!info && info.requeuedCount >= info.totalCount;
          next[docId] = publishedDocIds.has(docId) && !fullyRequeued;
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, publishedDocIds, grouped.length]);

  // Exclude items already claimed by an earlier follow-up job even if their
  // document group is checked — checking a document should never silently
  // re-requeue items someone already actioned. Staff who genuinely want a
  // second attempt on an already-requeued item can't get that from this
  // dialog; that's an accepted trade-off to keep "check the box" safe by
  // default.
  const selectedItemIds = useMemo(
    () =>
      grouped
        .filter(([docId]) => checked[docId])
        .flatMap(([, its]) => its.filter((i) => !i.requeued_to_job_id).map((i) => i.id)),
    [grouped, checked],
  );

  const handleCreateFollowUp = async () => {
    if (selectedItemIds.length === 0) return;
    setSubmitting(true);
    try {
      const { job_id } = await launcherRequeueSkipped(selectedItemIds);
      toast({
        title: "Follow-up job created",
        description: `${selectedItemIds.length} item${selectedItemIds.length === 1 ? "" : "s"} queued.`,
      });
      onOpenChange(false);
      onRequeued(job_id);
    } catch (e) {
      toast({
        title: "Requeue failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review skipped documents</DialogTitle>
          <DialogDescription>
            These documents had no published version when this job ran, so
            they were skipped rather than generated. Publish a document, then
            check it below and create a follow-up job — it generates exactly
            this same client list for the documents you select, not the
            document's full eligible scope.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto rounded-md border divide-y">
          {grouped.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No skipped documents.
            </div>
          ) : (
            grouped.map(([docId, its]) => {
              const isPublished = publishedDocIds?.has(docId) ?? false;
              const info = requeueInfo.get(docId);
              const fullyRequeued = !!info && info.requeuedCount >= info.totalCount;
              const partiallyRequeued =
                !!info && info.requeuedCount > 0 && !fullyRequeued;
              return (
                <div key={docId} className="flex items-start gap-3 px-3 py-3">
                  <Checkbox
                    checked={!!checked[docId]}
                    onCheckedChange={(v) =>
                      setChecked((prev) => ({ ...prev, [docId]: v === true }))
                    }
                    disabled={fullyRequeued}
                    aria-label="Include this document in the follow-up job"
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {documentTitles?.get(docId) ?? `Document #${docId}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Skipped for {its.length} item{its.length === 1 ? "" : "s"}
                    </div>
                    {info && info.requeuedCount > 0 && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {fullyRequeued
                          ? "Already requeued"
                          : `${info.requeuedCount} of ${info.totalCount} already requeued`}
                        {info.jobIds.length === 1 ? (
                          <>
                            {" — "}
                            <a
                              href={`/manage-documents/bulk-jobs/${info.jobIds[0]}`}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-2"
                            >
                              view job
                            </a>
                          </>
                        ) : info.jobIds.length > 1 ? (
                          " across multiple follow-up jobs"
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isPublished ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      >
                        Published
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      >
                        Not published
                      </Badge>
                    )}
                    {(fullyRequeued || partiallyRequeued) && (
                      <Badge
                        variant="outline"
                        className="border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                      >
                        {fullyRequeued ? "Requeued" : "Partly requeued"}
                      </Badge>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/manage-documents?doc=${docId}`} target="_blank" rel="noreferrer">
                        Open document
                      </a>
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateFollowUp}
            disabled={submitting || selectedItemIds.length === 0}
            className="gap-2"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Create follow-up job
            {selectedItemIds.length > 0 ? ` (${selectedItemIds.length} items)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

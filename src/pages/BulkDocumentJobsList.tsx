import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccess } from "@/hooks/useUserAccess";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, ArrowLeft, FileStack, RefreshCcw, X } from "lucide-react";
import { JobStatusPill } from "@/components/documents/bulk-generate/jobStatusPill";
import { scopeSummary } from "@/components/documents/bulk-generate/scopeSummary";
import { stalledReasonLabel } from "@/components/documents/bulk-generate/errorCodeLabel";
import {
  launcherCancel,
  launcherRetry,
} from "@/components/documents/bulk-generate/useBulkGenerateLauncher";

type JobRow = {
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
};

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

export default function BulkDocumentJobsList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isVivacityStaff, isLoading: accessLoading } = useUserAccess();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["bulk-document-jobs", "list"],
    enabled: isVivacityStaff,
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    queryFn: async (): Promise<JobRow[]> => {
      const { data, error } = await supabase
        .from("bulk_document_jobs")
        .select(
          "id, created_by, scope, tenant_ids, package_ids, stage_ids, document_ids, status, total_items, generated_count, skipped_count, failed_count, started_at, finished_at, created_at, error_summary",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as JobRow[];
    },
  });

  const stalledJobs = useMemo(
    () => jobs.filter((j) => j.status === "stalled"),
    [jobs],
  );

  const onQuickRetry = async (jobId: string) => {
    setRetryingId(jobId);
    try {
      await launcherRetry(jobId);
      toast({ title: "Retry queued" });
      qc.invalidateQueries({ queryKey: ["bulk-document-jobs", "list"] });
    } catch (e) {
      toast({
        title: "Retry failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setRetryingId(null);
    }
  };

  const onQuickCancel = async (jobId: string) => {
    setCancellingId(jobId);
    try {
      await launcherCancel(jobId, "Stalled — cancelled from jobs list, not retried");
      toast({ title: "Job cancelled" });
      qc.invalidateQueries({ queryKey: ["bulk-document-jobs", "list"] });
    } catch (e) {
      toast({
        title: "Cancel failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setCancellingId(null);
    }
  };

  const creatorIds = useMemo(
    () => Array.from(new Set(jobs.map((j) => j.created_by).filter(Boolean))),
    [jobs],
  );

  const { data: creators } = useQuery({
    queryKey: ["bulk-document-jobs", "creators", creatorIds],
    enabled: creatorIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, email")
        .in("user_uuid", creatorIds);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const u of (data ?? []) as {
        user_uuid: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }[]) {
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
        map.set(u.user_uuid, name || u.email || u.user_uuid.slice(0, 8));
      }
      return map;
    },
  });

  if (accessLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
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

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/manage-documents")}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Documents
          </Button>
          <div>
            <h1 className="text-[24px] font-bold">Bulk generation jobs</h1>
            <p className="text-sm text-muted-foreground">
              Every bulk document generation job across the workspace.
            </p>
          </div>
        </div>
      </div>

      {stalledJobs.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-400 bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {stalledJobs.length} job{stalledJobs.length === 1 ? "" : "s"} stalled
            and waiting on a manual retry — usually a session token expired
            mid-run. Retry below or open the job for details.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center">
          <FileStack className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No bulk generation jobs yet.</p>
          <p className="text-xs text-muted-foreground">
            Start one from the Documents page header.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Creator</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => {
                const isStalled = j.status === "stalled";
                const stalledReason = (
                  j.error_summary as { stalled_reason?: string } | null
                )?.stalled_reason;
                return (
                <TableRow
                  key={j.id}
                  className={cn(
                    "cursor-pointer hover:bg-muted/50",
                    isStalled && "bg-amber-50 dark:bg-amber-950/20",
                  )}
                  onClick={() =>
                    navigate(`/manage-documents/bulk-jobs/${j.id}`)
                  }
                >
                  <TableCell className="whitespace-nowrap">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            {formatDistanceToNow(new Date(j.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {format(new Date(j.created_at), "dd MMM yyyy HH:mm")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {creators?.get(j.created_by) ?? j.created_by.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/manage-documents/bulk-jobs/${j.id}`}
                      className="text-sm hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {scopeSummary(j)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <JobStatusPill status={j.status} />
                    {isStalled && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {stalledReasonLabel(stalledReason)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    <span className="text-emerald-700 dark:text-emerald-400">{j.generated_count}</span>
                    {" / "}
                    <span className="text-slate-600 dark:text-slate-400">{j.skipped_count}</span>
                    {" / "}
                    <span className="text-red-700 dark:text-red-400">{j.failed_count}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      of {j.total_items}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDuration(j.started_at, j.finished_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {isStalled && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retryingId === j.id || cancellingId === j.id}
                          className="gap-1 border-amber-400 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/60"
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickRetry(j.id);
                          }}
                        >
                          <RefreshCcw className="h-3.5 w-3.5" />
                          {retryingId === j.id ? "Retrying…" : "Retry"}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={retryingId === j.id || cancellingId === j.id}
                              className="gap-1 text-muted-foreground hover:text-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <X className="h-3.5 w-3.5" />
                              {cancellingId === j.id ? "Cancelling…" : "Don't retry"}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel this stalled job?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This marks the job as cancelled and moves its
                                remaining pending items to cancelled — they
                                won't be generated. This can't be undone; you'd
                                need to start a new bulk generation job to
                                cover the same clients/documents again.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep stalled</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onQuickCancel(j.id)}
                              >
                                Cancel job
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

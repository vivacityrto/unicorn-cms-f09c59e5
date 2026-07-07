import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccess } from "@/hooks/useUserAccess";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowLeft, FileStack } from "lucide-react";
import { JobStatusPill } from "@/components/documents/bulk-generate/jobStatusPill";
import { scopeSummary } from "@/components/documents/bulk-generate/scopeSummary";

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
  const { isVivacityStaff, isLoading: accessLoading } = useUserAccess();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["bulk-document-jobs", "list"],
    enabled: isVivacityStaff,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<JobRow[]> => {
      const { data, error } = await supabase
        .from("bulk_document_jobs")
        .select(
          "id, created_by, scope, tenant_ids, package_ids, stage_ids, document_ids, status, total_items, generated_count, skipped_count, failed_count, started_at, finished_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as JobRow[];
    },
  });

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow
                  key={j.id}
                  className="cursor-pointer hover:bg-muted/50"
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
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    <span className="text-emerald-700">{j.generated_count}</span>
                    {" / "}
                    <span className="text-slate-600">{j.skipped_count}</span>
                    {" / "}
                    <span className="text-red-700">{j.failed_count}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      of {j.total_items}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDuration(j.started_at, j.finished_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

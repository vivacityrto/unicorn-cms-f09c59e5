import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PreviewRow } from "./useBulkGenerateLauncher";

interface Props {
  preview: PreviewRow | null;
  stale: boolean;
  loading: boolean;
  error: string | null;
}

export function PreviewPanel({ preview, stale, loading, error }: Props) {
  if (loading) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        Calculating preview…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <div className="font-medium">Preview failed</div>
          <div className="text-xs mt-0.5">{error}</div>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        Click <span className="font-medium">Preview</span> to see how many
        documents will be generated.
      </div>
    );
  }

  const zero = preview.eligible_count === 0;

  return (
    <div
      className={cn(
        "rounded-md border p-4 space-y-3",
        stale && "border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20",
        zero && !stale && "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40",
      )}
    >
      <div className="flex items-start gap-2">
        {zero ? (
          <AlertCircle className="h-4 w-4 mt-0.5 text-slate-500 dark:text-slate-400 shrink-0" />
        ) : (
          <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        )}
        <div className="flex-1">
          <div className="text-sm font-medium">
            {zero
              ? "No eligible documents — adjust filters."
              : `${preview.eligible_count.toLocaleString()} document${
                  preview.eligible_count === 1 ? "" : "s"
                } will be generated`}
          </div>
          {!zero && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {preview.distinct_tenants} client
              {preview.distinct_tenants === 1 ? "" : "s"} ·{" "}
              {preview.distinct_packages} package
              {preview.distinct_packages === 1 ? "" : "s"} ·{" "}
              {preview.distinct_stages} stage
              {preview.distinct_stages === 1 ? "" : "s"} ·{" "}
              {preview.distinct_documents} document
              {preview.distinct_documents === 1 ? "" : "s"}
            </div>
          )}
        </div>
      </div>

      {!zero && preview.distinct_tenants > 0 && (
        <div className="text-xs pt-2 border-t">
          {preview.needs_provisioning_tenants === 0 ? (
            <span className="text-emerald-700 dark:text-emerald-400">
              All {preview.distinct_tenants} selected client
              {preview.distinct_tenants === 1 ? "" : "s"} fully provisioned in
              SharePoint.
            </span>
          ) : (
            <div className="space-y-1">
              <div className="text-slate-700 dark:text-slate-300">
                {preview.fully_provisioned_tenants} of{" "}
                {preview.distinct_tenants} selected client
                {preview.distinct_tenants === 1 ? "" : "s"} fully provisioned —{" "}
                <span className="font-medium">
                  {preview.needs_provisioning_tenants}
                </span>{" "}
                will be auto-provisioned during the run.
              </div>
              {(preview.missing_shared_tenants > 0 ||
                preview.missing_governance_tenants > 0) && (
                <div className="text-muted-foreground">
                  Missing shared folder: {preview.missing_shared_tenants} ·
                  Missing governance folder:{" "}
                  {preview.missing_governance_tenants}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {stale && (
        <div className="text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5" />
          Filters changed — re-run Preview to refresh.
        </div>
      )}
    </div>
  );
}

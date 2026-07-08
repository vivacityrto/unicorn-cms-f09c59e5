import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  Search,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";


import { SharePointFolderDialog } from "@/components/client/SharePointFolderDialog";
import { useBulkGenerateClientTree, type ClientTreeRow } from "../useBulkGenerateClientTree";
import { useTenantSharepointLiveness, type TenantLiveness } from "../useTenantSharepointLiveness";
import { useTemplatedDocuments } from "../useTemplatedDocuments";
import { MultiSelect } from "../MultiSelect";
import { PreviewPanel } from "../PreviewPanel";
import {
  launcherPreviewTargeted,
  launcherCreateTargeted,
  type PreviewRow,
} from "../useBulkGenerateLauncher";

type Tenant = { id: number; name: string | null; rto_name: string | null };

interface Props {
  tenants: Tenant[];
}

/** stageKey combines package_instance + stage for uniqueness inside a tenant. */
function tripleKey(tenantId: number, pkgInstanceId: number, stageId: number) {
  return `${tenantId}|${pkgInstanceId}|${stageId}`;
}

export function TargetedMode({ tenants }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const tenantIds = useMemo(() => tenants.map((t) => t.id), [tenants]);

  const tree = useBulkGenerateClientTree(tenantIds);
  const liveness = useTenantSharepointLiveness(tenantIds);

  const [search, setSearch] = useState("");
  const [selectedTenants, setSelectedTenants] = useState<Set<number>>(new Set());
  // triple key = tenant|pkgInstance|stage
  const [selectedTriples, setSelectedTriples] = useState<Set<string>>(new Set());
  const [documentIds, setDocumentIds] = useState<number[]>([]);
  const [remediateTenantId, setRemediateTenantId] = useState<number | null>(null);

  const [preview, setPreview] = useState<PreviewRow | null>(null);
  const [previewStale, setPreviewStale] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Group tree rows by tenant.
  const byTenant = useMemo(() => {
    const map = new Map<number, ClientTreeRow[]>();
    for (const row of tree.data ?? []) {
      const arr = map.get(row.tenant_id) ?? [];
      arr.push(row);
      map.set(row.tenant_id, arr);
    }
    return map;
  }, [tree.data]);

  // Only tenants that have at least one templated stage.
  const eligibleTenants = useMemo(
    () => tenants.filter((t) => (byTenant.get(t.id)?.length ?? 0) > 0),
    [tenants, byTenant],
  );

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eligibleTenants;
    return eligibleTenants.filter(
      (t) =>
        (t.name ?? "").toLowerCase().includes(q) ||
        (t.rto_name ?? "").toLowerCase().includes(q),
    );
  }, [eligibleTenants, search]);

  // Derive available stage IDs from selected triples for the doc picker.
  const selectedStageIds = useMemo(() => {
    const s = new Set<number>();
    for (const key of selectedTriples) {
      const parts = key.split("|");
      s.add(Number(parts[2]));
    }
    return Array.from(s);
  }, [selectedTriples]);

  const docs = useTemplatedDocuments(selectedStageIds);

  // Filter documentIds to those still in scope when stage selection changes.
  const availableDocIds = useMemo(
    () => new Set((docs.data ?? []).map((d) => d.id)),
    [docs.data],
  );
  const validDocumentIds = useMemo(
    () => documentIds.filter((id) => availableDocIds.has(id)),
    [documentIds, availableDocIds],
  );

  const toggleTenant = (tenantId: number, checked: boolean) => {
    setPreviewStale(true);
    setSelectedTenants((prev) => {
      const next = new Set(prev);
      if (checked) next.add(tenantId);
      else next.delete(tenantId);
      return next;
    });
    setSelectedTriples((prev) => {
      const next = new Set(prev);
      const rows = byTenant.get(tenantId) ?? [];
      for (const r of rows) {
        const k = tripleKey(tenantId, r.package_instance_id, r.stage_id);
        if (checked) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  };

  const toggleTriple = (
    tenantId: number,
    pkgInstanceId: number,
    stageId: number,
    checked: boolean,
  ) => {
    setPreviewStale(true);
    setSelectedTriples((prev) => {
      const next = new Set(prev);
      const k = tripleKey(tenantId, pkgInstanceId, stageId);
      if (checked) next.add(k);
      else next.delete(k);
      return next;
    });
    // Keep tenant checkbox in sync with any-child-selected.
    setSelectedTenants((prev) => {
      const next = new Set(prev);
      const anyChild = (byTenant.get(tenantId) ?? []).some((r) =>
        selectedTriples.has(tripleKey(tenantId, r.package_instance_id, r.stage_id)),
      );
      if (checked) next.add(tenantId);
      else if (!anyChild) next.delete(tenantId);
      return next;
    });
  };

  /**
   * Build p_selections in the exact shape the RPC parses:
   *   [{ tenant_id, package_id, stage_ids: [<bigint>, ...] }, ...]
   *
   * The UI keys selection state on (tenant, package_instance, stage) so the
   * user can pick per-enrolment, but the RPC groups by catalog package_id —
   * so we resolve package_id per triple from the client tree and collapse
   * duplicates.
   */
  const buildSelectionsJson = () => {
    // Lookup: (tenantId, packageInstanceId, stageId) -> package_id
    const rowByTriple = new Map<string, ClientTreeRow>();
    for (const [tenantId, rows] of byTenant.entries()) {
      for (const r of rows) {
        rowByTriple.set(
          tripleKey(tenantId, r.package_instance_id, r.stage_id),
          r,
        );
      }
    }

    // Group by (tenant_id, package_id) with a Set of stage_ids for dedup.
    const groups = new Map<
      string,
      { tenant_id: number; package_id: number; stage_ids: Set<number> }
    >();
    for (const key of selectedTriples) {
      const row = rowByTriple.get(key);
      if (!row) continue; // triple no longer in tree (stale selection)
      const [t] = key.split("|").map(Number);
      const groupKey = `${t}|${row.package_id}`;
      let g = groups.get(groupKey);
      if (!g) {
        g = { tenant_id: t, package_id: row.package_id, stage_ids: new Set() };
        groups.set(groupKey, g);
      }
      g.stage_ids.add(row.stage_id);
    }

    return Array.from(groups.values()).map((g) => ({
      tenant_id: g.tenant_id,
      package_id: g.package_id,
      stage_ids: Array.from(g.stage_ids),
    }));
  };

  const runPreview = async () => {
    if (selectedTriples.size === 0) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const selections = buildSelectionsJson();
      const row = await launcherPreviewTargeted(
        selections,
        validDocumentIds.length > 0 ? validDocumentIds : null,
      );
      setPreview(row);
      setPreviewStale(false);
    } catch (e) {
      setPreviewError((e as Error).message);
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmCreate = async () => {
    if (selectedTriples.size === 0) return;
    setConfirming(true);
    try {
      const selections = buildSelectionsJson();
      const { job_id } = await launcherCreateTargeted(
        selections,
        validDocumentIds.length > 0 ? validDocumentIds : null,
      );
      toast({
        title: "Targeted bulk job started",
        description: "The job has been queued and is running.",
      });
      navigate(`/manage-documents/bulk-jobs/${job_id}`);
    } catch (e) {
      toast({
        title: "Could not start job",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setConfirming(false);
    }
  };

  const anySelection = selectedTriples.size > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_360px] gap-4">
      {/* Left — tenant list */}
      <div className="rounded-lg border bg-card flex flex-col min-h-[540px]">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Clients
              <span className="ml-1 text-muted-foreground font-normal">
                ({eligibleTenants.length})
              </span>
            </h3>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => {
                tree.refetch();
                liveness.refetch();
              }}
              disabled={tree.isFetching || liveness.isFetching}
              title="Refresh"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  (tree.isFetching || liveness.isFetching) && "animate-spin",
                )}
              />
            </Button>
          </div>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients…"
              className="pl-7 h-8 text-xs"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {tree.isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filteredTenants.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No eligible clients found.
            </div>
          ) : (
            <ul className="divide-y">
              {filteredTenants.map((t) => (
                <TenantRow
                  key={t.id}
                  tenant={t}
                  checked={selectedTenants.has(t.id)}
                  onToggle={(c) => toggleTenant(t.id, c)}
                  liveness={liveness.data?.get(t.id)}
                  livenessLoading={liveness.isLoading}
                  stageCount={byTenant.get(t.id)?.length ?? 0}
                  onFix={() => setRemediateTenantId(t.id)}
                />
              ))}
            </ul>
          )}
        </ScrollArea>
      </div>

      {/* Middle — package/stage tree of selected tenants */}
      <div className="rounded-lg border bg-card flex flex-col min-h-[540px]">
        <div className="p-3 border-b">
          <h3 className="text-sm font-semibold">
            Packages &amp; stages
            <span className="ml-1 text-muted-foreground font-normal">
              ({selectedTriples.size} selected)
            </span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Only packages/stages with templated documents appear here.
          </p>
        </div>
        <ScrollArea className="flex-1">
          {selectedTenants.size === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">
              Select one or more clients to see their eligible
              packages and stages.
            </div>
          ) : (
            <div className="p-3 space-y-4">
              {Array.from(selectedTenants).map((tenantId) => {
                const tenant = tenants.find((x) => x.id === tenantId);
                const rows = byTenant.get(tenantId) ?? [];
                // group by package_instance
                const byPkg = new Map<number, ClientTreeRow[]>();
                for (const r of rows) {
                  const arr = byPkg.get(r.package_instance_id) ?? [];
                  arr.push(r);
                  byPkg.set(r.package_instance_id, arr);
                }
                return (
                  <div key={tenantId} className="border rounded-md">
                    <div className="px-3 py-2 border-b bg-muted/40 text-sm font-medium">
                      {tenant?.name ?? `Tenant #${tenantId}`}
                    </div>
                    <div className="p-2 space-y-2">
                      {Array.from(byPkg.entries()).map(([pkgInstanceId, stages]) => (
                        <div key={pkgInstanceId} className="text-xs">
                          <div className="font-medium py-1 px-1 text-slate-700">
                            {stages[0].package_name}
                          </div>
                          <div className="pl-3 space-y-1">
                            {stages.map((s) => {
                              const k = tripleKey(
                                tenantId,
                                pkgInstanceId,
                                s.stage_id,
                              );
                              const isChecked = selectedTriples.has(k);
                              return (
                                <label
                                  key={k}
                                  className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 cursor-pointer"
                                >
                                  <Checkbox
                                    checked={isChecked}
                                    onCheckedChange={(c) =>
                                      toggleTriple(
                                        tenantId,
                                        pkgInstanceId,
                                        s.stage_id,
                                        !!c,
                                      )
                                    }
                                  />
                                  <span className="flex-1 truncate">
                                    {s.stage_name}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {s.templated_doc_count} doc
                                    {s.templated_doc_count === 1 ? "" : "s"}
                                  </Badge>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right — filter + preview + confirm */}
      <div className="rounded-lg border bg-card flex flex-col min-h-[540px]">
        <div className="p-3 border-b">
          <h3 className="text-sm font-semibold">Documents &amp; launch</h3>
        </div>
        <div className="p-3 space-y-4 flex-1">
          <div>
            <div className="text-xs font-medium mb-1">
              Document filter (optional)
            </div>
            <MultiSelect
              options={(docs.data ?? []).map((d) => ({
                value: String(d.id),
                label: d.title,
              }))}
              values={validDocumentIds.map(String)}
              onChange={(ids) => {
                setDocumentIds(ids.map(Number));
                setPreviewStale(true);
              }}
              placeholder={
                selectedStageIds.length === 0
                  ? "Select stages first…"
                  : docs.isLoading
                    ? "Loading documents…"
                    : "All templated documents in the selected stages"
              }
              searchPlaceholder="Search documents…"
              emptyText="No templated documents."
              disabled={selectedStageIds.length === 0 || docs.isLoading}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Leave empty to include every templated document in the selected
              stages.
            </p>
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium">Preview</div>
              <Button
                size="sm"
                variant="secondary"
                onClick={runPreview}
                disabled={!anySelection || previewLoading}
              >
                {previewLoading && (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                )}
                {preview ? "Refresh" : "Preview"}
              </Button>
            </div>
            <PreviewPanel
              preview={preview}
              stale={previewStale && !!preview}
              loading={previewLoading}
              error={previewError}
            />
          </div>
        </div>
        <div className="p-3 border-t">
          <Button
            className="w-full bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90"
            onClick={confirmCreate}
            disabled={
              !anySelection ||
              previewStale ||
              !preview ||
              preview.eligible_count === 0 ||
              confirming
            }
          >
            {confirming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Start targeted job
          </Button>
        </div>
      </div>

      {remediateTenantId !== null && (
        <SharePointFolderDialog
          open={remediateTenantId !== null}
          onOpenChange={(o) => {
            if (!o) {
              const id = remediateTenantId;
              setRemediateTenantId(null);
              // Liveness-only refetch — folder link changes can't affect
              // package/stage qualification.
              if (id !== null) liveness.refetch();
            }
          }}
          tenantId={remediateTenantId}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function TenantRow({
  tenant,
  checked,
  onToggle,
  liveness,
  livenessLoading,
  stageCount,
  onFix,
}: {
  tenant: Tenant;
  checked: boolean;
  onToggle: (c: boolean) => void;
  liveness: TenantLiveness | undefined;
  livenessLoading: boolean;
  stageCount: number;
  onFix: () => void;
}) {
  const needsFix =
    !!liveness &&
    (liveness.shared !== "ok" || liveness.governance !== "ok");

  return (
    <li className="px-3 py-2 flex items-center gap-2 hover:bg-muted/40">
      <Checkbox
        checked={checked}
        onCheckedChange={(c) => onToggle(!!c)}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">
          {tenant.name ?? tenant.rto_name ?? `Tenant #${tenant.id}`}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {stageCount} eligible stage{stageCount === 1 ? "" : "s"}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <LivenessBadges liveness={liveness} loading={livenessLoading} />
        {needsFix && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-amber-700"
            onClick={onFix}
            title="Fix SharePoint folder"
          >
            <Wrench className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}

function LivenessBadges({
  liveness,
  loading,
}: {
  liveness: TenantLiveness | undefined;
  loading: boolean;
}) {
  if (loading && !liveness) {
    return <Skeleton className="h-4 w-14" />;
  }
  if (!liveness) return null;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <FolderBadge label="Shared" state={liveness.shared} />
        <FolderBadge label="Gov" state={liveness.governance} />
      </div>
    </TooltipProvider>
  );
}

function FolderBadge({
  label,
  state,
}: {
  label: string;
  state: "ok" | "missing" | "unconfigured" | "error";
}) {
  const isOk = state === "ok";
  const tooltip =
    state === "ok"
      ? `${label} folder verified live in SharePoint.`
      : state === "missing"
        ? `${label} folder was provisioned but Graph returned not-found — needs remediation.`
        : state === "unconfigured"
          ? `${label} folder not configured yet — will be auto-provisioned during the run.`
          : `${label} folder check failed — see logs.`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0 border",
            isOk
              ? "bg-emerald-50 text-emerald-700 border-emerald-300"
              : state === "error"
                ? "bg-rose-50 text-rose-800 border-rose-300"
                : "bg-amber-50 text-amber-800 border-amber-300",
          )}
        >
          {isOk ? (
            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
          ) : (
            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
          )}
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ChevronDown,
  ChevronRight,
  Maximize2,
  Eye,
  FileText,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

import { SharePointFolderDialog } from "@/components/client/SharePointFolderDialog";
import { SharePointFolderConfig } from "@/components/client/SharePointFolderConfig";
import { useBulkGenerateClientTree, type ClientTreeRow } from "../useBulkGenerateClientTree";
import { useTenantSharepointLiveness, type TenantLiveness } from "../useTenantSharepointLiveness";
import { useTemplatedDocuments } from "../useTemplatedDocuments";
import { useCscAssignments } from "@/hooks/useCscAssignments";
import { DocumentFilterDialog } from "../DocumentFilterDialog";
import { PreviewPanel } from "../PreviewPanel";
import { DeliveryGuardPanel } from "../DeliveryGuardPanel";
import { useDocumentDeliveryGuards, type DeliveryGuardPair } from "@/hooks/useDocumentDeliveryGuards";
import {
  launcherPreviewTargeted,
  launcherCreateTargeted,
  type PreviewRow,
} from "../useBulkGenerateLauncher";

type Tenant = { id: number; name: string | null; rto_name: string | null };

interface Props {
  tenants: Tenant[];
}

type CscOption = {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  archived: boolean;
};

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
  const cscAssignments = useCscAssignments(tenantIds);

  const [search, setSearch] = useState("");
  const [cscFilter, setCscFilter] = useState<string>("all");
  const [selectedTenants, setSelectedTenants] = useState<Set<number>>(new Set());
  // triple key = tenant|pkgInstance|stage
  const [selectedTriples, setSelectedTriples] = useState<Set<string>>(new Set());
  const [documentIds, setDocumentIds] = useState<number[]>([]);
  const [documentFilterDialogOpen, setDocumentFilterDialogOpen] = useState(false);
  const [remediateTenantId, setRemediateTenantId] = useState<number | null>(null);
  const [viewConfigTenantId, setViewConfigTenantId] = useState<number | null>(null);
  const [showItemized, setShowItemized] = useState(false);
  const [itemizedModalOpen, setItemizedModalOpen] = useState(false);


  const [preview, setPreview] = useState<PreviewRow | null>(null);
  const [previewStale, setPreviewStale] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // CSC filter options
  const { data: cscOptions = [] } = useQuery({
    queryKey: ["bulk-generate", "csc-options"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CscOption[]> => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, staff_teams, staff_team, archived, disabled")
        .eq("disabled", false)
        .order("archived", { ascending: true })
        .order("first_name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((u) => {
          const inTeams = Array.isArray(u.staff_teams) && u.staff_teams.includes("client_success");
          const inTeam = u.staff_team === "client_success";
          return inTeams || inTeam;
        })
        .map((u) => ({
          user_uuid: u.user_uuid,
          first_name: u.first_name,
          last_name: u.last_name,
          archived: !!u.archived,
        }));
    },
  });

  // Middle-column anchor refs for click-to-scroll
  const tenantAnchorRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());


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
    const cscMap = cscAssignments.data ?? {};
    return eligibleTenants.filter((t) => {
      if (q) {
        const matchesSearch =
          (t.name ?? "").toLowerCase().includes(q) ||
          (t.rto_name ?? "").toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (cscFilter === "all") return true;
      const cscId = cscMap[t.id]?.csc_user_id ?? null;
      if (cscFilter === "unassigned") return !cscId;
      return cscId === cscFilter;
    });
  }, [eligibleTenants, search, cscFilter, cscAssignments.data]);

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

  // Docs grouped by every stage that scopes them. Documents shared with a
  // stage live in document_stage_links rather than documents.stage, so using
  // only the latter silently dropped them from the itemized preview and the
  // tailoring guard.
  const docsByStage = useMemo(() => {
    const map = new Map<number, { id: number; title: string }[]>();
    for (const d of docs.data ?? []) {
      for (const stageId of d.stageIds) {
        const arr = map.get(stageId) ?? [];
        arr.push({ id: d.id, title: d.title });
        map.set(stageId, arr);
      }
    }
    return map;
  }, [docs.data]);

  // Itemized rows: cartesian of selected triples × their eligible docs
  const itemizedRows = useMemo(() => {
    const rowByTriple = new Map<string, ClientTreeRow>();
    for (const [tenantId, rows] of byTenant.entries()) {
      for (const r of rows) {
        rowByTriple.set(tripleKey(tenantId, r.package_instance_id, r.stage_id), r);
      }
    }
    const docFilter = validDocumentIds.length > 0 ? new Set(validDocumentIds) : null;
    const out: {
      key: string;
      tenantName: string;
      packageName: string;
      stageName: string;
      docTitle: string;
    }[] = [];
    for (const key of selectedTriples) {
      const row = rowByTriple.get(key);
      if (!row) continue;
      const tenantName =
        tenants.find((t) => t.id === row.tenant_id)?.name ?? `Tenant #${row.tenant_id}`;
      const stageDocs = docsByStage.get(row.stage_id) ?? [];
      for (const d of stageDocs) {
        if (docFilter && !docFilter.has(d.id)) continue;
        out.push({
          key: `${key}|${d.id}`,
          tenantName,
          packageName: row.package_name,
          stageName: row.stage_name,
          docTitle: d.title,
        });
      }
    }
    return out;
  }, [selectedTriples, byTenant, docsByStage, validDocumentIds, tenants]);

  // Exact (tenant, document) pairs actually in scope — same traversal as
  // itemizedRows above, but numeric ids (deduped) for the guard check
  // instead of display strings.
  const guardPairs = useMemo<DeliveryGuardPair[]>(() => {
    const rowByTriple = new Map<string, ClientTreeRow>();
    for (const [tenantId, rows] of byTenant.entries()) {
      for (const r of rows) {
        rowByTriple.set(tripleKey(tenantId, r.package_instance_id, r.stage_id), r);
      }
    }
    const docFilter = validDocumentIds.length > 0 ? new Set(validDocumentIds) : null;
    const seen = new Set<string>();
    const out: DeliveryGuardPair[] = [];
    for (const key of selectedTriples) {
      const row = rowByTriple.get(key);
      if (!row) continue;
      const stageDocs = docsByStage.get(row.stage_id) ?? [];
      for (const d of stageDocs) {
        if (docFilter && !docFilter.has(d.id)) continue;
        const pairKey = `${row.tenant_id}:${d.id}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        out.push({ tenantId: row.tenant_id, documentId: d.id });
      }
    }
    return out;
  }, [selectedTriples, byTenant, docsByStage, validDocumentIds]);

  const guards = useDocumentDeliveryGuards(guardPairs);
  const [guardAcknowledged, setGuardAcknowledged] = useState(false);

  // Reset acknowledgement whenever the underlying selection changes.
  useEffect(() => {
    setGuardAcknowledged(false);
  }, [selectedTriples, validDocumentIds]);

  const tenantNames = useMemo(() => {
    const map: Record<number, string> = {};
    for (const t of tenants) {
      map[t.id] = t.name ?? t.rto_name ?? `Tenant #${t.id}`;
    }
    return map;
  }, [tenants]);

  const documentNames = useMemo(() => {
    const map: Record<number, string> = {};
    for (const d of docs.data ?? []) {
      map[d.id] = d.title;
    }
    return map;
  }, [docs.data]);

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

  const selectAllFilteredTenants = () => {
    setPreviewStale(true);
    setSelectedTenants((previous) => {
      const next = new Set(previous);
      for (const tenant of filteredTenants) next.add(tenant.id);
      return next;
    });
    setSelectedTriples((previous) => {
      const next = new Set(previous);
      for (const tenant of filteredTenants) {
        for (const row of byTenant.get(tenant.id) ?? []) {
          next.add(tripleKey(tenant.id, row.package_instance_id, row.stage_id));
        }
      }
      return next;
    });
  };

  const clearSelectedTenants = () => {
    setPreviewStale(true);
    setSelectedTenants(new Set());
    setSelectedTriples(new Set());
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

  const scrollToTenant = (tenantId: number) => {
    const el = tenantAnchorRefs.current.get(tenantId);
    if (el) {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  };

  // Reset itemized visibility whenever preview goes stale or clears.
  useEffect(() => {
    if (previewStale || !preview) setShowItemized(false);
  }, [previewStale, preview]);

  const buildSelectionsJson = () => {
    const rowByTriple = new Map<string, ClientTreeRow>();
    for (const [tenantId, rows] of byTenant.entries()) {
      for (const r of rows) {
        rowByTriple.set(
          tripleKey(tenantId, r.package_instance_id, r.stage_id),
          r,
        );
      }
    }

    const groups = new Map<
      string,
      { tenant_id: number; package_id: number; stage_ids: Set<number> }
    >();
    for (const key of selectedTriples) {
      const row = rowByTriple.get(key);
      if (!row) continue;
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
      // "Refresh" must re-read the sources that drive both the document list
      // and tailoring summary, not merely repeat the previous preview call.
      if (preview) {
        await Promise.all([
          tree.refetch(),
          docs.refetch(),
          liveness.refetch(),
          guards.refetch(),
        ]);
      }
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
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.8fr)] gap-4 h-full min-h-0">
      {/* Left — tenant list */}
      <div className="rounded-lg border bg-card flex flex-col min-h-0 overflow-hidden">
        <div className="p-3 border-b space-y-2 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Clients
              <span className="ml-1 text-muted-foreground font-normal">
                ({filteredTenants.length}/{eligibleTenants.length})
              </span>
            </h3>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => {
                tree.refetch();
                liveness.refetch();
                cscAssignments.refetch();
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
          <Select value={cscFilter} onValueChange={setCscFilter}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Filter by CSC" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All CSCs</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {cscOptions.map((c) => (
                <SelectItem key={c.user_uuid} value={c.user_uuid}>
                  {`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.user_uuid}
                  {c.archived ? " (archived)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={selectAllFilteredTenants}
              disabled={filteredTenants.length === 0}
            >
              Select all eligible ({filteredTenants.length})
            </Button>
            {selectedTenants.size > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={clearSelectedTenants}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">

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
                  onLabelClick={() => {
                    if (!selectedTenants.has(t.id)) {
                      toggleTenant(t.id, true);
                    }
                    // Defer scroll to allow the section to render if newly added.
                    requestAnimationFrame(() => scrollToTenant(t.id));
                  }}
                  liveness={liveness.data?.get(t.id)}
                  livenessLoading={liveness.isLoading}
                  stageCount={byTenant.get(t.id)?.length ?? 0}
                  onFix={() => setRemediateTenantId(t.id)}
                  onViewConfig={() => setViewConfigTenantId(t.id)}
                />
              ))}
            </ul>
          )}
        </div>

      </div>

      {/* Middle — package/stage tree of selected tenants */}
      <div className="rounded-lg border bg-card flex flex-col min-h-0 overflow-hidden">
        <div className="p-3 border-b shrink-0">
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
        <ScrollArea className="flex-1 min-h-0">
          {selectedTenants.size === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">
              Select one or more clients to see their eligible packages and stages.
            </div>
          ) : (
            <div className="p-3 space-y-4">
              {Array.from(selectedTenants).map((tenantId) => {
                const tenant = tenants.find((x) => x.id === tenantId);
                const rows = byTenant.get(tenantId) ?? [];
                const byPkg = new Map<number, ClientTreeRow[]>();
                for (const r of rows) {
                  const arr = byPkg.get(r.package_instance_id) ?? [];
                  arr.push(r);
                  byPkg.set(r.package_instance_id, arr);
                }
                return (
                  <div
                    key={tenantId}
                    ref={(el) => {
                      tenantAnchorRefs.current.set(tenantId, el);
                    }}
                    className="border rounded-md scroll-mt-2"
                  >
                    <div className="px-3 py-2 border-b bg-muted/40 text-sm font-medium">
                      {tenant?.name ?? `Tenant #${tenantId}`}
                    </div>
                    <div className="p-2 space-y-2">
                      {Array.from(byPkg.entries()).map(([pkgInstanceId, stages]) => (
                        <div key={pkgInstanceId} className="text-xs min-w-0">
                          <div className="font-medium py-1 px-1 text-slate-700 truncate" title={stages[0].package_name}>
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
      <div className="rounded-lg border bg-card flex flex-col min-h-0 overflow-hidden">
        <div className="p-3 border-b shrink-0">
          <h3 className="text-sm font-semibold">Documents &amp; launch</h3>
        </div>
        <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">

          <div className="p-3 space-y-4">
            <div>
              <div className="text-xs font-medium mb-1">
                Document filter (optional)
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDocumentFilterDialogOpen(true)}
                disabled={selectedStageIds.length === 0 || docs.isLoading}
                className={cn(
                  "w-full justify-between font-normal min-h-10 h-auto py-2",
                  validDocumentIds.length === 0 && "text-muted-foreground",
                )}
              >
                <span className="truncate">
                  {selectedStageIds.length === 0
                    ? "Select stages first…"
                    : docs.isLoading
                      ? "Loading documents…"
                      : validDocumentIds.length === 0
                        ? "All templated documents in the selected stages"
                        : `${validDocumentIds.length} document${validDocumentIds.length === 1 ? "" : "s"} selected`}
                </span>
                <FileText className="h-4 w-4 shrink-0 opacity-50 ml-2" />
              </Button>
              <p className="text-[11px] text-muted-foreground mt-1">
                Leave empty to include every templated document in the selected
                stages.
              </p>
              <DocumentFilterDialog
                open={documentFilterDialogOpen}
                onOpenChange={setDocumentFilterDialogOpen}
                documents={docs.data ?? []}
                selected={validDocumentIds.map(String)}
                onApply={(ids) => {
                  setDocumentIds(ids.map(Number));
                  setPreviewStale(true);
                }}
              />
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

              {preview && !previewStale && (
                <div className="mt-3">
                  <DeliveryGuardPanel
                    active={guards.active}
                    isLoading={guards.isLoading}
                    summary={guards.summary}
                    hasBlockingIssues={guards.hasBlockingIssues}
                    acknowledged={guardAcknowledged}
                    onAcknowledgedChange={setGuardAcknowledged}
                    tenantIssues={guards.tenantIssues}
                    tenantNames={tenantNames}
                    pairStatuses={guards.pairStatuses}
                    documentNames={documentNames}
                  />
                </div>
              )}

              {preview && !previewStale && itemizedRows.length > 0 && (
                <div className="mt-3 border rounded-md">
                  <div className="w-full flex items-center gap-1 pr-1 text-xs font-medium hover:bg-muted/50">
                    <button
                      type="button"
                      onClick={() => setShowItemized((s) => !s)}
                      className="flex-1 min-w-0 flex items-center justify-between px-2 py-1.5 text-left"
                    >
                      <span className="flex items-center gap-1">
                        {showItemized ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        Show items ({itemizedRows.length})
                      </span>
                      <span className="text-muted-foreground font-normal truncate ml-2">
                        client · package · stage · doc
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemizedModalOpen(true)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                      title="Expand to full view"
                      aria-label="Expand items"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {showItemized && (
                    <div className="max-h-64 overflow-auto border-t">
                      <table className="w-full text-[11px] table-fixed border-separate border-spacing-0">
                        <colgroup>
                          <col style={{ width: "25%" }} />
                          <col style={{ width: "25%" }} />
                          <col style={{ width: "22%" }} />
                          <col style={{ width: "28%" }} />
                        </colgroup>
                        <thead className="sticky top-0 z-10">
                          <tr className="text-left bg-muted">
                            <th className="px-2 py-1 font-medium border-b">Client</th>
                            <th className="px-2 py-1 font-medium border-b">Package</th>
                            <th className="px-2 py-1 font-medium border-b">Stage</th>
                            <th className="px-2 py-1 font-medium border-b">Document</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itemizedRows.map((r) => (
                            <tr key={r.key}>
                              <td className="px-2 py-1 truncate border-b" title={r.tenantName}>{r.tenantName}</td>
                              <td className="px-2 py-1 truncate border-b" title={r.packageName}>{r.packageName}</td>
                              <td className="px-2 py-1 truncate border-b" title={r.stageName}>{r.stageName}</td>
                              <td className="px-2 py-1 truncate border-b" title={r.docTitle}>{r.docTitle}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <Dialog open={itemizedModalOpen} onOpenChange={setItemizedModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>
                Preview items
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({itemizedRows.length} document{itemizedRows.length === 1 ? "" : "s"})
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-auto border rounded-md">
              <table className="w-full text-xs border-separate border-spacing-0">
                <thead className="sticky top-0 z-10">
                  <tr className="text-left bg-muted">
                    <th className="px-3 py-2 font-medium border-b">Client</th>
                    <th className="px-3 py-2 font-medium border-b">Package</th>
                    <th className="px-3 py-2 font-medium border-b">Stage</th>
                    <th className="px-3 py-2 font-medium border-b">Document</th>
                  </tr>
                </thead>
                <tbody>
                  {itemizedRows.map((r) => (
                    <tr key={r.key} className="hover:bg-muted/40">
                      <td className="px-3 py-2 border-b">{r.tenantName}</td>
                      <td className="px-3 py-2 border-b">{r.packageName}</td>
                      <td className="px-3 py-2 border-b">{r.stageName}</td>
                      <td className="px-3 py-2 border-b">{r.docTitle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>


        <div className="p-3 border-t shrink-0">
          <Button
            className="w-full bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90"
            onClick={confirmCreate}
            disabled={
              !anySelection ||
              previewStale ||
              !preview ||
              preview.eligible_count === 0 ||
              confirming ||
              (guards.hasBlockingIssues && !guardAcknowledged)
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
              if (id !== null) liveness.refetch();
            }
          }}
          tenantId={remediateTenantId}
        />
      )}

      {viewConfigTenantId !== null && (
        <SharePointConfigViewDialog
          tenantId={viewConfigTenantId}
          onOpenChange={(o) => {
            if (!o) {
              setViewConfigTenantId(null);
              liveness.refetch();
            }
          }}
        />
      )}
    </div>
  );
}

function SharePointConfigViewDialog({
  tenantId,
  onOpenChange,
}: {
  tenantId: number | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={tenantId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>SharePoint Configuration</DialogTitle>
        </DialogHeader>
        {tenantId !== null && <SharePointFolderConfig tenantId={tenantId} />}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function TenantRow({
  tenant,
  checked,
  onToggle,
  onLabelClick,
  liveness,
  livenessLoading,
  stageCount,
  onFix,
  onViewConfig,
}: {
  tenant: Tenant;
  checked: boolean;
  onToggle: (c: boolean) => void;
  onLabelClick: () => void;
  liveness: TenantLiveness | undefined;
  livenessLoading: boolean;
  stageCount: number;
  onFix: () => void;
  onViewConfig: () => void;
}) {
  const needsFix =
    !!liveness &&
    (liveness.shared !== "ok" || liveness.governance !== "ok");

  return (
    <li className="px-3 py-2 flex items-start gap-2 hover:bg-muted/40 min-w-0">
      <Checkbox
        checked={checked}
        onCheckedChange={(c) => onToggle(!!c)}
        className="mt-0.5 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={onLabelClick}
          className="w-full min-w-0 text-left block"
        >
          <div className="text-sm truncate">
            {tenant.name ?? tenant.rto_name ?? `Tenant #${tenant.id}`}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {stageCount} eligible stage{stageCount === 1 ? "" : "s"}
          </div>
        </button>
        <div className="flex items-center flex-wrap gap-1 mt-1">
          <LivenessBadges liveness={liveness} loading={livenessLoading} />
          {needsFix && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px] text-amber-800 border-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-800 dark:hover:bg-amber-950/40"
              onClick={onFix}
              title="Fix SharePoint folder"
            >
              <Wrench className="h-3 w-3 mr-1" />
              Fix folder
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            onClick={onViewConfig}
            title="View SharePoint configuration"
          >
            <Eye className="h-3 w-3 mr-1" />
            View config
          </Button>
        </div>
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
    return <Skeleton className="h-6 w-14" />;
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
            "h-6 px-2 text-[11px] border inline-flex items-center",
            isOk
              ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
              : state === "error"
                ? "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
                : "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
          )}
        >
          {isOk ? (
            <CheckCircle2 className="h-3 w-3 mr-1" />
          ) : (
            <AlertTriangle className="h-3 w-3 mr-1" />
          )}
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { ScopeStep, type ScopeValue } from "./steps/ScopeStep";
import { PackageFilterStep } from "./steps/PackageFilterStep";
import { StageDocFilterStep } from "./steps/StageDocFilterStep";
import { PreviewPanel } from "./PreviewPanel";
import { DeliveryGuardPanel } from "./DeliveryGuardPanel";
import {
  launcherCreate,
  launcherPreview,
  type PreviewRow,
} from "./useBulkGenerateLauncher";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentDeliveryGuards, type DeliveryGuardPair } from "@/hooks/useDocumentDeliveryGuards";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_SCOPE: ScopeValue = { scope: "all", tenant_ids: [] };

export function BulkGenerateDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [scope, setScope] = useState<ScopeValue>(DEFAULT_SCOPE);
  const [packageIds, setPackageIds] = useState<number[]>([]);
  const [stageIds, setStageIds] = useState<number[]>([]);
  const [documentIds, setDocumentIds] = useState<number[]>([]);

  const [preview, setPreview] = useState<PreviewRow | null>(null);
  const [previewStale, setPreviewStale] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [guardAcknowledged, setGuardAcknowledged] = useState(false);

  // Reset state on close.
  useEffect(() => {
    if (!open) {
      setScope(DEFAULT_SCOPE);
      setPackageIds([]);
      setStageIds([]);
      setDocumentIds([]);
      setPreview(null);
      setPreviewStale(true);
      setPreviewLoading(false);
      setPreviewError(null);
      setConfirming(false);
      setGuardAcknowledged(false);
    }
  }, [open]);

  // All active, non-system tenant ids — only needed for the guard check when
  // scope is "all" (explicit tenant_ids already cover the "selected" case).
  const { data: allActiveTenantIds } = useQuery({
    queryKey: ["bulk-generate-guard-all-tenant-ids"],
    enabled: open && scope.scope === "all" && documentIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id")
        .eq("status", "active")
        .eq("is_system_tenant", false);
      return (data ?? []).map((t) => t.id as number);
    },
  });

  // Reset acknowledgement whenever the scope changes underneath it — an
  // acknowledgement for one set of clients/documents shouldn't silently
  // carry over to a different selection.
  useEffect(() => {
    setGuardAcknowledged(false);
  }, [scope.scope, scope.tenant_ids, documentIds]);

  const tenantIdsForGuard = useMemo(() => {
    if (documentIds.length === 0) return [];
    return scope.scope === "selected" ? scope.tenant_ids : allActiveTenantIds ?? [];
  }, [documentIds.length, scope.scope, scope.tenant_ids, allActiveTenantIds]);

  const guardPairs = useMemo<DeliveryGuardPair[]>(() => {
    if (tenantIdsForGuard.length === 0) return [];
    const out: DeliveryGuardPair[] = [];
    for (const tenantId of tenantIdsForGuard) {
      for (const documentId of documentIds) {
        out.push({ tenantId, documentId });
      }
    }
    return out;
  }, [documentIds, tenantIdsForGuard]);

  const guards = useDocumentDeliveryGuards(guardPairs, open);

  // Names for the guard panel's "which clients" breakdown — fetched by id so
  // it works whether scope is "all" or "selected".
  const { data: guardTenantNames } = useQuery({
    queryKey: ["bulk-generate-guard-tenant-names", tenantIdsForGuard],
    enabled: open && tenantIdsForGuard.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id, name, rto_name")
        .in("id", tenantIdsForGuard);
      const map: Record<number, string> = {};
      for (const t of data ?? []) {
        map[t.id] = t.name ?? t.rto_name ?? `Tenant #${t.id}`;
      }
      return map;
    },
  });

  const { data: guardDocumentNames } = useQuery({
    queryKey: ["bulk-generate-guard-document-names", documentIds],
    enabled: open && documentIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, title")
        .in("id", documentIds);
      const map: Record<number, string> = {};
      for (const d of data ?? []) {
        map[d.id] = d.title;
      }
      return map;
    },
  });

  // Any filter change marks preview stale.
  useEffect(() => {
    setPreviewStale(true);
  }, [scope.scope, scope.tenant_ids, packageIds, stageIds, documentIds]);

  // If stage filter changes such that a picked doc no longer belongs, drop it.
  // (StageDocFilterStep controls the option list; here we just trust the user
  // — soft cleanup: keep as-is, the RPC will enforce eligibility.)

  const filters = useMemo(
    () => ({
      scope: scope.scope,
      tenant_ids:
        scope.scope === "selected" && scope.tenant_ids.length > 0
          ? scope.tenant_ids
          : null,
      package_ids: packageIds.length > 0 ? packageIds : null,
      stage_ids: stageIds.length > 0 ? stageIds : null,
      document_ids: documentIds.length > 0 ? documentIds : null,
    }),
    [scope, packageIds, stageIds, documentIds],
  );

  const canPreview =
    !previewLoading &&
    (scope.scope === "all" ||
      (scope.scope === "selected" && scope.tenant_ids.length > 0));

  const canConfirm =
    !confirming &&
    !previewStale &&
    !!preview &&
    preview.eligible_count > 0 &&
    (!guards.hasBlockingIssues || guardAcknowledged);

  const runPreview = async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const row = await launcherPreview(filters);
      setPreview(row ?? null);
      setPreviewStale(false);
    } catch (e) {
      setPreviewError((e as Error).message);
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmCreate = async () => {
    setConfirming(true);
    try {
      const { job_id } = await launcherCreate(filters);
      toast({
        title: "Bulk generation started",
        description: "The job has been queued and is running.",
      });
      onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[3px] border-[#dfdfdf] flex flex-col max-h-[90vh] max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk generate documents</DialogTitle>
          <DialogDescription>
            Select scope and filters. All four filters are optional and
            combinable. Preview the eligible count before confirming.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-2 pr-1">
          <section>
            <h3 className="text-sm font-semibold mb-2">1. Clients</h3>
            <ScopeStep value={scope} onChange={setScope} />
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">2. Package filter</h3>
            <PackageFilterStep
              values={packageIds}
              onChange={setPackageIds}
            />
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">
              3. Stage &amp; document filter
            </h3>
            <StageDocFilterStep
              stageIds={stageIds}
              documentIds={documentIds}
              onChangeStages={setStageIds}
              onChangeDocuments={setDocumentIds}
            />
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Preview</h3>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={runPreview}
                disabled={!canPreview}
              >
                {previewLoading && (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                )}
                {preview ? "Refresh preview" : "Preview"}
              </Button>
            </div>
            <PreviewPanel
              preview={preview}
              stale={previewStale && !!preview}
              loading={previewLoading}
              error={previewError}
            />
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">Tailoring &amp; TGA snapshot check</h3>
            <DeliveryGuardPanel
              active={guards.active}
              isLoading={guards.isLoading}
              summary={guards.summary}
              hasBlockingIssues={guards.hasBlockingIssues}
              acknowledged={guardAcknowledged}
              onAcknowledgedChange={setGuardAcknowledged}
              inactiveHint={
                documentIds.length === 0
                  ? "Narrow the document filter above to check tailoring completeness and TGA snapshot status before launching."
                  : undefined
              }
              tenantIssues={guards.tenantIssues}
              tenantNames={guardTenantNames}
              pairStatuses={guards.pairStatuses}
              documentNames={guardDocumentNames}
            />
          </section>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmCreate}
            disabled={!canConfirm}
            className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90"
          >
            {confirming && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Confirm &amp; start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

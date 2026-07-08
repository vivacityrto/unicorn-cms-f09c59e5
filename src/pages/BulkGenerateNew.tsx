import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccess } from "@/hooks/useUserAccess";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { ScopeStep, type ScopeValue } from "@/components/documents/bulk-generate/steps/ScopeStep";
import { PackageFilterStep } from "@/components/documents/bulk-generate/steps/PackageFilterStep";
import { StageDocFilterStep } from "@/components/documents/bulk-generate/steps/StageDocFilterStep";
import { PreviewPanel } from "@/components/documents/bulk-generate/PreviewPanel";
import {
  launcherCreate,
  launcherPreview,
  type PreviewRow,
} from "@/components/documents/bulk-generate/useBulkGenerateLauncher";
import { TargetedMode } from "@/components/documents/bulk-generate/targeted/TargetedMode";

type ActiveTenant = { id: number; name: string | null; rto_name: string | null };

const DEFAULT_SCOPE: ScopeValue = { scope: "all", tenant_ids: [] };

export default function BulkGenerateNew() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isVivacityStaff, isLoading: accessLoading } = useUserAccess();
  const [mode, setMode] = useState<"all" | "targeted">("all");

  // ------- All-clients (simple) path — byte-identical to shipped launcher.
  const [scope, setScope] = useState<ScopeValue>(DEFAULT_SCOPE);
  const [packageIds, setPackageIds] = useState<number[]>([]);
  const [stageIds, setStageIds] = useState<number[]>([]);
  const [documentIds, setDocumentIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<PreviewRow | null>(null);
  const [previewStale, setPreviewStale] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setPreviewStale(true);
  }, [scope.scope, scope.tenant_ids, packageIds, stageIds, documentIds]);

  const simpleFilters = useMemo(
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
    !confirming && !previewStale && !!preview && preview.eligible_count > 0;

  const runPreview = async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const row = await launcherPreview(simpleFilters);
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
      const { job_id } = await launcherCreate(simpleFilters);
      toast({
        title: "Bulk generation started",
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

  // ------- Active tenants (shared with targeted mode).
  const { data: activeTenants = [] } = useQuery({
    queryKey: ["bulk-generate", "active-tenants-page"],
    enabled: isVivacityStaff,
    staleTime: 60_000,
    queryFn: async (): Promise<ActiveTenant[]> => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, rto_name, status, is_system_tenant")
        .eq("status", "active")
        .eq("is_system_tenant", false)
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as ActiveTenant[]).filter(
        (t) => !/^test/i.test(t.name ?? ""),
      );
    },
  });

  if (accessLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
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
          <Button asChild variant="ghost" size="sm">
            <Link to="/manage-documents">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to documents
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Bulk generate documents</h1>
            <p className="text-sm text-muted-foreground">
              Generate templated documents across clients, packages, and stages.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/manage-documents/bulk-jobs">View job history</Link>
        </Button>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as "all" | "targeted")}>
        <TabsList>
          <TabsTrigger value="all">All clients (simple)</TabsTrigger>
          <TabsTrigger value="targeted">Targeted (mission control)</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <div className="rounded-lg border bg-card p-6 space-y-6 max-w-4xl">
            <section>
              <h3 className="text-sm font-semibold mb-2">1. Clients</h3>
              <ScopeStep value={scope} onChange={setScope} />
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2">2. Package filter</h3>
              <PackageFilterStep values={packageIds} onChange={setPackageIds} />
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

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => navigate("/manage-documents")}
                disabled={confirming}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmCreate}
                disabled={!canConfirm}
                className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90"
              >
                {confirming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm &amp; start
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="targeted" className="mt-4">
          <TargetedMode tenants={activeTenants} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

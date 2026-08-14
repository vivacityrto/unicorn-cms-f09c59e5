import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface BulkGenerationProgress {
  total: number;
  generated: number;
  skipped: number;
  failed: number;
}

interface BulkGenerateParams {
  tenantId: number;
  stageInstanceId: number;
  packageId?: number;
  mode?: 'all' | 'pending_only' | 'overwrite_all';
  /** Suppress the "Nothing generated" toast so the caller can prompt instead. */
  silentEmpty?: boolean;
}

export type BulkResultReason =
  | 'unsupported_format'
  | 'no_template'
  | 'already_generated'
  | 'tailoring_incomplete'
  | 'locked'
  | 'delivery_failed'
  | 'no_published_version'
  | 'delivered'
  | 'cancelled';

export type LiveStatus = 'pending' | 'generating' | 'generated' | 'skipped' | 'failed';

export interface BulkResult {
  document_instance_id: number;
  document_id: number;
  document_title: string;
  status: 'generated' | 'skipped' | 'failed';
  reason: BulkResultReason;
  error?: string;
}

export interface LiveResult {
  document_instance_id: number;
  document_id: number;
  document_title: string;
  document_version_id?: string;
  status: LiveStatus;
  reason?: BulkResultReason;
  error?: string;
}

interface PlanItem {
  document_instance_id: number;
  document_id: number;
  document_version_id: string;
  document_title: string;
}

interface PlanResponse {
  success: boolean;
  plan: PlanItem[];
  total_eligible: number;
  skipped: BulkResult[];
  error?: string;
  error_code?: string;
}

const REASON_LABEL: Record<BulkResultReason, string> = {
  unsupported_format: 'unsupported format',
  no_template: 'no template allocated',
  already_generated: 'already generated',
  tailoring_incomplete: 'tailoring incomplete',
  locked: 'locked in SharePoint',
  delivery_failed: 'delivery failed',
  no_published_version: 'no published version',
  delivered: 'delivered',
  cancelled: 'cancelled by user',
};

function dominantReason(results: BulkResult[], status: BulkResult['status']): string | null {
  const counts = new Map<BulkResultReason, number>();
  for (const r of results) {
    if (r.status !== status) continue;
    counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const [reason, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return `${n} ${REASON_LABEL[reason]}`;
}

const ERROR_CODE_MESSAGES: Record<string, { title: string; description: string }> = {
  GOVERNANCE_FOLDER_MISSING: {
    title: 'Governance Folder Not Configured',
    description: 'No governance folder is configured for this client. Go to Admin → Integrations → SharePoint to set one up before generating.',
  },
  SHARED_FOLDER_MISSING: {
    title: 'Shared Folder Not Configured',
    description: 'No shared folder is configured for this client. Go to Admin → Integrations → SharePoint to set one up before generating.',
  },
  RATE_LIMITED: {
    title: 'Rate Limited',
    description: 'A bulk generation was run for this client in the last 5 minutes. Please wait before trying again.',
  },
};


function tally(items: LiveResult[]): BulkGenerationProgress {
  let generated = 0, skipped = 0, failed = 0;
  for (const r of items) {
    if (r.status === 'generated') generated++;
    else if (r.status === 'skipped') skipped++;
    else if (r.status === 'failed') failed++;
  }
  return { total: items.length, generated, skipped, failed };
}

export function useBulkGeneration() {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<BulkGenerationProgress | null>(null);
  const [liveResults, setLiveResults] = useState<LiveResult[]>([]);
  const [currentDoc, setCurrentDoc] = useState<string | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [planSize, setPlanSize] = useState(0);
  const cancelledRef = useRef(false);


  const cancelGeneration = () => {
    cancelledRef.current = true;
  };
  const bulkGenerate = async ({ tenantId, stageInstanceId, packageId, mode = 'pending_only', silentEmpty = false }: BulkGenerateParams) => {
    setGenerating(true);
    setProgress(null);
    setLiveResults([]);
    setCurrentDoc(null);
    setCompletedCount(0);
    setPlanSize(0);
    cancelledRef.current = false;


    // Build the final summary outside the try so finally can audit
    let finalResults: BulkResult[] = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // ── Phase 1: PLAN ───────────────────────────────────────────────
      const planResp = await supabase.functions.invoke('bulk-generate-phase-documents', {
        body: {
          tenant_id: tenantId,
          stageinstance_id: stageInstanceId,
          package_id: packageId,
          mode,
          plan_only: true,
        },
      });

      if (planResp.error) {
        let errorCode: string | undefined;
        let errorMessage: string | undefined;
        try {
          const errorBody = await (planResp.error as any).context?.json?.();
          errorCode = errorBody?.error_code;
          errorMessage = errorBody?.error;
        } catch { /* ignore parse errors */ }

        const mapped = errorCode ? ERROR_CODE_MESSAGES[errorCode] : undefined;
        if (mapped) {
          toast({ title: mapped.title, description: mapped.description, variant: 'destructive' });
          return null;
        }
        throw new Error(errorMessage || planResp.error.message || 'Planning failed');
      }



      const planData = planResp.data as PlanResponse;
      if (!planData?.success) throw new Error(planData?.error || 'Planning failed');

      const plan = planData.plan ?? [];
      const skippedFromPlan = planData.skipped ?? [];
      setPlanSize(plan.length);

      // One batch id per run so the client-visible timeline event for each
      // document delivered in this run can be grouped into a single burst
      // entry (same mechanism the bulk-generate job engine uses via its real
      // job id — this flow has no job row, so it generates its own).
      const batchId = plan.length > 1 ? crypto.randomUUID() : null;


      // Seed liveResults: planned (pending) first, then already-skipped at the end
      const seed: LiveResult[] = [
        ...plan.map<LiveResult>(p => ({
          document_instance_id: p.document_instance_id,
          document_id: p.document_id,
          document_version_id: p.document_version_id,
          document_title: p.document_title,
          status: 'pending',
        })),
        ...skippedFromPlan.map<LiveResult>(s => ({
          document_instance_id: s.document_instance_id,
          document_id: s.document_id,
          document_title: s.document_title,
          status: 'skipped',
          reason: s.reason,
          error: s.error,
        })),
      ];
      setLiveResults(seed);
      setProgress(tally(seed));

      // ── Phase 2: EXECUTE per-doc ────────────────────────────────────
      const working: LiveResult[] = [...seed];

      for (let i = 0; i < plan.length; i++) {
        const item = plan[i];
        if (cancelledRef.current) break;

        // mark generating
        const idx = working.findIndex(r => r.document_instance_id === item.document_instance_id && r.status === 'pending');
        if (idx === -1) continue;
        working[idx] = { ...working[idx], status: 'generating' };
        setLiveResults([...working]);
        setCurrentDoc(item.document_title);

        let outcome: LiveResult = working[idx];
        try {
          const resp = await supabase.functions.invoke('deliver-governance-document', {
            body: {
              tenant_id: tenantId,
              document_version_id: item.document_version_id,
              allow_incomplete: true,
              force: mode === 'overwrite_all',
              batch_id: batchId ?? undefined,
            },
          });

          const bodyData = resp.data as {
            success?: boolean;
            skipped?: boolean;
            error?: string;
            error_code?: string;
            tailoring?: unknown;
          } | null;

          if (resp.error) {
            let respErrorCode: string | undefined;
            let respErrorBody: { error?: string; error_code?: string; tailoring?: unknown } | undefined;
            try {
              respErrorBody = await (resp.error as any).context?.json?.();
              respErrorCode = respErrorBody?.error_code;
            } catch { /* ignore */ }

            const mappedDoc = respErrorCode ? ERROR_CODE_MESSAGES[respErrorCode] : undefined;
            if (mappedDoc) {
              toast({ title: mappedDoc.title, description: mappedDoc.description, variant: 'destructive' });
              cancelledRef.current = true;
              outcome = { ...outcome, status: 'failed', reason: 'delivery_failed', error: respErrorBody?.error || mappedDoc.description };
              working[idx] = outcome;
              setLiveResults([...working]);
              break;
            }

            if (respErrorBody?.tailoring) {
              outcome = { ...outcome, status: 'failed', reason: 'tailoring_incomplete', error: respErrorBody.error || 'Tailoring incomplete' };
            } else {
              const errMsg = respErrorBody?.error || resp.error.message || 'Delivery failed';
              const reason: BulkResultReason = /lock|423|resourceLocked/i.test(errMsg) ? 'locked' : 'delivery_failed';
              outcome = { ...outcome, status: 'failed', reason, error: errMsg };
            }
          } else if (bodyData?.success) {
            if (bodyData.skipped) {
              outcome = { ...outcome, status: 'skipped', reason: 'already_generated' };
            } else {
              outcome = { ...outcome, status: 'generated', reason: 'delivered' };
            }
          } else {
            const errMsg = bodyData?.error || 'Delivery failed';
            outcome = { ...outcome, status: 'failed', reason: 'delivery_failed', error: errMsg };
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          outcome = { ...outcome, status: 'failed', reason: 'delivery_failed', error: msg };
        }

        working[idx] = outcome;
        setLiveResults([...working]);
        setProgress(tally(working));
        setCompletedCount(c => c + 1);
      }

      // ── Stuck-state guard + cancel finalisation ─────────────────────
      for (let i = 0; i < working.length; i++) {
        if (working[i].status === 'generating') {
          working[i] = {
            ...working[i],
            status: 'failed',
            reason: 'delivery_failed',
            error: cancelledRef.current ? 'cancelled' : 'unknown_error',
          };
        } else if (working[i].status === 'pending') {
          working[i] = {
            ...working[i],
            status: 'skipped',
            reason: 'cancelled',
            error: cancelledRef.current ? 'Cancelled by user' : undefined,
          };
        }
      }
      setLiveResults([...working]);
      const summary = tally(working);
      setProgress(summary);
      setCurrentDoc(null);

      finalResults = working
        .filter((r): r is LiveResult & { status: 'generated' | 'skipped' | 'failed' } =>
          r.status === 'generated' || r.status === 'skipped' || r.status === 'failed')
        .map(r => ({
          document_instance_id: r.document_instance_id,
          document_id: r.document_id,
          document_title: r.document_title,
          status: r.status,
          reason: (r.reason ?? 'delivery_failed') as BulkResultReason,
          error: r.error,
        }));

      // ── Toasts (preserve existing wording) ──────────────────────────
      if (summary.total === 0) {
        toast({ title: 'Nothing to generate', description: 'No document instances found for this stage.' });
      } else if (summary.generated === 0) {
        if (!silentEmpty) {
          const skipReason = dominantReason(finalResults, 'skipped');
          const failReason = dominantReason(finalResults, 'failed');
          const parts = [skipReason && `${skipReason} skipped`, failReason && `${failReason} failed`].filter(Boolean);
          toast({
            title: cancelledRef.current ? 'Generation Cancelled' : 'Nothing generated',
            description: parts.length > 0 ? parts.join(', ') : `${summary.skipped} skipped, ${summary.failed} failed`,
            variant: summary.failed > 0 ? 'destructive' : 'default',
          });
        }
      } else if (summary.failed > 0) {
        const failReason = dominantReason(finalResults, 'failed');
        toast({
          title: cancelledRef.current ? 'Generation Cancelled' : 'Bulk generation finished with issues',
          description: `${summary.generated} generated, ${summary.skipped} skipped, ${summary.failed} failed${failReason ? ` (${failReason})` : ''}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: cancelledRef.current ? 'Generation Cancelled' : 'Bulk Generation Complete',
          description: `${summary.generated} generated${summary.skipped > 0 ? `, ${summary.skipped} skipped` : ''}`,
        });
      }

      // ── Fire-and-forget audit ───────────────────────────────────────
      supabase.functions.invoke('bulk-generate-phase-documents', {
        body: {
          tenant_id: tenantId,
          stageinstance_id: stageInstanceId,
          package_id: packageId,
          mode,
          record_audit: true,
          total: summary.total,
          generated: summary.generated,
          skipped: summary.skipped,
          failed: summary.failed,
          results: finalResults,
        },
      }).catch(err => console.error('[bulk-gen] audit recording failed:', err));

      return { summary, results: finalResults };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: 'Generation Failed', description: msg, variant: 'destructive' });
      throw err;
    } finally {
      setGenerating(false);
    }
  };

  return { bulkGenerate, generating, progress, liveResults, currentDoc, completedCount, planSize, cancelGeneration };
}


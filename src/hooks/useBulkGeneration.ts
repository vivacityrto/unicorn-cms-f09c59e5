import { useState } from 'react';
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
  | 'template_not_imported'
  | 'already_generated'
  | 'tailoring_incomplete'
  | 'locked'
  | 'delivery_failed'
  | 'no_published_version'
  | 'delivered';

export interface BulkResult {
  document_instance_id: number;
  document_id: number;
  document_title: string;
  status: 'generated' | 'skipped' | 'failed';
  reason: BulkResultReason;
  error?: string;
}

const REASON_LABEL: Record<BulkResultReason, string> = {
  unsupported_format: 'unsupported format',
  no_template: 'no template allocated',
  template_not_imported: 'template not imported from SharePoint',
  already_generated: 'already generated',
  tailoring_incomplete: 'tailoring incomplete',
  locked: 'locked in SharePoint',
  delivery_failed: 'delivery failed',
  no_published_version: 'no published version',
  delivered: 'delivered',
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

export function useBulkGeneration() {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<BulkGenerationProgress | null>(null);
  const [results, setResults] = useState<BulkResult[]>([]);

  const bulkGenerate = async ({ tenantId, stageInstanceId, packageId, mode = 'pending_only', silentEmpty = false }: BulkGenerateParams) => {
    setGenerating(true);
    setProgress(null);
    setResults([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('bulk-generate-phase-documents', {
        body: {
          tenant_id: tenantId,
          stageinstance_id: stageInstanceId,
          package_id: packageId,
          mode,
        },
      });

      // functions.invoke sets response.error for non-2xx, but response.data still
      // carries the JSON body — pull error_code / error from there first.
      if (response.error) {
        const dataBody = response.data as { error?: string; error_code?: string } | null;
        if (dataBody?.error_code === 'GOVERNANCE_FOLDER_MISSING') {
          toast({
            title: 'Governance Folder Not Configured',
            description: 'This tenant does not have a governance folder mapped in SharePoint. Go to Admin → SharePoint Folder Mapping, select this tenant, and click "Verify & Create Default" or "Select Folder" to configure it.',
            variant: 'destructive',
          });
          return null;
        }
        throw new Error(dataBody?.error || response.error.message);
      }

      const data = response.data as {
        success: boolean;
        total: number;
        generated: number;
        skipped: number;
        failed: number;
        results: BulkResult[];
        error?: string;
      };

      if (!data.success) throw new Error(data.error || 'Generation failed');

      const summary: BulkGenerationProgress = {
        total: data.total,
        generated: data.generated,
        skipped: data.skipped,
        failed: data.failed,
      };

      setProgress(summary);
      setResults(data.results || []);

      // Honest toast: if nothing was generated, name the dominant skip/fail reason.
      if (summary.total === 0) {
        toast({
          title: 'Nothing to generate',
          description: 'No document instances found for this stage.',
        });
      } else if (summary.generated === 0) {
        if (!silentEmpty) {
          const skipReason = dominantReason(data.results || [], 'skipped');
          const failReason = dominantReason(data.results || [], 'failed');
          const parts = [skipReason && `${skipReason} skipped`, failReason && `${failReason} failed`].filter(Boolean);
          toast({
            title: 'Nothing generated',
            description: parts.length > 0
              ? parts.join(', ')
              : `${summary.skipped} skipped, ${summary.failed} failed`,
            variant: summary.failed > 0 ? 'destructive' : 'default',
          });
        }
      } else if (summary.failed > 0) {
        const failReason = dominantReason(data.results || [], 'failed');
        toast({
          title: 'Bulk generation finished with issues',
          description: `${summary.generated} generated, ${summary.skipped} skipped, ${summary.failed} failed${failReason ? ` (${failReason})` : ''}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Bulk Generation Complete',
          description: `${summary.generated} generated${summary.skipped > 0 ? `, ${summary.skipped} skipped` : ''}`,
        });
      }

      return { summary, results: data.results || [] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: 'Generation Failed', description: msg, variant: 'destructive' });
      throw err;
    } finally {
      setGenerating(false);
    }
  };

  return { bulkGenerate, generating, progress, results };
}

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
  mode?: 'all' | 'pending_only';
}

interface BulkResult {
  document_instance_id: number;
  document_title: string;
  status: 'generated' | 'skipped' | 'failed';
  error?: string;
}

export function useBulkGeneration() {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<BulkGenerationProgress | null>(null);

  const bulkGenerate = async ({ tenantId, stageInstanceId, packageId, mode = 'pending_only' }: BulkGenerateParams) => {
    setGenerating(true);
    setProgress(null);

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

      if (response.error) throw new Error(response.error.message);

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

      const result: BulkGenerationProgress = {
        total: data.total,
        generated: data.generated,
        skipped: data.skipped,
        failed: data.failed,
      };

      setProgress(result);

      toast({
        title: 'Bulk Generation Complete',
        description: `${result.generated} generated, ${result.skipped} skipped, ${result.failed} failed`,
      });

      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: 'Generation Failed', description: msg, variant: 'destructive' });
      throw err;
    } finally {
      setGenerating(false);
    }
  };

  return { bulkGenerate, generating, progress };
}

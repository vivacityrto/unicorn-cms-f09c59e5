import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StageDocument {
  id: number;
  document_id: number;
  title: string;
  status: string;
  isgenerated: boolean;
  created_at: string;
}

interface UseStageDocumentsOptions {
  stageInstanceId: number;
  tenantId: number;
  debug?: boolean;
}

export function useStageDocuments({ stageInstanceId, tenantId, debug }: UseStageDocumentsOptions) {
  const [documents, setDocuments] = useState<StageDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetchDocuments();
  }, [stageInstanceId, tenantId]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      if (debug) {
        console.log('[StageDocuments] querying stageinstance_id:', stageInstanceId, 'tenant_id:', tenantId);
      }

      // Fetch document_instances for this stage_instance, scoped to tenant
      const { data: instances, error, count } = await supabase
        .from('document_instances')
        .select('id, document_id, isgenerated, status, created_at', { count: 'exact' })
        .eq('stageinstance_id', stageInstanceId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (debug) {
        console.log('[StageDocuments] rows returned:', count, 'error:', error?.message ?? 'none');
      }

      if (error) throw error;
      if (!instances || instances.length === 0) {
        setDocuments([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      setTotalCount(count ?? instances.length);

      // Get document titles from documents table
      const docIds = [...new Set(instances.map(i => i.document_id))];
      const { data: docs } = await supabase
        .from('documents')
        .select('id, title')
        .in('id', docIds);

      const docMap = new Map(docs?.map(d => [d.id, d.title]) || []);

      const result: StageDocument[] = instances.slice(0, 10).map(inst => ({
        id: inst.id,
        document_id: inst.document_id,
        title: docMap.get(inst.document_id) || `Document #${inst.document_id}`,
        status: inst.status || 'pending',
        isgenerated: inst.isgenerated ?? false,
        created_at: inst.created_at || '',
      }));

      setDocuments(result);
    } catch (err) {
      console.error('Error fetching stage documents:', err);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  return { documents, loading, totalCount, refetch: fetchDocuments };
}

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StageDocument {
  id: number;
  document_id: number;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  isgenerated: boolean;
  created_at: string;
  generation_status: string | null;
  generated_file_url: string | null;
  generationdate: string | null;
  last_error: string | null;
  is_manual_allocation: boolean;
  has_sharepoint_link: boolean;
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
        .select('id, document_id, isgenerated, status, created_at, generation_status, generated_file_url, generationdate, last_error, is_manual_allocation', { count: 'exact' })
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
        .select('id, title, description, category, source_template_url, uploaded_files')
        .in('id', docIds);

      const docMap = new Map(docs?.map(d => [d.id, {
        title: d.title,
        description: d.description,
        category: d.category,
        has_sharepoint_link: !!(d.source_template_url || (d.uploaded_files && d.uploaded_files.length > 0)),
      }]) || []);

      const result: StageDocument[] = instances.map(inst => {
        const meta = docMap.get(inst.document_id);
        return {
          id: inst.id,
          document_id: inst.document_id,
          title: meta?.title || `Document #${inst.document_id}`,
          description: meta?.description || null,
          category: meta?.category || null,
          status: inst.status || 'pending',
          isgenerated: inst.isgenerated ?? false,
          created_at: inst.created_at || '',
          generation_status: (inst as any).generation_status || null,
          generated_file_url: (inst as any).generated_file_url || null,
          generationdate: (inst as any).generationdate || null,
          last_error: (inst as any).last_error || null,
          is_manual_allocation: (inst as any).is_manual_allocation ?? false,
        };
      });

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

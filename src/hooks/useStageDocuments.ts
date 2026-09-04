import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StageDocument {
  id: number;
  document_id: number;
  title: string;
  description: string | null;
  category: string | null;
  framework_type: string | null;
  status: string;
  isgenerated: boolean;
  created_at: string;
  generation_status: string | null;
  generated_file_url: string | null;
  generationdate: string | null;
  last_error: string | null;
  is_manual_allocation: boolean;
  has_sharepoint_link: boolean;
  /** Current (highest version_number) template version — same definition as ManageDocuments' getCurrentVersion. */
  current_version_display: string | null;
  current_version_status: string | null;
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

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      if (debug) {
        console.log('[StageDocuments] querying stageinstance_id:', stageInstanceId, 'tenant_id:', tenantId);
      }

      // Fetch document_instances for this stage_instance, scoped to tenant
      const { data: instances, error, count } = await supabase
        .from('document_instances')
        .select('id, document_id, document_title, isgenerated, status, created_at, generation_status, generated_file_url, generationdate, last_error, is_manual_allocation', { count: 'exact' })
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
      const [{ data: docs }, { data: versions }] = await Promise.all([
        supabase
          .from('documents')
          .select('id, title, description, category, framework_type, source_template_url, uploaded_files')
          .in('id', docIds),
        supabase
          .from('document_versions')
          .select('document_id, version_number, display_version, status')
          .in('document_id', docIds),
      ]);

      const docMap = new Map(docs?.map(d => [d.id, {
        title: d.title,
        description: d.description,
        category: d.category,
        framework_type: d.framework_type ?? null,
        has_sharepoint_link: !!(d.source_template_url || (d.uploaded_files && d.uploaded_files.length > 0)),
      }]) || []);

      // Current version = highest version_number per document, matching
      // ManageDocuments' getCurrentVersion — not current_published_version_id,
      // which can lag behind a freshly-imported draft (see 2026-08-19 fix).
      const currentVersionByDoc = new Map<number, { display_version: string | null; status: string | null; version_number: number }>();
      for (const v of (versions ?? []) as { document_id: number; version_number: number; display_version: string | null; status: string | null }[]) {
        const current = currentVersionByDoc.get(v.document_id);
        if (!current || v.version_number > current.version_number) {
          currentVersionByDoc.set(v.document_id, { display_version: v.display_version, status: v.status, version_number: v.version_number });
        }
      }

      const result: StageDocument[] = instances.map(inst => {
        const meta = docMap.get(inst.document_id);
        const currentVersion = currentVersionByDoc.get(inst.document_id);
        return {
          id: inst.id,
          document_id: inst.document_id,
          title: meta?.title || inst.document_title || `Document #${inst.document_id}`,
          description: meta?.description || null,
          category: meta?.category || null,
          framework_type: meta?.framework_type ?? null,
          status: inst.status || 'pending',
          isgenerated: inst.isgenerated ?? false,
          created_at: inst.created_at || '',
          generation_status: inst.generation_status || null,
          generated_file_url: inst.generated_file_url || null,
          generationdate: inst.generationdate || null,
          last_error: inst.last_error || null,
          is_manual_allocation: inst.is_manual_allocation ?? false,
          has_sharepoint_link: meta?.has_sharepoint_link ?? false,
          current_version_display: currentVersion?.display_version ?? (currentVersion ? `v${currentVersion.version_number}` : null),
          current_version_status: currentVersion?.status ?? null,
        };
      });

      setDocuments(result);
    } catch (err) {
      console.error('Error fetching stage documents:', err);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [stageInstanceId, tenantId, debug]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return { documents, loading, totalCount, refetch: fetchDocuments };
}

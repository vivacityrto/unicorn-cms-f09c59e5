import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EvidenceCategory {
  id: string;
  stage_type: string;
  category_name: string;
  category_description: string;
  related_standard_clause: string;
  mandatory_flag: boolean;
  required_metadata_json: MetadataField[];
  document_type: string;
}

export interface MetadataField {
  key: string;
  label: string;
  type: 'text' | 'date' | 'boolean' | 'select';
  required: boolean;
  options?: string[];
}

export function useEvidenceCategories(stageType?: string) {
  return useQuery({
    queryKey: ['evidence-categories', stageType],
    queryFn: async () => {
      const resolvedType = stageType || 'default';
      const { data, error } = await supabase
        .from('stage_required_evidence_categories')
        .select('*')
        .or(`stage_type.eq.${resolvedType},stage_type.eq.default`)
        .order('category_name');

      if (error) throw error;

      return (data || []).map((cat: any) => ({
        ...cat,
        required_metadata_json: Array.isArray(cat.required_metadata_json)
          ? cat.required_metadata_json
          : [],
      })) as EvidenceCategory[];
    },
  });
}

export function useEvidenceCompleteness(tenantId: number | null, stageInstanceId?: number) {
  return useQuery({
    queryKey: ['evidence-completeness', tenantId, stageInstanceId],
    queryFn: async () => {
      if (!tenantId) return { total: 0, uploaded: 0, mandatory_missing: 0, categories: [] };

      // Get required categories
      const { data: categories } = await supabase
        .from('stage_required_evidence_categories')
        .select('*')
        .or('stage_type.eq.default');

      // Get uploaded evidence for this tenant
      let docsQuery = supabase
        .from('portal_documents')
        .select('evidence_category_id')
        .eq('tenant_id', tenantId)
        .not('evidence_category_id', 'is', null)
        .is('deleted_at', null);

      if (stageInstanceId) {
        docsQuery = docsQuery.eq('linked_stage_id', stageInstanceId);
      }

      const { data: docs } = await docsQuery;

      const uploadedCategoryIds = new Set((docs || []).map(d => d.evidence_category_id));
      const allCategories = categories || [];
      const mandatoryCategories = allCategories.filter(c => c.mandatory_flag);
      const mandatoryMissing = mandatoryCategories.filter(c => !uploadedCategoryIds.has(c.id));

      return {
        total: allCategories.length,
        uploaded: uploadedCategoryIds.size,
        mandatory_missing: mandatoryMissing.length,
        categories: allCategories.map(c => ({
          ...c,
          has_upload: uploadedCategoryIds.has(c.id),
        })),
      };
    },
    enabled: !!tenantId,
  });
}

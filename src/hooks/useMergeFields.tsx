import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export interface MergeFieldDefinition {
  id: number;
  tag: string;
  name: string;
  source_table: string | null;
  source_column: string | null;
  source_address_type: string | null;
  is_active: boolean;
  description: string | null;
  field_type: string;
  created_at: string;
  updated_at: string;
}

export function useMergeFields() {
  const { toast } = useToast();
  const [mergeFields, setMergeFields] = useState<MergeFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMergeFields = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('dd_fields')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setMergeFields((data || []) as unknown as MergeFieldDefinition[]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch merge fields';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchMergeFields();
  }, [fetchMergeFields]);

  const addMergeField = async (data: Partial<MergeFieldDefinition>) => {
    const payload: TablesInsert<'dd_fields'> = {
      tag: data.tag,
      name: data.name,
      source_table: data.source_table,
      source_column: data.source_column,
      source_address_type: data.source_address_type,
      field_type: data.field_type || 'text',
      description: data.description,
      is_active: data.is_active ?? true,
    };
    const { data: newField, error } = await supabase
      .from('dd_fields')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    await fetchMergeFields();
    return newField;
  };

  const updateMergeField = async (id: number | string, data: Partial<MergeFieldDefinition>) => {
    const payload: TablesUpdate<'dd_fields'> = data;
    const { error } = await supabase
      .from('dd_fields')
      .update(payload)
      .eq('id', Number(id));

    if (error) throw error;
    await fetchMergeFields();
  };

  const deleteMergeField = async (id: number | string) => {
    const { error } = await supabase
      .from('dd_fields')
      .delete()
      .eq('id', Number(id));

    if (error) throw error;
    await fetchMergeFields();
  };

  const getActiveFields = () => mergeFields.filter(f => f.is_active);

  return {
    mergeFields,
    loading,
    fetchMergeFields,
    addMergeField,
    updateMergeField,
    deleteMergeField,
    getActiveFields
  };
}

// Get merge data for a tenant from the v_tenant_merge_fields view
export async function getTenantMergeData(tenantId: number): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('v_tenant_merge_fields')
    .select('field_tag, value')
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error('Failed to fetch tenant merge data');
  }

  const mergeData: Record<string, string> = {};
  (data || []).forEach((row: Pick<Tables<'v_tenant_merge_fields'>, 'field_tag' | 'value'>) => {
    if (row.field_tag) mergeData[`{{${row.field_tag}}}`] = row.value || '';
  });

  return mergeData;
}

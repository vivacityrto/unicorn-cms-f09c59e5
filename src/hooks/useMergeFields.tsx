import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface MergeFieldDefinition {
  id: string;
  code: string;
  name: string;
  source_table: string;
  source_column: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

export function useMergeFields() {
  const { toast } = useToast();
  const [mergeFields, setMergeFields] = useState<MergeFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMergeFields = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('merge_field_definitions' as any)
        .select('*')
        .order('name', { ascending: true }) as any;

      if (error) throw error;
      setMergeFields(data || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch merge fields',
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
    const { data: newField, error } = await (supabase
      .from('merge_field_definitions' as any)
      .insert({
        code: data.code,
        name: data.name,
        source_table: data.source_table || 'clients_legacy',
        source_column: data.source_column,
        description: data.description,
        is_system: false,
        is_active: true
      })
      .select()
      .single() as any);

    if (error) throw error;
    await fetchMergeFields();
    return newField;
  };

  const updateMergeField = async (id: string, data: Partial<MergeFieldDefinition>) => {
    const { error } = await (supabase
      .from('merge_field_definitions' as any)
      .update(data)
      .eq('id', id) as any);

    if (error) throw error;
    await fetchMergeFields();
  };

  const deleteMergeField = async (id: string) => {
    const { error } = await (supabase
      .from('merge_field_definitions' as any)
      .delete()
      .eq('id', id) as any);

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

// Get merge data for a tenant from clients_legacy
export async function getTenantMergeData(clientLegacyId: string): Promise<Record<string, string>> {
  const { data: client, error } = await supabase
    .from('clients_legacy')
    .select('*')
    .eq('id', clientLegacyId)
    .single();

  if (error || !client) {
    throw new Error('Failed to fetch tenant data for merge');
  }

  const { data: mergeFields } = await supabase
    .from('merge_field_definitions' as any)
    .select('code, source_column')
    .eq('is_active', true) as any;

  const mergeData: Record<string, string> = {};
  
  (mergeFields || []).forEach((field: { code: string; source_column: string }) => {
    const value = (client as any)[field.source_column];
    mergeData[field.code] = value || '';
  });

  return mergeData;
}

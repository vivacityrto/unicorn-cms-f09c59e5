import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface GeneratedDocument {
  id: string;
  source_document_id: number;
  tenant_id: number;
  client_legacy_id: string | null;
  stage_id: number;
  package_id: number;
  file_path: string;
  file_name: string;
  generated_at: string;
  generated_by: string | null;
  status: 'generated' | 'released' | 'superseded';
  merge_data: Record<string, any> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  source_document?: {
    id: number;
    title: string;
    format: string | null;
    category: string | null;
  };
  tenant?: {
    id: number;
    name: string;
  };
}

export function useGeneratedDocuments(filters?: {
  packageId?: number;
  stageId?: number;
  tenantId?: number;
  status?: string;
}) {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    try {
      let query = supabase
        .from('generated_documents' as any)
        .select(`
          *,
          source_document:documents(id, title, format, category),
          tenant:tenants(id, name)
        `)
        .order('generated_at', { ascending: false }) as any;

      if (filters?.packageId) {
        query = query.eq('package_id', filters.packageId);
      }
      if (filters?.stageId) {
        query = query.eq('stage_id', filters.stageId);
      }
      if (filters?.tenantId) {
        query = query.eq('tenant_id', filters.tenantId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch generated documents',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [filters?.packageId, filters?.stageId, filters?.tenantId, filters?.status, toast]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const releaseDocument = async (id: string) => {
    const { error } = await (supabase
      .from('generated_documents' as any)
      .update({ status: 'released' })
      .eq('id', id) as any);

    if (error) throw error;
    await fetchDocuments();
  };

  const releaseMultiple = async (ids: string[]) => {
    for (const id of ids) {
      await (supabase
        .from('generated_documents' as any)
        .update({ status: 'released' })
        .eq('id', id) as any);
    }
    await fetchDocuments();
  };

  const supersedeDocument = async (id: string) => {
    const { error } = await (supabase
      .from('generated_documents' as any)
      .update({ status: 'superseded' })
      .eq('id', id) as any);

    if (error) throw error;
    await fetchDocuments();
  };

  const deleteDocument = async (id: string) => {
    const { error } = await (supabase
      .from('generated_documents' as any)
      .delete()
      .eq('id', id) as any);

    if (error) throw error;
    await fetchDocuments();
  };

  return {
    documents,
    loading,
    fetchDocuments,
    releaseDocument,
    releaseMultiple,
    supersedeDocument,
    deleteDocument
  };
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface DataSource {
  id: string;
  document_id: number;
  name: string;
  source_type: 'csv_upload' | 'manual' | 'reference_table';
  storage_path: string | null;
  schema: { columns: string[] } | null;
  row_count: number | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface SourceMapping {
  id: string;
  document_id: number;
  data_source_id: string;
  excel_sheet: string;
  excel_named_range: string;
  source_column: string;
  created_at: string;
  data_source?: DataSource;
}

export interface DocumentReadiness {
  merge_status: 'pass' | 'warn' | 'fail';
  missing_fields: string[];
  data_sources_status: 'pass' | 'warn' | 'fail';
  missing_tables: string[];
}

export interface ReleaseReadiness {
  summary: {
    pass: number;
    warn: number;
    fail: number;
    total: number;
  };
  documents: Array<{
    document_id: number;
    document_name: string;
    readiness: DocumentReadiness;
  }>;
  can_release: boolean;
  requires_override: boolean;
}

export function useExcelDataSources(documentId: number | null) {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [mappings, setMappings] = useState<SourceMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchDataSources = useCallback(async () => {
    if (!documentId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('document_data_sources')
        .select('*')
        .eq('document_id', documentId)
        .order('name');
      
      if (error) throw error;
      setDataSources((data || []) as DataSource[]);
    } catch (error: any) {
      toast({ title: 'Error loading data sources', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [documentId, toast]);

  const fetchMappings = useCallback(async () => {
    if (!documentId) return;
    
    try {
      const { data, error } = await supabase
        .from('document_source_mappings')
        .select('*, data_source:document_data_sources(*)')
        .eq('document_id', documentId);
      
      if (error) throw error;
      setMappings((data || []) as SourceMapping[]);
    } catch (error: any) {
      toast({ title: 'Error loading mappings', description: error.message, variant: 'destructive' });
    }
  }, [documentId, toast]);

  useEffect(() => {
    fetchDataSources();
    fetchMappings();
  }, [fetchDataSources, fetchMappings]);

  const uploadDataSource = async (
    file: File,
    name: string,
    onProgress?: (progress: number) => void
  ): Promise<DataSource | null> => {
    if (!documentId) return null;
    
    try {
      // Parse CSV to get columns
      const text = await file.text();
      const lines = text.split('\n');
      const columns = lines[0]?.split(',').map(c => c.trim().replace(/^"|"$/g, '')) || [];
      const rowCount = lines.length - 1;
      
      // Upload file to storage
      const storagePath = `doc_sources/${documentId}/${name}.csv`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      onProgress?.(50);
      
      // Create or update data source record
      const { data, error } = await supabase
        .from('document_data_sources')
        .upsert({
          document_id: documentId,
          name,
          source_type: 'csv_upload',
          storage_path: storagePath,
          schema: { columns },
          row_count: rowCount,
          updated_at: new Date().toISOString()
        }, { onConflict: 'document_id,name' })
        .select()
        .single();
      
      if (error) throw error;
      onProgress?.(100);
      
      await fetchDataSources();
      toast({ title: 'Data source uploaded successfully' });
      return data as DataSource;
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
      return null;
    }
  };

  const deleteDataSource = async (sourceId: string) => {
    try {
      const source = dataSources.find(s => s.id === sourceId);
      
      // Delete from storage if exists
      if (source?.storage_path) {
        await supabase.storage.from('documents').remove([source.storage_path]);
      }
      
      const { error } = await supabase
        .from('document_data_sources')
        .delete()
        .eq('id', sourceId);
      
      if (error) throw error;
      
      await fetchDataSources();
      await fetchMappings();
      toast({ title: 'Data source deleted' });
    } catch (error: any) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    }
  };

  const addMapping = async (
    dataSourceId: string,
    excelSheet: string,
    excelNamedRange: string,
    sourceColumn: string
  ) => {
    if (!documentId) return;
    
    try {
      const { error } = await supabase
        .from('document_source_mappings')
        .insert({
          document_id: documentId,
          data_source_id: dataSourceId,
          excel_sheet: excelSheet,
          excel_named_range: excelNamedRange,
          source_column: sourceColumn
        });
      
      if (error) throw error;
      
      await fetchMappings();
      toast({ title: 'Mapping added' });
    } catch (error: any) {
      toast({ title: 'Failed to add mapping', description: error.message, variant: 'destructive' });
    }
  };

  const deleteMapping = async (mappingId: string) => {
    try {
      const { error } = await supabase
        .from('document_source_mappings')
        .delete()
        .eq('id', mappingId);
      
      if (error) throw error;
      
      await fetchMappings();
      toast({ title: 'Mapping removed' });
    } catch (error: any) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    }
  };

  const downloadDataSource = async (source: DataSource) => {
    if (!source.storage_path) return;
    
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(source.storage_path);
      
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${source.name}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ title: 'Download failed', description: error.message, variant: 'destructive' });
    }
  };

  return {
    dataSources,
    mappings,
    loading,
    uploadDataSource,
    deleteDataSource,
    addMapping,
    deleteMapping,
    downloadDataSource,
    refresh: () => { fetchDataSources(); fetchMappings(); }
  };
}

export function useDocumentReadiness() {
  const { toast } = useToast();

  const validateDocument = async (
    documentId: number,
    tenantId?: number
  ): Promise<DocumentReadiness | null> => {
    try {
      const { data, error } = await supabase.rpc('validate_document_readiness', {
        p_document_id: documentId,
        p_tenant_id: tenantId || null
      });
      
      if (error) throw error;
      return data as unknown as DocumentReadiness;
    } catch (error: any) {
      toast({ title: 'Validation failed', description: error.message, variant: 'destructive' });
      return null;
    }
  };

  const validateReleaseReadiness = async (
    documentIds: number[],
    tenantId?: number
  ): Promise<ReleaseReadiness | null> => {
    try {
      const { data, error } = await supabase.rpc('validate_release_readiness', {
        p_document_ids: documentIds,
        p_tenant_id: tenantId || null
      });
      
      if (error) throw error;
      return data as unknown as ReleaseReadiness;
    } catch (error: any) {
      toast({ title: 'Validation failed', description: error.message, variant: 'destructive' });
      return null;
    }
  };

  return {
    validateDocument,
    validateReleaseReadiness
  };
}

export function useDocumentMergeFields(documentId: number | null) {
  const [mergeFields, setMergeFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMergeFields = useCallback(async () => {
    if (!documentId) return;
    
    setLoading(true);
    try {
      // Source from document_fields joined to dd_fields
      const { data, error } = await supabase
        .from('document_fields')
        .select('field:dd_fields(tag)')
        .eq('document_id', documentId);
      
      if (error) throw error;
      setMergeFields((data || []).map((r: any) => r.field?.tag).filter(Boolean));
    } catch (error: any) {
      console.error('Error fetching merge fields:', error);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchMergeFields();
  }, [fetchMergeFields]);

  return {
    mergeFields,
    loading,
  };
}

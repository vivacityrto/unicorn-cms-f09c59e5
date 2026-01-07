import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface DocumentVersion {
  id: string;
  document_id: number;
  version_number: number;
  status: 'draft' | 'published' | 'archived';
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface Document {
  id: number;
  title: string;
  description: string | null;
  format: string | null;
  category: string | null;
  document_status: 'draft' | 'published' | 'archived';
  document_category: string | null;
  standard_set: string | null;
  standard_refs: string[] | null;
  current_published_version_id: string | null;
  uploaded_files: string[] | null;
  created_at: string | null;
}

export interface DocumentStageUsage {
  stage_id: number;
  stage_name: string;
  package_count: number;
  pinned_version_id: string | null;
  pinned_version_number: number | null;
}

export interface TenantDocumentRelease {
  id: string;
  tenant_id: number;
  package_id: number | null;
  stage_id: number | null;
  document_id: number;
  document_version_id: string;
  released_at: string;
  released_by: string | null;
  is_visible_to_tenant: boolean;
  downloaded_at: string | null;
  acknowledged_at: string | null;
  document?: Document;
  version?: DocumentVersion;
}

export interface BulkUploadDocument {
  title: string;
  description?: string;
  storage_path: string;
  file_name: string;
  mime_type?: string;
  file_size?: number;
  category?: string;
  standard_set?: string;
  standard_refs?: string[];
}

export function useDocumentVersions(documentId?: number) {
  const { toast } = useToast();
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const fetchVersions = useCallback(async () => {
    if (!documentId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('document_versions')
        .select('*')
        .eq('document_id', documentId)
        .order('version_number', { ascending: false }) as { data: DocumentVersion[] | null; error: any };

      if (error) throw error;
      setVersions(data || []);
    } catch (error: any) {
      console.error('Failed to fetch document versions:', error);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const publishVersion = async (notes?: string): Promise<string | null> => {
    if (!documentId) return null;
    
    setPublishing(true);
    try {
      const { data, error } = await supabase.rpc('publish_document_version', {
        p_document_id: documentId,
        p_notes: notes || null
      });

      if (error) throw error;

      toast({
        title: 'Document Published',
        description: 'New version has been published successfully'
      });

      await fetchVersions();
      return data as string;
    } catch (error: any) {
      toast({
        title: 'Publish Failed',
        description: error.message || 'Failed to publish document version',
        variant: 'destructive'
      });
      return null;
    } finally {
      setPublishing(false);
    }
  };

  const archiveVersion = async (versionId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('document_versions')
        .update({ status: 'archived' })
        .eq('id', versionId);

      if (error) throw error;

      toast({ title: 'Version archived' });
      await fetchVersions();
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to archive version',
        variant: 'destructive'
      });
      return false;
    }
  };

  const currentPublishedVersion = versions.find(v => v.status === 'published');
  const latestVersion = versions[0];

  return {
    versions,
    loading,
    publishing,
    currentPublishedVersion,
    latestVersion,
    publishVersion,
    archiveVersion,
    refetch: fetchVersions
  };
}

export function useDocumentStageUsage(documentId?: number) {
  const [usage, setUsage] = useState<DocumentStageUsage[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUsage = useCallback(async () => {
    if (!documentId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_document_stage_usage', {
        p_document_id: documentId
      });

      if (error) throw error;
      setUsage((data || []) as DocumentStageUsage[]);
    } catch (error: any) {
      console.error('Failed to fetch document usage:', error);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  return { usage, loading, refetch: fetchUsage };
}

export function useTenantDocumentReleases(tenantId?: number) {
  const { toast } = useToast();
  const [releases, setReleases] = useState<TenantDocumentRelease[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReleases = useCallback(async () => {
    if (!tenantId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tenant_document_releases')
        .select(`
          *,
          document:documents(id, title, description, format, category),
          version:document_versions(id, version_number, status, file_name)
        `)
        .eq('tenant_id', tenantId)
        .order('released_at', { ascending: false });

      if (error) throw error;
      setReleases((data || []) as TenantDocumentRelease[]);
    } catch (error: any) {
      console.error('Failed to fetch tenant releases:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  const releaseDocuments = async (
    packageId: number,
    stageId: number,
    documentIds: number[]
  ): Promise<number> => {
    if (!tenantId) return 0;

    try {
      const { data, error } = await supabase.rpc('release_documents_to_tenant', {
        p_tenant_id: tenantId,
        p_package_id: packageId,
        p_stage_id: stageId,
        p_document_ids: documentIds
      });

      if (error) throw error;

      const count = data as number;
      toast({
        title: 'Documents Released',
        description: `${count} document${count !== 1 ? 's' : ''} released to tenant`
      });

      await fetchReleases();
      return count;
    } catch (error: any) {
      toast({
        title: 'Release Failed',
        description: error.message || 'Failed to release documents',
        variant: 'destructive'
      });
      return 0;
    }
  };

  const trackDownload = async (releaseId: string): Promise<void> => {
    try {
      await supabase.rpc('track_document_download', { p_release_id: releaseId });
    } catch (error) {
      console.error('Failed to track download:', error);
    }
  };

  const acknowledgeDocument = async (releaseId: string): Promise<void> => {
    try {
      await supabase.rpc('acknowledge_document', { p_release_id: releaseId });
      await fetchReleases();
    } catch (error) {
      console.error('Failed to acknowledge document:', error);
    }
  };

  const toggleVisibility = async (releaseId: string, visible: boolean): Promise<void> => {
    try {
      const { error } = await supabase
        .from('tenant_document_releases')
        .update({ is_visible_to_tenant: visible })
        .eq('id', releaseId);

      if (error) throw error;
      await fetchReleases();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update visibility',
        variant: 'destructive'
      });
    }
  };

  return {
    releases,
    loading,
    releaseDocuments,
    trackDownload,
    acknowledgeDocument,
    toggleVisibility,
    refetch: fetchReleases
  };
}

export function useBulkDocumentUpload() {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const uploadDocuments = async (
    documents: BulkUploadDocument[],
    options: {
      category?: string;
      standardSet?: string;
      standardRefs?: string[];
      autoPublish?: boolean;
    } = {}
  ): Promise<{ document_id: number; version_id: string; title: string }[]> => {
    setUploading(true);
    try {
      const payload = documents.map(doc => ({
        title: doc.title,
        description: doc.description || '',
        storage_path: doc.storage_path,
        file_name: doc.file_name,
        mime_type: doc.mime_type || null,
        file_size: doc.file_size || null,
        category: doc.category || options.category || null,
        standard_set: doc.standard_set || options.standardSet || null,
        standard_refs: doc.standard_refs || options.standardRefs || null
      }));

      const { data, error } = await supabase.rpc('bulk_create_documents_with_versions', {
        p_documents: payload,
        p_category: options.category || null,
        p_standard_set: options.standardSet || null,
        p_standard_refs: options.standardRefs || null,
        p_auto_publish: options.autoPublish || false
      });

      if (error) throw error;

      const results = data as { document_id: number; version_id: string; title: string }[];
      
      toast({
        title: 'Upload Complete',
        description: `${results.length} document${results.length !== 1 ? 's' : ''} created successfully`
      });

      return results;
    } catch (error: any) {
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to create documents',
        variant: 'destructive'
      });
      return [];
    } finally {
      setUploading(false);
    }
  };

  return { uploadDocuments, uploading };
}

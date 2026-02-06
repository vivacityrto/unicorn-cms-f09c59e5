import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PortalDocument {
  id: string;
  tenant_id: number;
  storage_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  category_id: string | null;
  tags: string[] | null;
  direction: string;
  is_client_visible: boolean;
  status: string;
  version_group_id: string | null;
  source: string;
  linked_package_id: number | null;
  linked_stage_id: number | null;
  linked_task_id: string | null;
  evidence_request_item_id: string | null;
  uploaded_by: string | null;
  shared_at: string | null;
  shared_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Joined fields
  uploader_name?: string | null;
  category_name?: string | null;
  package_name?: string | null;
}

export const portalDocumentsKeys = {
  all: ['portal-documents'] as const,
  list: (tenantId: number) => [...portalDocumentsKeys.all, 'list', tenantId] as const,
  byDirection: (tenantId: number, direction: string) => [...portalDocumentsKeys.list(tenantId), direction] as const,
  detail: (id: string) => [...portalDocumentsKeys.all, 'detail', id] as const,
};

export function usePortalDocuments(tenantId: number | null, direction?: string) {
  return useQuery({
    queryKey: direction 
      ? portalDocumentsKeys.byDirection(tenantId!, direction)
      : portalDocumentsKeys.list(tenantId!),
    queryFn: async () => {
      if (!tenantId) return [];
      
      let query = supabase
        .from('portal_documents')
        .select(`
          *,
          uploader:users!portal_documents_uploaded_by_fkey(first_name, last_name),
          category:portal_document_categories(name),
          package:packages(name)
        `)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (direction) {
        query = query.eq('direction', direction);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((doc: any) => ({
        ...doc,
        uploader_name: doc.uploader 
          ? `${doc.uploader.first_name || ''} ${doc.uploader.last_name || ''}`.trim() 
          : null,
        category_name: doc.category?.name || null,
        package_name: doc.package?.name || null,
      })) as PortalDocument[];
    },
    enabled: !!tenantId,
  });
}

export function useClientVisibleDocuments(tenantId: number | null) {
  return useQuery({
    queryKey: [...portalDocumentsKeys.list(tenantId!), 'client-visible'],
    queryFn: async () => {
      if (!tenantId) return [];
      
      const { data, error } = await supabase
        .from('portal_documents')
        .select(`
          *,
          uploader:users!portal_documents_uploaded_by_fkey(first_name, last_name),
          category:portal_document_categories(name),
          package:packages(name)
        `)
        .eq('tenant_id', tenantId)
        .eq('is_client_visible', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((doc: any) => ({
        ...doc,
        uploader_name: doc.uploader 
          ? `${doc.uploader.first_name || ''} ${doc.uploader.last_name || ''}`.trim() 
          : null,
        category_name: doc.category?.name || null,
        package_name: doc.package?.name || null,
      })) as PortalDocument[];
    },
    enabled: !!tenantId,
  });
}

interface UploadDocumentParams {
  tenantId: number;
  file: File;
  direction: 'vivacity_to_client' | 'client_to_vivacity' | 'internal';
  isClientVisible?: boolean;
  categoryId?: string | null;
  tags?: string[];
  linkedPackageId?: number | null;
  linkedStageId?: number | null;
  linkedTaskId?: string | null;
  evidenceRequestItemId?: string | null;
}

export function useUploadPortalDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      tenantId,
      file,
      direction,
      isClientVisible = false,
      categoryId,
      tags,
      linkedPackageId,
      linkedStageId,
      linkedTaskId,
      evidenceRequestItemId,
    }: UploadDocumentParams) => {
      // Upload to storage
      const storagePath = `${tenantId}/${direction}/${Date.now()}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('portal-documents')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Create DB record
      const { data, error } = await supabase
        .from('portal_documents')
        .insert({
          tenant_id: tenantId,
          storage_path: storagePath,
          file_name: file.name,
          file_type: file.type || null,
          file_size: file.size,
          direction,
          is_client_visible: isClientVisible,
          status: isClientVisible ? 'shared' : 'draft',
          source: 'manual_upload',
          category_id: categoryId || null,
          tags: tags || null,
          linked_package_id: linkedPackageId || null,
          linked_stage_id: linkedStageId || null,
          linked_task_id: linkedTaskId || null,
          evidence_request_item_id: evidenceRequestItemId || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Log audit event
      await supabase.rpc('log_portal_document_event', {
        p_document_id: data.id,
        p_document_type: 'portal_document',
        p_tenant_id: tenantId,
        p_action: 'uploaded',
        p_reason: null,
      });

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: portalDocumentsKeys.list(variables.tenantId) 
      });
      toast({
        title: 'Document uploaded',
        description: 'Your document has been uploaded successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload document',
        variant: 'destructive',
      });
    },
  });
}

export function useShareDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ docId, tenantId }: { docId: string; tenantId: number }) => {
      const { error } = await supabase
        .from('portal_documents')
        .update({
          is_client_visible: true,
          status: 'shared',
          shared_at: new Date().toISOString(),
        })
        .eq('id', docId);

      if (error) throw error;

      // Log audit event
      await supabase.rpc('log_portal_document_event', {
        p_document_id: docId,
        p_document_type: 'portal_document',
        p_tenant_id: tenantId,
        p_action: 'shared_to_client',
        p_reason: null,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: portalDocumentsKeys.list(variables.tenantId) 
      });
      toast({
        title: 'Document shared',
        description: 'The document is now visible to the client.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Share failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUnshareDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ docId, tenantId }: { docId: string; tenantId: number }) => {
      const { error } = await supabase
        .from('portal_documents')
        .update({
          is_client_visible: false,
          status: 'draft',
        })
        .eq('id', docId);

      if (error) throw error;

      // Log audit event
      await supabase.rpc('log_portal_document_event', {
        p_document_id: docId,
        p_document_type: 'portal_document',
        p_tenant_id: tenantId,
        p_action: 'unshared',
        p_reason: null,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: portalDocumentsKeys.list(variables.tenantId) 
      });
      toast({
        title: 'Document unshared',
        description: 'The document is no longer visible to the client.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Unshare failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDownloadPortalDocument() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ doc, tenantId }: { doc: PortalDocument; tenantId: number }) => {
      const { data, error } = await supabase.storage
        .from('portal-documents')
        .download(doc.storage_path);

      if (error) throw error;

      // Log audit event
      await supabase.rpc('log_portal_document_event', {
        p_document_id: doc.id,
        p_document_type: 'portal_document',
        p_tenant_id: tenantId,
        p_action: 'downloaded',
        p_reason: null,
      });

      // Trigger download
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Download started',
        description: 'Your document is downloading.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Download failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useSoftDeleteDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ docId, tenantId, reason }: { docId: string; tenantId: number; reason?: string }) => {
      const { error } = await supabase
        .from('portal_documents')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', docId);

      if (error) throw error;

      // Log audit event
      await supabase.rpc('log_portal_document_event', {
        p_document_id: docId,
        p_document_type: 'portal_document',
        p_tenant_id: tenantId,
        p_action: 'deleted',
        p_reason: reason || null,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: portalDocumentsKeys.list(variables.tenantId) 
      });
      toast({
        title: 'Document deleted',
        description: 'The document has been removed.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

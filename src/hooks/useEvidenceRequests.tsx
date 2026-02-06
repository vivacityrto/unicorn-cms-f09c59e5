import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface EvidenceRequestItem {
  id: string;
  request_id: string;
  item_name: string;
  guidance_text: string | null;
  accepted_file_types: string[] | null;
  is_required: boolean;
  received_document_id: string | null;
  status: string;
  review_notes: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  sort_order: number;
  created_at: string;
  // Joined
  received_document?: {
    file_name: string;
    storage_path: string;
  } | null;
}

export interface EvidenceRequest {
  id: string;
  tenant_id: number;
  template_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  category: string;
  requested_by_user_id: string;
  assigned_to_client_user_id: string | null;
  status: string;
  linked_package_id: number | null;
  linked_stage_id: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  sent_at: string | null;
  // Joined
  items?: EvidenceRequestItem[];
  requester_name?: string | null;
  assignee_name?: string | null;
  package_name?: string | null;
}

export const evidenceRequestsKeys = {
  all: ['evidence-requests'] as const,
  list: (tenantId: number) => [...evidenceRequestsKeys.all, 'list', tenantId] as const,
  detail: (id: string) => [...evidenceRequestsKeys.all, 'detail', id] as const,
  templates: () => [...evidenceRequestsKeys.all, 'templates'] as const,
};

export function useEvidenceRequests(tenantId: number | null) {
  return useQuery({
    queryKey: evidenceRequestsKeys.list(tenantId!),
    queryFn: async () => {
      if (!tenantId) return [];
      
      const { data, error } = await supabase
        .from('evidence_requests')
        .select(`
          *,
          requester:users!evidence_requests_requested_by_user_id_fkey(first_name, last_name),
          assignee:users!evidence_requests_assigned_to_client_user_id_fkey(first_name, last_name),
          items:evidence_request_items(
            *,
            received_document:portal_documents(file_name, storage_path)
          )
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((req: any) => ({
        ...req,
        requester_name: req.requester 
          ? `${req.requester.first_name || ''} ${req.requester.last_name || ''}`.trim() 
          : null,
        assignee_name: req.assignee 
          ? `${req.assignee.first_name || ''} ${req.assignee.last_name || ''}`.trim() 
          : null,
        items: (req.items || []).sort((a: EvidenceRequestItem, b: EvidenceRequestItem) => 
          a.sort_order - b.sort_order
        ),
      })) as EvidenceRequest[];
    },
    enabled: !!tenantId,
  });
}

export function useEvidenceRequest(requestId: string | null) {
  return useQuery({
    queryKey: evidenceRequestsKeys.detail(requestId!),
    queryFn: async () => {
      if (!requestId) return null;
      
      const { data, error } = await supabase
        .from('evidence_requests')
        .select(`
          *,
          requester:users!evidence_requests_requested_by_user_id_fkey(first_name, last_name),
          assignee:users!evidence_requests_assigned_to_client_user_id_fkey(first_name, last_name),
          items:evidence_request_items(
            *,
            received_document:portal_documents(file_name, storage_path)
          )
        `)
        .eq('id', requestId)
        .single();

      if (error) throw error;

      return {
        ...data,
        requester_name: (data as any).requester 
          ? `${(data as any).requester.first_name || ''} ${(data as any).requester.last_name || ''}`.trim() 
          : null,
        assignee_name: (data as any).assignee 
          ? `${(data as any).assignee.first_name || ''} ${(data as any).assignee.last_name || ''}`.trim() 
          : null,
        items: ((data as any).items || []).sort((a: EvidenceRequestItem, b: EvidenceRequestItem) => 
          a.sort_order - b.sort_order
        ),
      } as EvidenceRequest;
    },
    enabled: !!requestId,
  });
}

export function useEvidenceRequestTemplates() {
  return useQuery({
    queryKey: evidenceRequestsKeys.templates(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evidence_request_templates')
        .select(`
          *,
          items:evidence_request_template_items(*)
        `)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data || [];
    },
  });
}

interface CreateRequestParams {
  tenantId: number;
  title: string;
  description?: string;
  dueDate?: string;
  category?: string;
  linkedPackageId?: number | null;
  linkedStageId?: number | null;
  assignedToClientUserId?: string | null;
  items: Array<{
    item_name: string;
    guidance_text?: string;
    accepted_file_types?: string[];
    is_required?: boolean;
  }>;
}

export function useCreateEvidenceRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      tenantId,
      title,
      description,
      dueDate,
      category,
      linkedPackageId,
      linkedStageId,
      assignedToClientUserId,
      items,
    }: CreateRequestParams) => {
      if (!user?.id) throw new Error('User not authenticated');

      // Create the request
      const { data: request, error: requestError } = await supabase
        .from('evidence_requests')
        .insert({
          tenant_id: tenantId,
          title,
          description: description || null,
          due_date: dueDate || null,
          category: category || 'General',
          linked_package_id: linkedPackageId || null,
          linked_stage_id: linkedStageId || null,
          assigned_to_client_user_id: assignedToClientUserId || null,
          requested_by_user_id: user.id,
          status: 'open',
        })
        .select()
        .single();

      if (requestError) throw requestError;

      // Create the items
      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('evidence_request_items')
          .insert(
            items.map((item, index) => ({
              request_id: request.id,
              item_name: item.item_name,
              guidance_text: item.guidance_text || null,
              accepted_file_types: item.accepted_file_types || null,
              is_required: item.is_required ?? true,
              sort_order: index,
              status: 'pending',
            }))
          );

        if (itemsError) throw itemsError;
      }

      return request;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: evidenceRequestsKeys.list(variables.tenantId) 
      });
      toast({
        title: 'Request created',
        description: 'Evidence request has been sent to the client.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create request',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

interface UploadEvidenceParams {
  tenantId: number;
  requestId: string;
  itemId: string;
  file: File;
}

export function useUploadEvidence() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ tenantId, requestId, itemId, file }: UploadEvidenceParams) => {
      // Upload file to storage
      const storagePath = `${tenantId}/evidence/${requestId}/${Date.now()}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('portal-documents')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Create portal document record
      const { data: doc, error: docError } = await supabase
        .from('portal_documents')
        .insert({
          tenant_id: tenantId,
          storage_path: storagePath,
          file_name: file.name,
          file_type: file.type || null,
          file_size: file.size,
          direction: 'client_to_vivacity',
          is_client_visible: true,
          status: 'received',
          source: 'manual_upload',
          evidence_request_item_id: itemId,
        })
        .select()
        .single();

      if (docError) throw docError;

      // Update the evidence request item
      const { error: itemError } = await supabase
        .from('evidence_request_items')
        .update({
          received_document_id: doc.id,
          status: 'received',
        })
        .eq('id', itemId);

      if (itemError) throw itemError;

      // Log audit event
      await supabase.rpc('log_portal_document_event', {
        p_document_id: doc.id,
        p_document_type: 'portal_document',
        p_tenant_id: tenantId,
        p_action: 'uploaded',
        p_reason: `Evidence for request: ${requestId}`,
      });

      return doc;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: evidenceRequestsKeys.list(variables.tenantId) 
      });
      queryClient.invalidateQueries({ 
        queryKey: evidenceRequestsKeys.detail(variables.requestId) 
      });
      toast({
        title: 'Evidence uploaded',
        description: 'Your file has been submitted.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useReviewEvidenceItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      itemId, 
      requestId,
      tenantId,
      status, 
      reviewNotes 
    }: { 
      itemId: string; 
      requestId: string;
      tenantId: number;
      status: 'accepted' | 'rejected'; 
      reviewNotes?: string;
    }) => {
      const { error } = await supabase
        .from('evidence_request_items')
        .update({
          status,
          review_notes: reviewNotes || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: evidenceRequestsKeys.detail(variables.requestId) 
      });
      queryClient.invalidateQueries({ 
        queryKey: evidenceRequestsKeys.list(variables.tenantId) 
      });
      toast({
        title: 'Review saved',
        description: `Evidence item has been ${variables.status}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Review failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useCloseRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ requestId, tenantId }: { requestId: string; tenantId: number }) => {
      const { error } = await supabase
        .from('evidence_requests')
        .update({
          status: 'closed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: evidenceRequestsKeys.list(variables.tenantId) 
      });
      toast({
        title: 'Request closed',
        description: 'The evidence request has been closed.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to close',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

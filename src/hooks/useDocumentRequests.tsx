import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface DocumentRequest {
  id: string;
  tenant_id: number;
  created_by_user_id: string;
  assigned_to_user_id: string | null;
  title: string;
  details: string;
  category: string | null;
  status: string;
  due_at: string | null;
  related_package_id: number | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  // joined
  creator_name?: string | null;
  assignee_name?: string | null;
}

export const documentRequestKeys = {
  all: ['document-requests'] as const,
  list: (tenantId: number) => [...documentRequestKeys.all, 'list', tenantId] as const,
};

export function useDocumentRequests(tenantId: number | null) {
  return useQuery({
    queryKey: documentRequestKeys.list(tenantId!),
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await ((supabase as any)
        .from('tenant_document_requests')
        .select(`
          *,
          creator:users!tenant_document_requests_created_by_user_id_fkey(first_name, last_name),
          assignee:users!tenant_document_requests_assigned_to_user_id_fkey(first_name, last_name)
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }) as any);

      if (error) {
        // Fallback without joins if FK aliases fail
        const { data: fallback, error: err2 } = await supabase
          .from('tenant_document_requests')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false });
        if (err2) throw err2;
        return (fallback ?? []) as DocumentRequest[];
      }

      return (data ?? []).map((r: any) => ({
        ...r,
        creator_name: r.creator
          ? `${r.creator.first_name || ''} ${r.creator.last_name || ''}`.trim()
          : null,
        assignee_name: r.assignee
          ? `${r.assignee.first_name || ''} ${r.assignee.last_name || ''}`.trim()
          : null,
      })) as DocumentRequest[];
    },
    enabled: !!tenantId,
  });
}

interface CreateRequestParams {
  tenantId: number;
  title: string;
  details: string;
  category?: string | null;
  dueAt?: string | null;
  relatedPackageId?: number | null;
}

export function useCreateDocumentRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: CreateRequestParams) => {
      // Resolve primary CSC for this tenant
      const { data: cscData } = await supabase
        .from('tenant_csc_assignments')
        .select('csc_user_id')
        .eq('tenant_id', params.tenantId)
        .eq('is_primary', true)
        .maybeSingle();

      const assignedTo = cscData?.csc_user_id ?? null;

      const { data, error } = await supabase
        .from('tenant_document_requests')
        .insert({
          tenant_id: params.tenantId,
          created_by_user_id: (await supabase.auth.getUser()).data.user!.id,
          assigned_to_user_id: assignedTo,
          title: params.title,
          details: params.details,
          category: params.category || null,
          due_at: params.dueAt || null,
          related_package_id: params.relatedPackageId || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Emit notification to CSC if assigned
      if (assignedTo) {
        await supabase.rpc('emit_notification', {
          p_event_type: 'document_request_created' as any,
          p_recipient_user_uuid: assignedTo,
          p_record_type: 'tenant_document_request',
          p_record_id: data.id,
          p_tenant_id: params.tenantId,
          p_payload: {
            title: params.title,
            category: params.category || null,
            link: `/client/documents?tab=requests`,
          },
        });
      }

      return data;
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: documentRequestKeys.list(params.tenantId),
      });
      toast({
        title: 'Request created',
        description: 'Your document request has been submitted.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Request failed',
        description: error.message || 'Could not create request',
        variant: 'destructive',
      });
    },
  });
}

export function useCancelDocumentRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ requestId, tenantId }: { requestId: string; tenantId: number }) => {
      const { error } = await supabase
        .from('tenant_document_requests')
        .update({
          status: 'cancelled',
          closed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;
    },
    onSuccess: (_, { tenantId }) => {
      queryClient.invalidateQueries({
        queryKey: documentRequestKeys.list(tenantId),
      });
      toast({ title: 'Request cancelled' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to cancel',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

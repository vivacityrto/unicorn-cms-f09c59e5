import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

// ─── Types ───
export interface EvidenceRequest {
  id: string;
  tenant_id: number;
  audit_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  category: string;
  requested_by_user_id: string;
  status: string;
  sent_at: string | null;
  completed_at: string | null;
  created_at: string;
  items?: EvidenceRequestItem[];
  /** Raw PostgREST embed key from `.select('*, evidence_request_items(*)')` —
   * present instead of (or alongside) `items` depending on the call site. */
  evidence_request_items?: EvidenceRequestItem[];
}

export interface EvidenceRequestItem {
  id: string;
  request_id: string;
  item_name: string;
  guidance_text: string | null;
  is_required: boolean;
  display_order: number;
  received_document_id: string | null;
  received_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  status: string;
  section_id: string | null;
  question_id: string | null;
}

// ─── Auditor: fetch evidence requests for an audit ───
export function useAuditEvidenceRequests(auditId: string | undefined) {
  return useQuery({
    queryKey: ['audit-evidence-requests', auditId],
    enabled: !!auditId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evidence_requests')
        .select('*, evidence_request_items(*)')
        .eq('audit_id', auditId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as EvidenceRequest[];
    },
  });
}

// ─── Auditor: create evidence request ───
export function useCreateAuditEvidenceRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      auditId,
      tenantId,
      title,
      description,
      dueDate,
      items,
    }: {
      auditId: string;
      tenantId: number;
      title: string;
      description: string | null;
      dueDate: string;
      items: { item_name: string; guidance_text: string | null; is_required: boolean; section_id: string | null }[];
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error('Not authenticated');

      const insertPayload: TablesInsert<'evidence_requests'> = {
        tenant_id: tenantId,
        audit_id: auditId,
        title,
        description,
        due_date: dueDate,
        category: 'audit_preparation',
        requested_by_user_id: user.id,
        status: 'open',
        sent_at: new Date().toISOString(),
      };

      const { data: req, error: reqErr } = await supabase
        .from('evidence_requests')
        .insert(insertPayload)
        .select('id')
        .single();
      if (reqErr) throw reqErr;

      const requestId = req.id;

      if (items.length > 0) {
        const itemInserts: TablesInsert<'evidence_request_items'>[] = items.map((item, i) => ({
          request_id: requestId,
          item_name: item.item_name,
          guidance_text: item.guidance_text,
          is_required: item.is_required,
          display_order: i + 1,
          status: 'pending',
          section_id: item.section_id,
        }));

        const { error: itemErr } = await supabase
          .from('evidence_request_items')
          .insert(itemInserts);
        if (itemErr) throw itemErr;
      }

      return requestId;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['audit-evidence-requests', vars.auditId] });
      toast.success('Evidence request sent to client portal');
    },
    onError: (err: unknown) => {
      toast.error('Failed to create evidence request: ' + (err instanceof Error ? err.message : 'Unknown error'));
    },
  });
}

// ─── Auditor: review evidence item ───
export function useReviewEvidenceItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      status,
      reviewNotes,
    }: {
      itemId: string;
      status: 'accepted' | 'resubmit_requested';
      reviewNotes?: string;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const updatePayload: TablesUpdate<'evidence_request_items'> = {
        status,
        review_notes: reviewNotes || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id,
      };
      const { error } = await supabase
        .from('evidence_request_items')
        .update(updatePayload)
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-evidence-requests'] });
      toast.success('Item reviewed');
    },
  });
}

// ─── Client: fetch evidence requests for the portal ───
export function useClientEvidenceRequests(tenantId: number | null | undefined) {
  return useQuery({
    queryKey: ['client-evidence-requests', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evidence_requests')
        .select('*, evidence_request_items(*)')
        .eq('tenant_id', tenantId)
        .not('audit_id', 'is', null)
        .in('status', ['open', 'partially_received'])
        .order('due_date', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as EvidenceRequest[];
    },
  });
}

// ─── Client: upload evidence for an item ───
export function useUploadEvidenceItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tenantId,
      requestId,
      itemId,
      file,
    }: {
      tenantId: number;
      requestId: string;
      itemId: string;
      file: File;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error('Not authenticated');

      const storagePath = `${tenantId}/audit/${requestId}/${itemId}/${file.name}`;

      const { error: uploadErr } = await supabase.storage
        .from('portal-documents')
        .upload(storagePath, file);
      if (uploadErr) throw uploadErr;

      // Create portal_documents record
      const docInsertPayload: TablesInsert<'portal_documents'> = {
        tenant_id: tenantId,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        file_type: file.type,
        direction: 'client_to_vivacity',
        evidence_request_item_id: itemId,
        source: 'evidence_response',
        is_client_visible: true,
        status: 'received',
        uploaded_by: user.id,
      };
      const { data: doc, error: docErr } = await supabase
        .from('portal_documents')
        .insert(docInsertPayload)
        .select('id')
        .single();
      if (docErr) throw docErr;

      // Update evidence_request_items
      const itemUpdatePayload: TablesUpdate<'evidence_request_items'> = {
        received_document_id: doc.id,
        received_at: new Date().toISOString(),
        status: 'received',
      };
      const { error: updateErr } = await supabase
        .from('evidence_request_items')
        .update(itemUpdatePayload)
        .eq('id', itemId);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-evidence-requests'] });
      queryClient.invalidateQueries({ queryKey: ['audit-evidence-requests'] });
      toast.success('Document uploaded successfully');
    },
    onError: (err: unknown) => {
      toast.error('Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    },
  });
}

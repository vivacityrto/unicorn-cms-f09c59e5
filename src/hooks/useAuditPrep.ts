import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
        .from('evidence_requests' as any)
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

      const { data: req, error: reqErr } = await supabase
        .from('evidence_requests' as any)
        .insert({
          tenant_id: tenantId,
          audit_id: auditId,
          title,
          description,
          due_date: dueDate,
          category: 'audit_preparation',
          requested_by_user_id: user.id,
          status: 'sent',
          sent_at: new Date().toISOString(),
        } as any)
        .select('id')
        .single();
      if (reqErr) throw reqErr;

      const requestId = (req as any).id;

      if (items.length > 0) {
        const itemInserts = items.map((item, i) => ({
          request_id: requestId,
          item_name: item.item_name,
          guidance_text: item.guidance_text,
          is_required: item.is_required,
          display_order: i + 1,
          status: 'pending',
          section_id: item.section_id,
        }));

        const { error: itemErr } = await supabase
          .from('evidence_request_items' as any)
          .insert(itemInserts as any);
        if (itemErr) throw itemErr;
      }

      return requestId;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['audit-evidence-requests', vars.auditId] });
      toast.success('Evidence request sent to client portal');
    },
    onError: (err: any) => {
      toast.error('Failed to create evidence request: ' + (err.message || 'Unknown error'));
    },
  });
}

// ─── Auditor: generate items from template questions ───
export function useGenerateRequestFromQuestions(auditId: string | undefined, templateId: string | null | undefined) {
  return useQuery({
    queryKey: ['audit-evidence-template-items', auditId, templateId],
    enabled: false, // manual trigger only
    queryFn: async () => {
      if (!templateId) return [];
      const { data, error } = await supabase
        .from('compliance_template_questions' as any)
        .select('id, clause, audit_statement, evidence_to_sight, section_id')
        .eq('is_active', true)
        .not('evidence_to_sight', 'is', null)
        .order('sort_order', { ascending: true });
      if (error) throw error;

      // Filter to questions belonging to this template's sections
      const { data: sections } = await supabase
        .from('compliance_template_sections' as any)
        .select('id')
        .eq('template_id', templateId);
      const sectionIds = new Set((sections as any[] || []).map((s: any) => s.id));

      return ((data as any[]) || [])
        .filter((q: any) => sectionIds.has(q.section_id) && q.evidence_to_sight)
        .map((q: any) => ({
          item_name: q.audit_statement || q.clause,
          guidance_text: q.evidence_to_sight,
          is_required: true,
          section_id: q.section_id,
          question_id: q.id,
        }));
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
      status: 'accepted' | 'revision_requested';
      reviewNotes?: string;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase
        .from('evidence_request_items' as any)
        .update({
          status,
          review_notes: reviewNotes || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id,
        } as any)
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
        .from('evidence_requests' as any)
        .select('*, evidence_request_items(*)')
        .eq('tenant_id', tenantId)
        .not('audit_id', 'is', null)
        .in('status', ['sent', 'in_progress'])
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
      const { data: doc, error: docErr } = await supabase
        .from('portal_documents' as any)
        .insert({
          tenant_id: tenantId,
          file_name: file.name,
          storage_path: storagePath,
          file_size: file.size,
          file_type: file.type,
          direction: 'inbound',
          evidence_request_item_id: itemId,
          source: 'client_upload',
          is_client_visible: true,
          status: 'received',
          uploaded_by: user.id,
        } as any)
        .select('id')
        .single();
      if (docErr) throw docErr;

      // Update evidence_request_items
      const { error: updateErr } = await supabase
        .from('evidence_request_items' as any)
        .update({
          received_document_id: (doc as any).id,
          received_at: new Date().toISOString(),
          status: 'received',
        } as any)
        .eq('id', itemId);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-evidence-requests'] });
      queryClient.invalidateQueries({ queryKey: ['audit-evidence-requests'] });
      toast.success('Document uploaded successfully');
    },
    onError: (err: any) => {
      toast.error('Upload failed: ' + (err.message || 'Unknown error'));
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { ClientAuditReference, AuditReferenceSource, AuditReferenceOutcome } from '@/types/auditReferences';
import { useEffect, useRef } from 'react';

// Fetch references for a specific client
export function useClientAuditReferences(tenantId: number | undefined) {
  return useQuery({
    queryKey: ['audit-references', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_audit_references' as any)
        .select('*')
        .eq('subject_tenant_id', tenantId)
        .order('audit_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as unknown as ClientAuditReference[];
    },
  });
}

// Fetch all references across all clients (for dashboard)
export function useAllAuditReferences() {
  return useQuery({
    queryKey: ['audit-references-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_audit_references' as any)
        .select('*, tenants!client_audit_references_subject_tenant_id_fkey(name)')
        .order('audit_date', { ascending: false, nullsFirst: false });
      if (error) {
        // Fallback without join if FK name is wrong
        const { data: fallback, error: err2 } = await supabase
          .from('client_audit_references' as any)
          .select('*')
          .order('audit_date', { ascending: false, nullsFirst: false });
        if (err2) throw err2;
        return (fallback || []) as unknown as ClientAuditReference[];
      }
      return ((data || []) as any[]).map((d: any) => ({
        ...d,
        client_name: d.tenants?.name || null,
        tenants: undefined,
      })) as ClientAuditReference[];
    },
  });
}

interface CreateReferenceInput {
  subject_tenant_id: number;
  source: AuditReferenceSource;
  source_label?: string;
  audit_type?: string;
  audit_date?: string;
  audit_outcome?: AuditReferenceOutcome;
  auditor_name?: string;
  standards_framework?: string;
  notes?: string;
  file: File;
}

export function useCreateAuditReference() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateReferenceInput) => {
      const userId = session?.user?.id;
      const refId = crypto.randomUUID();
      const filePath = `${input.subject_tenant_id}/${refId}/${input.file.name}`;

      // Upload file
      const { error: uploadError } = await supabase.storage
        .from('audit-references')
        .upload(filePath, input.file);
      if (uploadError) throw new Error('File upload failed: ' + uploadError.message);

      // Insert record
      const { data, error } = await supabase
        .from('client_audit_references' as any)
        .insert({
          id: refId,
          subject_tenant_id: input.subject_tenant_id,
          source: input.source,
          source_label: input.source_label || null,
          audit_type: input.audit_type || null,
          audit_date: input.audit_date || null,
          audit_outcome: input.audit_outcome || null,
          auditor_name: input.auditor_name || null,
          standards_framework: input.standards_framework || null,
          file_name: input.file.name,
          file_path: filePath,
          file_size: input.file.size,
          mime_type: input.file.type || null,
          ai_status: 'none',
          notes: input.notes || null,
          uploaded_by: userId,
        } as any)
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as ClientAuditReference;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['audit-references', vars.subject_tenant_id] });
      queryClient.invalidateQueries({ queryKey: ['audit-references-all'] });
      toast.success('Reference uploaded successfully');
    },
    onError: (err: any) => {
      toast.error('Failed to upload reference: ' + (err.message || 'Unknown error'));
    },
  });
}

interface UpdateReferenceInput {
  id: string;
  subject_tenant_id: number;
  source?: AuditReferenceSource;
  source_label?: string | null;
  audit_type?: string | null;
  audit_date?: string | null;
  audit_outcome?: AuditReferenceOutcome | null;
  auditor_name?: string | null;
  standards_framework?: string | null;
  notes?: string | null;
}

export function useUpdateAuditReference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, subject_tenant_id, ...fields }: UpdateReferenceInput) => {
      const { error } = await supabase
        .from('client_audit_references' as any)
        .update(fields as any)
        .eq('id', id);
      if (error) throw error;
      return { id, subject_tenant_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['audit-references', data.subject_tenant_id] });
      queryClient.invalidateQueries({ queryKey: ['audit-references-all'] });
      toast.success('Reference updated');
    },
    onError: (err: any) => {
      toast.error('Failed to update reference: ' + (err.message || 'Unknown error'));
    },
  });
}

export function useDeleteAuditReference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, file_path, subject_tenant_id }: { id: string; file_path: string; subject_tenant_id: number }) => {
      // Delete file from storage
      await supabase.storage.from('audit-references').remove([file_path]);
      // Delete record
      const { error } = await supabase
        .from('client_audit_references' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { subject_tenant_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['audit-references', data.subject_tenant_id] });
      queryClient.invalidateQueries({ queryKey: ['audit-references-all'] });
      toast.success('Reference deleted');
    },
    onError: (err: any) => {
      toast.error('Failed to delete reference: ' + (err.message || 'Unknown error'));
    },
  });
}

export function useAnalyseAuditReference() {
  const queryClient = useQueryClient();
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  return useMutation({
    mutationFn: async ({ id, file_path, subject_tenant_id }: { id: string; file_path: string; subject_tenant_id: number }) => {
      // Set to pending
      await supabase
        .from('client_audit_references' as any)
        .update({ ai_status: 'pending' } as any)
        .eq('id', id);

      // Call edge function
      const { error } = await supabase.functions.invoke('analyze-document', {
        body: {
          reference_id: id,
          file_path,
          document_type: 'audit_report',
          context: 'historical_reference',
        },
      });

      if (error) {
        await supabase
          .from('client_audit_references' as any)
          .update({ ai_status: 'error' } as any)
          .eq('id', id);
        throw error;
      }

      // Update to processing
      await supabase
        .from('client_audit_references' as any)
        .update({ ai_status: 'processing' } as any)
        .eq('id', id);

      // Poll for completion
      return new Promise<void>((resolve, reject) => {
        let attempts = 0;
        pollingRef.current = setInterval(async () => {
          attempts++;
          if (attempts > 60) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            resolve(); // Don't reject, just stop polling
            return;
          }
          const { data } = await supabase
            .from('client_audit_references' as any)
            .select('ai_status')
            .eq('id', id)
            .single();
          const status = (data as any)?.ai_status;
          if (status === 'complete' || status === 'error') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            queryClient.invalidateQueries({ queryKey: ['audit-references', subject_tenant_id] });
            queryClient.invalidateQueries({ queryKey: ['audit-references-all'] });
            resolve();
          }
        }, 5000);
      });
    },
    onError: (err: any) => {
      toast.error('AI analysis failed: ' + (err.message || 'Unknown error'));
    },
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useReleaseReport(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ releaseNotes }: { releaseNotes?: string }) => {
      if (!auditId) throw new Error('No audit ID');
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase
        .rpc('release_audit_report', {
          p_audit_id: auditId,
          p_released_by: user?.id,
          p_release_notes: releaseNotes || null,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-audit', auditId] });
      toast.success('Report released to client');
    },
    onError: (err: any) => {
      toast.error('Failed to release report: ' + (err.message || 'Unknown error'));
    },
  });
}

export function useAcknowledgeReport(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!auditId) throw new Error('No audit ID');
      const { error } = await supabase
        .rpc('acknowledge_audit_report', { p_audit_id: auditId } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-audit-reports'] });
      queryClient.invalidateQueries({ queryKey: ['client-audit', auditId] });
      toast.success('Report acknowledged');
    },
  });
}

export function useRevokeReport(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!auditId) throw new Error('No audit ID');
      const { error } = await supabase
        .from('client_audits' as any)
        .update({ report_client_visible: false } as any)
        .eq('id', auditId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-audit', auditId] });
      toast.success('Client access revoked');
    },
  });
}

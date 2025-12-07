import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import type { Audit, AuditReport } from '@/types/audit';

export const useAudits = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: audits, isLoading } = useQuery({
    queryKey: ['audits', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit')
        .select('*, clients_legacy(name)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Audit[];
    },
    enabled: !!profile?.tenant_id,
  });

  const createAudit = useMutation({
    mutationFn: async ({ clientId }: { clientId: string }) => {
      const { data, error } = await supabase.rpc('create_audit', {
        p_tenant_id: profile!.tenant_id!,
        p_client_id: clientId,
        p_created_by: profile!.user_uuid,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audits'] });
      toast({ title: 'Audit created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating audit', description: error.message, variant: 'destructive' });
    },
  });

  const addResponse = useMutation({
    mutationFn: async ({
      questionId,
      rating,
      notes,
      riskLevel,
      tags,
    }: {
      questionId: number;
      rating: string;
      notes?: string;
      riskLevel: string;
      tags?: string[];
    }) => {
      const { data, error } = await supabase.rpc('add_audit_response', {
        p_audit_question_id: questionId,
        p_rating: rating,
        p_notes: notes,
        p_risk_level: riskLevel,
        p_tags: tags || [],
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-details'] });
      toast({ title: 'Response saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error saving response', description: error.message, variant: 'destructive' });
    },
  });

  const generateFindings = useMutation({
    mutationFn: async (auditId: number) => {
      const { data, error } = await supabase.rpc('generate_findings', {
        p_audit_id: auditId,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-details'] });
      toast({ title: 'Findings generated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error generating findings', description: error.message, variant: 'destructive' });
    },
  });

  const createAction = useMutation({
    mutationFn: async ({
      findingId,
      assignedTo,
      dueDate,
      description,
    }: {
      findingId: number;
      assignedTo: string;
      dueDate: string;
      description: string;
    }) => {
      const { data, error } = await supabase.rpc('create_audit_action', {
        p_finding_id: findingId,
        p_assigned_to: assignedTo,
        p_due_date: dueDate,
        p_description: description,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-details'] });
      toast({ title: 'Action created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating action', description: error.message, variant: 'destructive' });
    },
  });

  const updateAuditStatus = useMutation({
    mutationFn: async ({ auditId, status }: { auditId: number; status: string }) => {
      const { data, error } = await supabase
        .from('audit')
        .update({ 
          status,
          ...(status === 'in_progress' && { started_at: new Date().toISOString() }),
          ...(status === 'complete' && { completed_at: new Date().toISOString() })
        })
        .eq('id', auditId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audits'] });
      queryClient.invalidateQueries({ queryKey: ['audit-details'] });
      toast({ title: 'Audit status updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating status', description: error.message, variant: 'destructive' });
    },
  });

  return {
    audits,
    isLoading,
    createAudit,
    addResponse,
    generateFindings,
    createAction,
    updateAuditStatus,
  };
};

export const useAuditDetails = (auditId: number | undefined) => {
  const { data: auditReport, isLoading } = useQuery({
    queryKey: ['audit-details', auditId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_audit_report', {
        p_audit_id: auditId!,
      });
      
      if (error) throw error;
      return data as unknown as AuditReport;
    },
    enabled: !!auditId,
  });

  return { auditReport, isLoading };
};

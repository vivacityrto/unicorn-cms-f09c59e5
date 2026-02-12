import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ConsultantAssignmentInfo {
  assigned_consultant_user_id: string | null;
  consultant_assignment_method: string | null;
  client_onboarded_at: string | null;
  consultant_first_name?: string;
  consultant_last_name?: string;
  consultant_email?: string;
  consultant_job_title?: string | null;
}

export interface AssignmentAuditEntry {
  id: string;
  tenant_id: number;
  action: string;
  selected_consultant_user_id: string | null;
  previous_consultant_user_id: string | null;
  candidate_snapshot: any;
  new_client_weekly_required: number | null;
  onboarding_multiplier: number | null;
  selected_projected_remaining: number | null;
  over_capacity: boolean;
  reason: string | null;
  created_at: string;
  created_by: string | null;
}

export function useConsultantAssignment(tenantId: number | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch current assignment info from tenants table
  const { data: assignmentInfo, isLoading } = useQuery({
    queryKey: ['consultant-assignment', tenantId],
    queryFn: async (): Promise<ConsultantAssignmentInfo | null> => {
      if (!tenantId) return null;

      const { data, error } = await supabase
        .from('tenants')
        .select('assigned_consultant_user_id, consultant_assignment_method, client_onboarded_at')
        .eq('id', tenantId)
        .single();

      if (error) throw error;
      if (!data) return null;

      let consultantInfo: Partial<ConsultantAssignmentInfo> = {};

      if (data.assigned_consultant_user_id) {
        const { data: userData } = await supabase
          .from('users')
          .select('first_name, last_name, email, job_title')
          .eq('user_uuid', data.assigned_consultant_user_id)
          .single();

        if (userData) {
          consultantInfo = {
            consultant_first_name: userData.first_name,
            consultant_last_name: userData.last_name,
            consultant_email: userData.email,
            consultant_job_title: userData.job_title,
          };
        }
      }

      return {
        ...data,
        ...consultantInfo,
      } as ConsultantAssignmentInfo;
    },
    enabled: !!tenantId,
  });

  // Fetch tier info for capacity display
  const { data: tierInfo } = useQuery({
    queryKey: ['tenant-tier-info', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;

      const { data: tenant } = await supabase
        .from('tenants')
        .select('package_id, client_onboarded_at, created_at')
        .eq('id', tenantId)
        .single();

      if (!tenant?.package_id) return null;

      const { data: tier } = await supabase
        .from('membership_tier_capacity_config')
        .select('tier_label, weekly_required_hours')
        .contains('package_ids', [tenant.package_id])
        .maybeSingle();

      if (!tier) return null;

      // Calculate onboarding multiplier
      const onboardedAt = tenant.client_onboarded_at || tenant.created_at;
      const weeksSince = (Date.now() - new Date(onboardedAt).getTime()) / (7 * 24 * 60 * 60 * 1000);
      
      let multiplier = 1.0;
      if (weeksSince <= 4) multiplier = 2.0;
      else if (weeksSince <= 8) multiplier = 1.5;

      return {
        tier_label: tier.tier_label,
        weekly_required_hours: tier.weekly_required_hours,
        onboarding_multiplier: multiplier,
        effective_weekly_hours: tier.weekly_required_hours * multiplier,
      };
    },
    enabled: !!tenantId,
  });

  // Fetch latest audit entry
  const { data: latestAudit } = useQuery({
    queryKey: ['consultant-assignment-audit', tenantId],
    queryFn: async (): Promise<AssignmentAuditEntry | null> => {
      if (!tenantId) return null;

      const { data, error } = await supabase
        .from('consultant_assignment_audit_log')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as AssignmentAuditEntry | null;
    },
    enabled: !!tenantId,
  });

  // Auto-assign mutation (calls the RPC)
  const autoAssignMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('Tenant ID required');

      const { data, error } = await supabase.rpc('rpc_auto_assign_consultant', {
        p_tenant_id: tenantId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultant-assignment', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['consultant-assignment-audit', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenant-csc-assignment', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast({ title: 'Success', description: 'Consultant auto-assigned by capacity.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Manual override mutation
  const manualOverrideMutation = useMutation({
    mutationFn: async ({ consultantUserId, reason }: { consultantUserId: string; reason: string }) => {
      if (!tenantId) throw new Error('Tenant ID required');

      const previousConsultant = assignmentInfo?.assigned_consultant_user_id || null;

      // Update tenants table
      const { error: updateError } = await supabase
        .from('tenants')
        .update({
          assigned_consultant_user_id: consultantUserId,
          consultant_assignment_method: 'manual',
        } as any)
        .eq('id', tenantId);

      if (updateError) throw updateError;

      // Upsert CSC assignment
      const { error: cscError } = await supabase.rpc('admin_set_tenant_csc_assignment', {
        p_tenant_id: tenantId,
        p_csc_user_id: consultantUserId,
        p_is_primary: true,
        p_role_label: 'Primary CSC',
      });

      if (cscError) throw cscError;

      // Insert audit log
      const { error: auditError } = await supabase
        .from('consultant_assignment_audit_log')
        .insert({
          tenant_id: tenantId,
          action: 'manual_override',
          selected_consultant_user_id: consultantUserId,
          previous_consultant_user_id: previousConsultant,
          candidate_snapshot: [],
          reason,
          over_capacity: false,
        } as any);

      if (auditError) throw auditError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultant-assignment', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['consultant-assignment-audit', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenant-csc-assignment', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast({ title: 'Success', description: 'Consultant reassigned manually.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return {
    assignmentInfo,
    tierInfo,
    latestAudit,
    isLoading,
    autoAssign: () => autoAssignMutation.mutateAsync(),
    manualOverride: (consultantUserId: string, reason: string) =>
      manualOverrideMutation.mutateAsync({ consultantUserId, reason }),
    isAutoAssigning: autoAssignMutation.isPending,
    isOverriding: manualOverrideMutation.isPending,
  };
}

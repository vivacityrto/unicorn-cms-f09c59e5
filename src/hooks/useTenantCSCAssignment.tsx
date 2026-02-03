import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CSCUser {
  user_uuid: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string | null;
  avatar_url: string | null;
}

export interface CSCAssignment {
  id: number;
  tenant_id: number;
  csc_user_id: string;
  is_primary: boolean;
  role_label: string;
  assigned_since: string;
  user?: CSCUser;
}

export function useTenantCSCAssignment(tenantId: number | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch current CSC assignment from tenant_csc_assignments
  const { data: currentCSC, isLoading: isLoadingCSC } = useQuery({
    queryKey: ['tenant-csc-assignment', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;

      const { data, error } = await supabase
        .from('tenant_csc_assignments')
        .select('id, tenant_id, csc_user_id, is_primary, role_label, assigned_since')
        .eq('tenant_id', tenantId)
        .eq('is_primary', true)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      // Fetch user details
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email, job_title, avatar_url')
        .eq('user_uuid', data.csc_user_id)
        .single();

      if (userError) throw userError;

      return {
        id: data.id,
        tenant_id: data.tenant_id,
        csc_user_id: data.csc_user_id,
        is_primary: data.is_primary,
        role_label: data.role_label,
        assigned_since: data.assigned_since,
        user: userData as CSCUser,
      } as CSCAssignment;
    },
    enabled: !!tenantId,
  });

  // Fetch all Vivacity Team users (staff who can be assigned as CSC)
  const { data: availableCSCs = [], isLoading: isLoadingCSCs } = useQuery({
    queryKey: ['vivacity-team-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email, job_title, avatar_url')
        .eq('is_team', true)
        .eq('disabled', false)
        .eq('archived', false)
        .order('first_name', { ascending: true });
      
      if (error) throw error;
      return (data || []) as CSCUser[];
    },
  });

  // Assign CSC mutation
  const assignCSCMutation = useMutation({
    mutationFn: async ({ cscUserId, roleLabel = 'CSC' }: { cscUserId: string; roleLabel?: string }) => {
      if (!tenantId) throw new Error('Tenant ID is required');

      const { data, error } = await supabase.rpc('admin_set_tenant_csc_assignment', {
        p_tenant_id: tenantId,
        p_csc_user_id: cscUserId,
        p_is_primary: true,
        p_role_label: roleLabel,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-csc-assignment', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast({
        title: 'CSC Assigned',
        description: 'Client Success Champion has been assigned successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Remove CSC mutation
  const removeCSCMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId || !currentCSC?.csc_user_id) throw new Error('No CSC to remove');

      const { data, error } = await supabase.rpc('admin_remove_tenant_csc_assignment', {
        p_tenant_id: tenantId,
        p_csc_user_id: currentCSC.csc_user_id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-csc-assignment', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast({
        title: 'CSC Removed',
        description: 'Client Success Champion has been unassigned.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    currentCSC,
    availableCSCs,
    isLoading: isLoadingCSC || isLoadingCSCs,
    assignCSC: (cscUserId: string) => assignCSCMutation.mutateAsync({ cscUserId }),
    removeCSC: () => removeCSCMutation.mutateAsync(),
    isAssigning: assignCSCMutation.isPending,
    isRemoving: removeCSCMutation.isPending,
  };
}

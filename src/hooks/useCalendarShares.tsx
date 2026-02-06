import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface CalendarShare {
  id: string;
  owner_user_uuid: string;
  viewer_user_uuid: string;
  viewer_name: string;
  scope: 'busy_only' | 'details';
  created_at: string;
}

interface VivacityTeamMember {
  user_uuid: string;
  full_name: string;
  email: string;
}

export function useCalendarShares() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch shares I've created (where I am the owner)
  const { data: myShares = [], isLoading: isLoadingShares, refetch: refetchShares } = useQuery({
    queryKey: ['calendar-shares-owned', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('calendar_shares')
        .select(`
          id,
          owner_user_uuid,
          viewer_user_uuid,
          scope,
          created_at,
          viewer:users!calendar_shares_viewer_user_uuid_fkey (
            first_name,
            last_name,
            email
          )
        `)
        .eq('owner_user_uuid', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((share: any) => ({
        id: share.id,
        owner_user_uuid: share.owner_user_uuid,
        viewer_user_uuid: share.viewer_user_uuid,
        viewer_name: `${share.viewer?.first_name || ''} ${share.viewer?.last_name || ''}`.trim() || share.viewer?.email || 'Unknown',
        scope: share.scope as 'busy_only' | 'details',
        created_at: share.created_at,
      })) as CalendarShare[];
    },
    enabled: !!user?.id,
  });

  // Fetch Vivacity team members (for the share dropdown)
  const { data: teamMembers = [], isLoading: isLoadingTeam } = useQuery({
    queryKey: ['vivacity-team-members', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get Vivacity team members (those with Vivacity roles)
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email, unicorn_role')
        .in('unicorn_role', ['Super Admin', 'Team Leader', 'Team Member'])
        .neq('user_uuid', user.id) // Exclude self
        .order('first_name');

      if (error) throw error;

      return (data || []).map((member: any) => ({
        user_uuid: member.user_uuid,
        full_name: `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email || 'Unknown',
        email: member.email,
      })) as VivacityTeamMember[];
    },
    enabled: !!user?.id,
  });

  // Create a new share
  const createShareMutation = useMutation({
    mutationFn: async ({ viewerUserId, scope }: { viewerUserId: string; scope: 'busy_only' | 'details' }) => {
      if (!user?.id) throw new Error('Not authenticated');

      // Insert the share
      const { error: shareError } = await supabase
        .from('calendar_shares')
        .insert({
          owner_user_uuid: user.id,
          viewer_user_uuid: viewerUserId,
          scope,
          created_by: user.id,
        });

      if (shareError) throw shareError;

      // Log the audit event
      const { error: auditError } = await supabase
        .from('calendar_share_audit')
        .insert({
          action: 'share_created',
          owner_user_uuid: user.id,
          viewer_user_uuid: viewerUserId,
          performed_by: user.id,
          scope,
        });

      if (auditError) {
        console.error('Failed to log audit event:', auditError);
      }
    },
    onSuccess: () => {
      toast.success('Calendar shared successfully');
      queryClient.invalidateQueries({ queryKey: ['calendar-shares-owned'] });
    },
    onError: (error: any) => {
      console.error('Failed to share calendar:', error);
      if (error.code === '23505') {
        toast.error('Calendar already shared with this user');
      } else {
        toast.error('Failed to share calendar');
      }
    },
  });

  // Revoke a share
  const revokeShareMutation = useMutation({
    mutationFn: async (shareId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      // Get the share details for audit
      const { data: share } = await supabase
        .from('calendar_shares')
        .select('viewer_user_uuid, scope')
        .eq('id', shareId)
        .single();

      // Delete the share
      const { error: deleteError } = await supabase
        .from('calendar_shares')
        .delete()
        .eq('id', shareId)
        .eq('owner_user_uuid', user.id); // Ensure only owner can revoke

      if (deleteError) throw deleteError;

      // Log the audit event
      if (share) {
        const { error: auditError } = await supabase
          .from('calendar_share_audit')
          .insert({
            action: 'share_revoked',
            owner_user_uuid: user.id,
            viewer_user_uuid: share.viewer_user_uuid,
            performed_by: user.id,
            scope: share.scope,
          });

        if (auditError) {
          console.error('Failed to log audit event:', auditError);
        }
      }
    },
    onSuccess: () => {
      toast.success('Calendar share revoked');
      queryClient.invalidateQueries({ queryKey: ['calendar-shares-owned'] });
    },
    onError: (error) => {
      console.error('Failed to revoke share:', error);
      toast.error('Failed to revoke calendar share');
    },
  });

  // Get available team members (not already shared with)
  const availableTeamMembers = teamMembers.filter(
    (member) => !myShares.some((share) => share.viewer_user_uuid === member.user_uuid)
  );

  return {
    // Data
    myShares,
    teamMembers,
    availableTeamMembers,
    
    // Loading states
    isLoadingShares,
    isLoadingTeam,
    
    // Actions
    createShare: createShareMutation.mutate,
    revokeShare: revokeShareMutation.mutate,
    isCreatingShare: createShareMutation.isPending,
    isRevokingShare: revokeShareMutation.isPending,
    
    // Refetch
    refetchShares,
  };
}

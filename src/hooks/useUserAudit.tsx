import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

// Types for audit results
interface AuditSummary {
  orphan_auth_users: number;
  orphan_profiles: number;
  email_mismatches: number;
  duplicate_emails: number;
  users_without_membership: number;
  invalid_memberships: number;
  invitation_issues: number;
  generated_at: string;
  error?: string;
}

interface OrphanAuthUser {
  auth_user_id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  issue: string;
}

interface OrphanProfile {
  profile_id: number;
  profile_email: string | null;
  user_id: string | null;
  created_at: string;
  issue: string;
}

interface EmailMismatch {
  user_id: string;
  auth_email: string;
  profile_email: string | null;
  profile_id: number;
  issue: string;
}

interface DuplicateEmail {
  email_lower: string;
  count_profiles: number;
  count_auth: number;
  profile_ids: number[] | null;
  auth_ids: string[] | null;
}

interface UserWithoutMembership {
  user_id: string;
  email: string;
  profile_id: number;
  global_role: string | null;
  created_at: string;
  issue: string;
}

interface InvalidMembership {
  membership_id: string;
  user_id: string;
  tenant_id: number;
  role: string;
  status: string;
  issue: string;
}

interface InvitationIssue {
  invitation_id: string;
  email: string;
  tenant_id: number;
  status: string;
  unicorn_role: string | null;
  created_at: string;
  expires_at: string | null;
  issue: string;
}

interface RepairResult {
  action: string;
  dry_run: boolean;
  counts: Record<string, number>;
  rows_affected_sample: unknown[];
  errors: string | null;
  error?: string;
}

// Enhanced user audit data with computed flags
export interface UserAuditRecord {
  user_uuid: string;
  email: string;
  first_name: string;
  last_name: string;
  unicorn_role: string;
  user_type: string;
  tenant_id: number | null;
  tenant_name: string | null;
  disabled: boolean;
  archived: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  auth_user_exists: boolean;
  email_match: boolean | null;
  has_global_role: boolean;
  tenant_memberships_count: number;
  has_active_membership: boolean;
  has_parent_or_child: boolean;
  invitation_state: string | null;
  computed_status: string;
  issues: string[];
}

export interface UserAuditFilters {
  roleFilter: string | null;
  tenantFilter: number | null;
  statusFilter: string | null;
  search: string;
}

export function useUserAudit() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Filter state
  const [filters, setFilters] = useState<UserAuditFilters>({
    roleFilter: null,
    tenantFilter: null,
    statusFilter: null,
    search: '',
  });

  // Fetch enhanced user audit data
  const { 
    data: userAuditData, 
    isLoading: loadingUserAudit, 
    refetch: refetchUserAudit 
  } = useQuery({
    queryKey: ['user-audit-data', filters],
    queryFn: async (): Promise<UserAuditRecord[]> => {
      const { data, error } = await supabase.rpc('get_user_audit', {
        p_role_filter: filters.roleFilter,
        p_tenant_filter: filters.tenantFilter,
        p_status_filter: filters.statusFilter,
        p_search: filters.search || null,
      });
      if (error) throw error;
      return (data || []) as UserAuditRecord[];
    },
  });

  // Fetch audit summary
  const { data: summary, isLoading: loadingSummary, refetch: refetchSummary } = useQuery({
    queryKey: ['audit-summary'],
    queryFn: async (): Promise<AuditSummary> => {
      const { data, error } = await supabase.rpc('audit_summary');
      if (error) throw error;
      return data as unknown as AuditSummary;
    },
  });

  // Fetch orphan auth users
  const { data: orphanAuthUsers, isLoading: loadingOrphanAuth, refetch: refetchOrphanAuth } = useQuery({
    queryKey: ['audit-orphan-auth-users'],
    queryFn: async (): Promise<OrphanAuthUser[]> => {
      const { data, error } = await supabase.rpc('audit_orphan_auth_users');
      if (error) throw error;
      return (data || []) as OrphanAuthUser[];
    },
  });

  // Fetch orphan profiles
  const { data: orphanProfiles, isLoading: loadingOrphanProfiles, refetch: refetchOrphanProfiles } = useQuery({
    queryKey: ['audit-orphan-profiles'],
    queryFn: async (): Promise<OrphanProfile[]> => {
      const { data, error } = await supabase.rpc('audit_orphan_profiles');
      if (error) throw error;
      return (data || []) as OrphanProfile[];
    },
  });

  // Fetch email mismatches
  const { data: emailMismatches, isLoading: loadingEmailMismatches, refetch: refetchEmailMismatches } = useQuery({
    queryKey: ['audit-email-mismatches'],
    queryFn: async (): Promise<EmailMismatch[]> => {
      const { data, error } = await supabase.rpc('audit_email_mismatches');
      if (error) throw error;
      return (data || []) as EmailMismatch[];
    },
  });

  // Fetch duplicate emails
  const { data: duplicateEmails, isLoading: loadingDuplicateEmails, refetch: refetchDuplicateEmails } = useQuery({
    queryKey: ['audit-duplicate-emails'],
    queryFn: async (): Promise<DuplicateEmail[]> => {
      const { data, error } = await supabase.rpc('audit_duplicate_emails');
      if (error) throw error;
      return (data || []) as DuplicateEmail[];
    },
  });

  // Fetch users without membership
  const { data: usersWithoutMembership, isLoading: loadingUsersWithoutMembership, refetch: refetchUsersWithoutMembership } = useQuery({
    queryKey: ['audit-users-without-membership'],
    queryFn: async (): Promise<UserWithoutMembership[]> => {
      const { data, error } = await supabase.rpc('audit_users_without_membership');
      if (error) throw error;
      return (data || []) as UserWithoutMembership[];
    },
  });

  // Fetch invalid memberships
  const { data: invalidMemberships, isLoading: loadingInvalidMemberships, refetch: refetchInvalidMemberships } = useQuery({
    queryKey: ['audit-invalid-memberships'],
    queryFn: async (): Promise<InvalidMembership[]> => {
      const { data, error } = await supabase.rpc('audit_invalid_memberships');
      if (error) throw error;
      return (data || []) as InvalidMembership[];
    },
  });

  // Fetch invitation issues
  const { data: invitationIssues, isLoading: loadingInvitationIssues, refetch: refetchInvitationIssues } = useQuery({
    queryKey: ['audit-invitation-issues'],
    queryFn: async (): Promise<InvitationIssue[]> => {
      const { data, error } = await supabase.rpc('audit_invitation_issues');
      if (error) throw error;
      return (data || []) as InvitationIssue[];
    },
  });

  // Fetch tenants for filter dropdown
  const { data: tenants } = useQuery({
    queryKey: ['tenants-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Repair mutations
  const fixProfileLinkageMutation = useMutation({
    mutationFn: async (dryRun: boolean): Promise<RepairResult> => {
      const { data, error } = await supabase.rpc('admin_fix_profile_linkage', { dry_run: dryRun });
      if (error) throw error;
      return data as unknown as RepairResult;
    },
    onSuccess: (data, dryRun) => {
      if (!dryRun) {
        queryClient.invalidateQueries({ queryKey: ['audit-summary'] });
        queryClient.invalidateQueries({ queryKey: ['audit-orphan-profiles'] });
        queryClient.invalidateQueries({ queryKey: ['audit-email-mismatches'] });
        queryClient.invalidateQueries({ queryKey: ['user-audit-data'] });
        toast({
          title: 'Profile Linkage Fixed',
          description: `Linked ${data.counts.profiles_linked || 0} profiles, filled ${data.counts.emails_filled || 0} emails.`,
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const fixMembershipsMutation = useMutation({
    mutationFn: async (dryRun: boolean): Promise<RepairResult> => {
      const { data, error } = await supabase.rpc('admin_fix_memberships', { dry_run: dryRun });
      if (error) throw error;
      return data as unknown as RepairResult;
    },
    onSuccess: (data, dryRun) => {
      if (!dryRun) {
        queryClient.invalidateQueries({ queryKey: ['audit-summary'] });
        queryClient.invalidateQueries({ queryKey: ['audit-users-without-membership'] });
        queryClient.invalidateQueries({ queryKey: ['audit-invitation-issues'] });
        queryClient.invalidateQueries({ queryKey: ['user-audit-data'] });
        toast({
          title: 'Memberships Fixed',
          description: `Created ${data.counts.memberships_to_create || 0} memberships.`,
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const fixInvitationsMutation = useMutation({
    mutationFn: async (dryRun: boolean): Promise<RepairResult> => {
      const { data, error } = await supabase.rpc('admin_fix_invitations', { dry_run: dryRun });
      if (error) throw error;
      return data as unknown as RepairResult;
    },
    onSuccess: (data, dryRun) => {
      if (!dryRun) {
        queryClient.invalidateQueries({ queryKey: ['audit-summary'] });
        queryClient.invalidateQueries({ queryKey: ['audit-invitation-issues'] });
        queryClient.invalidateQueries({ queryKey: ['user-audit-data'] });
        toast({
          title: 'Invitations Fixed',
          description: `Expired ${data.counts.marked_expired || 0}, marked redundant ${data.counts.marked_redundant || 0}.`,
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Fix individual user linkage
  const fixUserLinkageMutation = useMutation({
    mutationFn: async (userUuid: string) => {
      const { data, error } = await supabase.rpc('admin_fix_user_linkage', { p_user_uuid: userUuid });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-audit-data'] });
      toast({
        title: 'User Fixed',
        description: 'User linkage has been repaired.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Set user role type
  const setRoleTypeMutation = useMutation({
    mutationFn: async ({ userUuid, roleType, tenantId }: { userUuid: string; roleType: string; tenantId?: number }) => {
      const { data, error } = await supabase.rpc('admin_set_role_type', { 
        p_user_uuid: userUuid,
        p_role_type: roleType,
        p_tenant_id: tenantId || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-audit-data'] });
      toast({
        title: 'Role Updated',
        description: 'User role has been updated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const refetchAll = () => {
    refetchSummary();
    refetchUserAudit();
    refetchOrphanAuth();
    refetchOrphanProfiles();
    refetchEmailMismatches();
    refetchDuplicateEmails();
    refetchUsersWithoutMembership();
    refetchInvalidMemberships();
    refetchInvitationIssues();
  };

  return {
    // Summary
    summary,
    loadingSummary,
    
    // Enhanced user audit data
    userAuditData,
    loadingUserAudit,
    
    // Filters
    filters,
    setFilters,
    tenants,
    
    // Detailed data
    orphanAuthUsers,
    orphanProfiles,
    emailMismatches,
    duplicateEmails,
    usersWithoutMembership,
    invalidMemberships,
    invitationIssues,
    
    // Loading states
    loadingOrphanAuth,
    loadingOrphanProfiles,
    loadingEmailMismatches,
    loadingDuplicateEmails,
    loadingUsersWithoutMembership,
    loadingInvalidMemberships,
    loadingInvitationIssues,
    
    // Mutations
    fixProfileLinkage: fixProfileLinkageMutation.mutateAsync,
    fixMemberships: fixMembershipsMutation.mutateAsync,
    fixInvitations: fixInvitationsMutation.mutateAsync,
    fixUserLinkage: fixUserLinkageMutation.mutateAsync,
    setRoleType: setRoleTypeMutation.mutateAsync,
    
    // Mutation states
    isFixingProfileLinkage: fixProfileLinkageMutation.isPending,
    isFixingMemberships: fixMembershipsMutation.isPending,
    isFixingInvitations: fixInvitationsMutation.isPending,
    isFixingUserLinkage: fixUserLinkageMutation.isPending,
    isSettingRoleType: setRoleTypeMutation.isPending,
    
    // Refetch all
    refetchAll,
  };
}
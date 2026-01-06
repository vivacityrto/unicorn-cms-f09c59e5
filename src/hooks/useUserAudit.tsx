import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

export function useUserAudit() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const refetchAll = () => {
    refetchSummary();
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
    
    // Mutation states
    isFixingProfileLinkage: fixProfileLinkageMutation.isPending,
    isFixingMemberships: fixMembershipsMutation.isPending,
    isFixingInvitations: fixInvitationsMutation.isPending,
    
    // Refetch all
    refetchAll,
  };
}

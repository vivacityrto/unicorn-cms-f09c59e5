import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export type ProcessCategory = 
  | 'eos' 
  | 'operations' 
  | 'compliance' 
  | 'client_delivery' 
  | 'sales_marketing' 
  | 'finance' 
  | 'hr_people' 
  | 'it_systems' 
  | 'governance' 
  | 'risk_management';
export type ProcessStatus = 'draft' | 'under_review' | 'approved' | 'archived';
export type ProcessAppliesTo = 'vivacity_internal' | 'all_clients' | 'specific_client';

export interface Process {
  id: string;
  tenant_id: number | null;
  title: string;
  short_description: string | null;
  category: ProcessCategory;
  tags: string[];
  owner_user_id: string | null;
  applies_to: ProcessAppliesTo;
  applies_to_package_id: number | null;
  status: ProcessStatus;
  content: Record<string, unknown>;
  purpose: string | null;
  scope: string | null;
  instructions: string | null;
  evidence_records: string | null;
  related_standards: string | null;
  version: number;
  review_date: string | null;
  approved_by: string | null;
  approved_at: string | null;
  reviewer_user_id: string | null;
  edit_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  // Joined fields
  owner?: {
    user_uuid: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
  };
  approver?: {
    user_uuid: string;
    first_name: string | null;
    last_name: string | null;
  };
}

export interface ProcessVersion {
  id: string;
  process_id: string;
  version: number;
  title: string;
  short_description: string | null;
  category: string;
  tags: string[];
  status: string;
  content: Record<string, unknown>;
  purpose: string | null;
  scope: string | null;
  instructions: string | null;
  evidence_records: string | null;
  related_standards: string | null;
  snapshot_data: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
}

export interface ProcessAuditEntry {
  id: string;
  process_id: string;
  action: string;
  actor_user_id: string | null;
  details: Record<string, unknown>;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
  actor?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  };
}

export interface CreateProcessInput {
  title: string;
  short_description?: string;
  category: ProcessCategory;
  tags?: string[];
  owner_user_id?: string;
  applies_to: ProcessAppliesTo;
  applies_to_package_id?: number;
  status?: ProcessStatus;
  purpose?: string;
  scope?: string;
  instructions?: string;
  evidence_records?: string;
  related_standards?: string;
  review_date?: string;
  reviewer_user_id?: string;
  tenant_id?: number;
}

export interface UpdateProcessInput extends Partial<CreateProcessInput> {
  id: string;
  edit_reason?: string;
}

const CATEGORY_LABELS: Record<ProcessCategory, string> = {
  eos: 'EOS',
  operations: 'Operations',
  compliance: 'Compliance',
  client_delivery: 'Client Delivery',
  sales_marketing: 'Sales & Marketing',
  finance: 'Finance',
  hr_people: 'HR & People',
  it_systems: 'IT & Systems',
  governance: 'Governance',
  risk_management: 'Risk Management',
};

const STATUS_LABELS: Record<ProcessStatus, string> = {
  draft: 'Draft',
  under_review: 'Under Review',
  approved: 'Approved',
  archived: 'Archived',
};

export const getCategoryLabel = (category: ProcessCategory): string => CATEGORY_LABELS[category] || category;
export const getStatusLabel = (status: ProcessStatus): string => STATUS_LABELS[status] || status;

export function useProcesses() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const processesQuery = useQuery({
    queryKey: ['processes'],
    queryFn: async (): Promise<Process[]> => {
      const { data, error } = await supabase
        .from('processes')
        .select(`
          *,
          owner:users!processes_owner_user_id_fkey(user_uuid, first_name, last_name, email),
          approver:users!processes_approved_by_fkey(user_uuid, first_name, last_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as Process[];
    },
    enabled: !!user,
  });

  const createProcess = useMutation({
    mutationFn: async (input: CreateProcessInput): Promise<Process> => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('processes')
        .insert({
          ...input,
          created_by: user.id,
          updated_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Log audit entry
      await supabase.from('process_audit_log').insert({
        process_id: data.id,
        action: 'created',
        actor_user_id: user.id,
        after_data: data,
      });

      return data as unknown as Process;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast({ title: 'Process created successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to create process', description: error.message, variant: 'destructive' });
    },
  });

  const updateProcess = useMutation({
    mutationFn: async ({ id, edit_reason, ...input }: UpdateProcessInput): Promise<Process> => {
      if (!user) throw new Error('Not authenticated');

      // Get current state for audit
      const { data: before } = await supabase
        .from('processes')
        .select('*')
        .eq('id', id)
        .single();

      // If process is approved, require edit reason and increment version
      let updateData: Record<string, unknown> = {
        ...input,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };

      if (before?.status === 'approved' && input.status !== 'archived') {
        if (!edit_reason) throw new Error('Edit reason required for approved processes');
        updateData = {
          ...updateData,
          edit_reason,
          version: (before.version || 1) + 1,
          status: 'draft', // Reset to draft when editing approved
        };

        // Create version snapshot
        await supabase.from('process_versions').insert({
          process_id: id,
          version: before.version,
          title: before.title,
          short_description: before.short_description,
          category: before.category,
          tags: before.tags,
          owner_user_id: before.owner_user_id,
          applies_to: before.applies_to,
          applies_to_package_id: before.applies_to_package_id,
          status: before.status,
          content: before.content,
          purpose: before.purpose,
          scope: before.scope,
          instructions: before.instructions,
          evidence_records: before.evidence_records,
          related_standards: before.related_standards,
          review_date: before.review_date,
          approved_by: before.approved_by,
          approved_at: before.approved_at,
          reviewer_user_id: before.reviewer_user_id,
          snapshot_data: before,
          created_by: user.id,
        });
      }

      const { data, error } = await supabase
        .from('processes')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Log audit entry
      await supabase.from('process_audit_log').insert({
        process_id: id,
        action: before?.status === 'approved' ? 'edit_requested' : 'updated',
        actor_user_id: user.id,
        before_data: before,
        after_data: data,
        reason: edit_reason,
      });

      return data as unknown as Process;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast({ title: 'Process updated successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to update process', description: error.message, variant: 'destructive' });
    },
  });

  const submitForReview = useMutation({
    mutationFn: async (processId: string): Promise<void> => {
      if (!user) throw new Error('Not authenticated');

      const { data: before } = await supabase
        .from('processes')
        .select('*')
        .eq('id', processId)
        .single();

      const { error } = await supabase
        .from('processes')
        .update({ status: 'under_review', updated_by: user.id })
        .eq('id', processId);

      if (error) throw error;

      await supabase.from('process_audit_log').insert({
        process_id: processId,
        action: 'submitted_for_review',
        actor_user_id: user.id,
        before_data: before,
        details: { submitted_at: new Date().toISOString() },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast({ title: 'Process submitted for review' });
    },
    onError: (error) => {
      toast({ title: 'Failed to submit for review', description: error.message, variant: 'destructive' });
    },
  });

  const approveProcess = useMutation({
    mutationFn: async (processId: string): Promise<void> => {
      if (!user) throw new Error('Not authenticated');

      const { data: before } = await supabase
        .from('processes')
        .select('*')
        .eq('id', processId)
        .single();

      const { error } = await supabase
        .from('processes')
        .update({
          status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq('id', processId);

      if (error) throw error;

      // Create version snapshot on approval
      if (before) {
        await supabase.from('process_versions').insert({
          process_id: processId,
          version: before.version,
          title: before.title,
          short_description: before.short_description,
          category: before.category,
          tags: before.tags,
          owner_user_id: before.owner_user_id,
          applies_to: before.applies_to,
          applies_to_package_id: before.applies_to_package_id,
          status: 'approved',
          content: before.content,
          purpose: before.purpose,
          scope: before.scope,
          instructions: before.instructions,
          evidence_records: before.evidence_records,
          related_standards: before.related_standards,
          review_date: before.review_date,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          reviewer_user_id: before.reviewer_user_id,
          snapshot_data: before,
          created_by: user.id,
        });
      }

      await supabase.from('process_audit_log').insert({
        process_id: processId,
        action: 'approved',
        actor_user_id: user.id,
        before_data: before,
        details: { approved_at: new Date().toISOString() },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast({ title: 'Process approved successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to approve process', description: error.message, variant: 'destructive' });
    },
  });

  const archiveProcess = useMutation({
    mutationFn: async (processId: string): Promise<void> => {
      if (!user) throw new Error('Not authenticated');

      const { data: before } = await supabase
        .from('processes')
        .select('*')
        .eq('id', processId)
        .single();

      const { error } = await supabase
        .from('processes')
        .update({ status: 'archived', updated_by: user.id })
        .eq('id', processId);

      if (error) throw error;

      await supabase.from('process_audit_log').insert({
        process_id: processId,
        action: 'archived',
        actor_user_id: user.id,
        before_data: before,
        details: { archived_at: new Date().toISOString() },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast({ title: 'Process archived' });
    },
    onError: (error) => {
      toast({ title: 'Failed to archive process', description: error.message, variant: 'destructive' });
    },
  });

  return {
    processes: processesQuery.data || [],
    isLoading: processesQuery.isLoading,
    error: processesQuery.error,
    refetch: processesQuery.refetch,
    createProcess,
    updateProcess,
    submitForReview,
    approveProcess,
    archiveProcess,
  };
}

export function useProcess(processId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['process', processId],
    queryFn: async (): Promise<Process | null> => {
      if (!processId) return null;

      const { data, error } = await supabase
        .from('processes')
        .select(`
          *,
          owner:users!processes_owner_user_id_fkey(user_uuid, first_name, last_name, email),
          approver:users!processes_approved_by_fkey(user_uuid, first_name, last_name)
        `)
        .eq('id', processId)
        .single();

      if (error) throw error;
      return data as unknown as Process;
    },
    enabled: !!user && !!processId,
  });
}

export function useProcessVersions(processId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['process-versions', processId],
    queryFn: async (): Promise<ProcessVersion[]> => {
      if (!processId) return [];

      const { data, error } = await supabase
        .from('process_versions')
        .select('*')
        .eq('process_id', processId)
        .order('version', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as ProcessVersion[];
    },
    enabled: !!user && !!processId,
  });
}

export function useProcessAuditLog(processId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['process-audit-log', processId],
    queryFn: async (): Promise<ProcessAuditEntry[]> => {
      if (!processId) return [];

      const { data, error } = await (supabase as any)
        .from('process_audit_log')
        .select(`
          *,
          actor:users!process_audit_log_actor_user_id_fkey(first_name, last_name, email)
        `)
        .eq('process_id', processId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as ProcessAuditEntry[];
    },
    enabled: !!user && !!processId,
  });
}

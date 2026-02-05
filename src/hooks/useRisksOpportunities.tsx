import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { useEosStatusTransitions, isValidStatusTransition, getAllowedStatusTransitions } from '@/hooks/useEosOptions';
import type { RiskOpportunity, RiskOpportunityStatus, RiskOpportunityCategory, RiskOpportunityImpact } from '@/types/risksOpportunities';

// Valid status enum values - must match eos_issue_status exactly
const VALID_STATUSES = ['Open', 'Discussing', 'Solved', 'Archived', 'In Review', 'Actioning', 'Escalated', 'Closed'] as const;

// Helper to capitalize first letter of each word for display
const capitalize = (str: string | undefined | null): string => {
  if (!str) return '';
  // Handle "in review" -> "In Review" and single words
  return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

// Transform database row to TypeScript type
// Note: status comes from DB in correct case (e.g., "In Review", "Escalated")
// Category and impact may be stored lowercase and need capitalization
const normalizeItem = (row: Record<string, unknown>): RiskOpportunity => ({
  ...row,
  category: row.category ? capitalize(row.category as string) as RiskOpportunityCategory : undefined,
  impact: row.impact ? capitalize(row.impact as string) as RiskOpportunityImpact : undefined,
  // Status enum values are already properly cased in DB - pass through directly
  status: row.status as RiskOpportunityStatus,
} as RiskOpportunity);

export const useRisksOpportunities = () => {
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = isSuperAdmin();
  
  // Check if user is Vivacity Team member (Super Admin, Team Leader, Team Member)
  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || ''
  );
  
  // Load status transitions for validation
  const { data: statusTransitions } = useEosStatusTransitions();

  const { data: items, isLoading } = useQuery({
    queryKey: ['risks-opportunities', isSuper || isVivacityTeam ? 'vivacity_team' : profile?.tenant_id],
    queryFn: async () => {
      let query = supabase
        .from('eos_issues')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Vivacity Team sees all; client users filter by tenant
      if (!isSuper && !isVivacityTeam && profile?.tenant_id) {
        query = query.eq('tenant_id', profile.tenant_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(normalizeItem);
    },
    enabled: isSuper || isVivacityTeam || !!profile?.tenant_id,
  });

  const createItem = useMutation({
    mutationFn: async (item: Partial<RiskOpportunity> & { 
      meeting_id?: string; 
      meeting_segment_id?: string;
      source?: string;
      why_it_matters?: string;
    }) => {
      const { data, error } = await supabase
        .from('eos_issues')
        .insert({
          tenant_id: profile?.tenant_id,
          item_type: item.item_type,
          title: item.title,
          description: item.description,
          why_it_matters: item.why_it_matters,
          category: item.category?.toLowerCase(),
          impact: item.impact?.toLowerCase(),
          // Omit status to use database default 'Open'
          quarter_number: item.quarter_number,
          quarter_year: item.quarter_year,
          linked_rock_id: item.linked_rock_id,
          assigned_to: item.assigned_to,
          meeting_id: item.meeting_id,
          meeting_segment_id: item.meeting_segment_id,
          source: item.source || 'ad_hoc',
          created_by: profile?.user_uuid,
        } as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risks-opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['meeting-issues'] });
      queryClient.invalidateQueries({ queryKey: ['eos-issues'] });
      toast({ title: 'Item created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating item', description: error.message, variant: 'destructive' });
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, currentStatus, ...updates }: Partial<RiskOpportunity> & { id: string; currentStatus?: string; escalation_reason?: string }) => {
      // Validate status value is a valid enum member
      if (updates.status !== undefined && !VALID_STATUSES.includes(updates.status as typeof VALID_STATUSES[number])) {
        throw new Error(`Invalid status value: "${updates.status}". Must be one of: ${VALID_STATUSES.join(', ')}`);
      }
      
      // Validate status transition if we have current status
      if (updates.status !== undefined && currentStatus) {
        if (!isValidStatusTransition(statusTransitions, currentStatus, updates.status)) {
          const allowed = getAllowedStatusTransitions(statusTransitions, currentStatus);
          throw new Error(
            `Invalid status transition: "${currentStatus}" → "${updates.status}". ` +
            `Allowed transitions from "${currentStatus}": ${allowed.length > 0 ? allowed.join(', ') : 'none'}`
          );
        }
      }

      const dbUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      
      if (updates.category !== undefined) dbUpdates.category = updates.category?.toLowerCase();
      if (updates.impact !== undefined) dbUpdates.impact = updates.impact?.toLowerCase();
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.why_it_matters !== undefined) dbUpdates.why_it_matters = updates.why_it_matters;
      if (updates.quarter_number !== undefined) dbUpdates.quarter_number = updates.quarter_number;
      if (updates.quarter_year !== undefined) dbUpdates.quarter_year = updates.quarter_year;
      if (updates.linked_rock_id !== undefined) dbUpdates.linked_rock_id = updates.linked_rock_id;
      if (updates.assigned_to !== undefined) dbUpdates.assigned_to = updates.assigned_to;
      if (updates.outcome_note !== undefined) dbUpdates.outcome_note = updates.outcome_note;
      if (updates.escalation_reason !== undefined) dbUpdates.escalation_reason = updates.escalation_reason;
      
      const { data, error } = await supabase
        .from('eos_issues')
        .update(dbUpdates as any)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risks-opportunities'] });
      toast({ title: 'Item updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating item', description: error.message, variant: 'destructive' });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('eos_issues')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risks-opportunities'] });
      toast({ title: 'Item deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting item', description: error.message, variant: 'destructive' });
    },
  });

  // Helper to get allowed next statuses for an item
  const getNextAllowedStatuses = (currentStatus: string): string[] => {
    return getAllowedStatusTransitions(statusTransitions, currentStatus);
  };

  return {
    items,
    isLoading,
    createItem,
    updateItem,
    deleteItem,
    getNextAllowedStatuses,
    statusTransitions,
  };
};

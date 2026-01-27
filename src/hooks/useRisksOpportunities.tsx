import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { RiskOpportunity, RiskOpportunityStatus, RiskOpportunityCategory, RiskOpportunityImpact } from '@/types/risksOpportunities';

// Helper to capitalize first letter of each word for display
const capitalize = (str: string | undefined | null): string => {
  if (!str) return '';
  // Handle "in review" -> "In Review" and single words
  return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

// Transform database row to properly-cased TypeScript type
const normalizeItem = (row: Record<string, unknown>): RiskOpportunity => ({
  ...row,
  category: row.category ? capitalize(row.category as string) as RiskOpportunityCategory : undefined,
  impact: row.impact ? capitalize(row.impact as string) as RiskOpportunityImpact : undefined,
  status: capitalize(row.status as string) as RiskOpportunityStatus,
} as RiskOpportunity);

export const useRisksOpportunities = () => {
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = isSuperAdmin();

  const { data: items, isLoading } = useQuery({
    queryKey: ['risks-opportunities', isSuper ? 'all' : profile?.tenant_id],
    queryFn: async () => {
      let query = supabase
        .from('eos_issues')
        .select('*')
        .order('created_at', { ascending: false });
      
      // SuperAdmins see all data; others filter by their tenant
      if (!isSuper && profile?.tenant_id) {
        query = query.eq('tenant_id', profile.tenant_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(normalizeItem);
    },
    enabled: isSuper || !!profile?.tenant_id,
  });

  const createItem = useMutation({
    mutationFn: async (item: Partial<RiskOpportunity> & { 
      meeting_id?: string; 
      meeting_segment_id?: string;
      source?: string;
    }) => {
      const { data, error } = await supabase
        .from('eos_issues')
        .insert({
          tenant_id: profile?.tenant_id,
          item_type: item.item_type,
          title: item.title,
          description: item.description,
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
    mutationFn: async ({ id, ...updates }: Partial<RiskOpportunity> & { id: string }) => {
      // Convert enum values to lowercase for database constraints
      const dbUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      
      if (updates.category !== undefined) dbUpdates.category = updates.category?.toLowerCase();
      if (updates.impact !== undefined) dbUpdates.impact = updates.impact?.toLowerCase();
      if (updates.status !== undefined) dbUpdates.status = updates.status?.toLowerCase();
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.quarter_number !== undefined) dbUpdates.quarter_number = updates.quarter_number;
      if (updates.quarter_year !== undefined) dbUpdates.quarter_year = updates.quarter_year;
      if (updates.linked_rock_id !== undefined) dbUpdates.linked_rock_id = updates.linked_rock_id;
      if (updates.assigned_to !== undefined) dbUpdates.assigned_to = updates.assigned_to;
      if (updates.outcome_note !== undefined) dbUpdates.outcome_note = updates.outcome_note;
      
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

  return {
    items,
    isLoading,
    createItem,
    updateItem,
    deleteItem,
  };
};

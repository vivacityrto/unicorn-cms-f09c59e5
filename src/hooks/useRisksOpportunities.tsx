import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { RiskOpportunity } from '@/types/risksOpportunities';

export const useRisksOpportunities = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ['risks-opportunities', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_issues')
        .select('*')
        .eq('tenant_id', profile?.tenant_id!)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as RiskOpportunity[];
    },
    enabled: !!profile?.tenant_id,
  });

  const createItem = useMutation({
    mutationFn: async (item: Partial<RiskOpportunity>) => {
      const { data, error } = await supabase
        .from('eos_issues')
        .insert({
          tenant_id: profile?.tenant_id,
          item_type: item.item_type,
          title: item.title,
          description: item.description,
          category: item.category,
          impact: item.impact,
          status: item.status || 'Open',
          quarter_number: item.quarter_number,
          quarter_year: item.quarter_year,
          linked_rock_id: item.linked_rock_id,
          assigned_to: item.assigned_to,
          created_by: profile?.user_uuid,
        } as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risks-opportunities'] });
      toast({ title: 'Item created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating item', description: error.message, variant: 'destructive' });
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RiskOpportunity> & { id: string }) => {
      const { data, error } = await supabase
        .from('eos_issues')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        } as any)
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

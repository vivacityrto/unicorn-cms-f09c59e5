import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface SuggestItem {
  id: string;
  tenant_id: number;
  suggest_item_type_id: string;
  suggest_status_id: string;
  suggest_priority_id: string;
  suggest_impact_rating_id: string;
  suggest_category_id: string | null;
  suggest_release_status_id: string;
  title: string;
  description: string;
  title_generated_by_ai: boolean;
  source_page_url: string | null;
  source_page_label: string | null;
  source_area: string | null;
  source_component: string | null;
  assigned_to: string | null;
  reported_by: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  release_version: string | null;
  release_notes: string | null;
  released_at: string | null;
  released_by: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string | null;
  // Joined data
  item_type?: { code: string; label: string } | null;
  status?: { code: string; label: string } | null;
  priority?: { code: string; label: string } | null;
  impact_rating?: { code: string; label: string } | null;
  category?: { code: string; label: string } | null;
  release_status?: { code: string; label: string } | null;
  reported_by_user?: { first_name: string | null; last_name: string | null; avatar_url: string | null } | null;
  assigned_to_user?: { first_name: string | null; last_name: string | null; avatar_url: string | null } | null;
  tenant?: { name: string } | null;
}

const SUGGEST_ITEMS_SELECT = `
  *,
  item_type:dd_suggest_item_type!suggest_items_suggest_item_type_id_fkey(code, label),
  status:dd_suggest_status!suggest_items_suggest_status_id_fkey(code, label),
  priority:dd_suggest_priority!suggest_items_suggest_priority_id_fkey(code, label),
  impact_rating:dd_suggest_impact_rating!suggest_items_suggest_impact_rating_id_fkey(code, label),
  category:dd_suggest_category!suggest_items_suggest_category_id_fkey(code, label),
  release_status:dd_suggest_release_status!suggest_items_suggest_release_status_id_fkey(code, label),
  reported_by_user:users!suggest_items_reported_by_fkey(first_name, last_name, avatar_url),
  assigned_to_user:users!suggest_items_assigned_to_fkey(first_name, last_name, avatar_url),
  tenant:tenants!suggest_items_tenant_id_fkey(name)
`;

export function useSuggestItems(filters?: {
  tenantId?: number;
  statusCode?: string;
  typeCode?: string;
  priorityCode?: string;
}) {
  return useQuery({
    queryKey: ['suggest-items', filters],
    queryFn: async (): Promise<SuggestItem[]> => {
      let query = supabase
        .from('suggest_items' as any)
        .select(SUGGEST_ITEMS_SELECT)
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false });

      if (filters?.tenantId) {
        query = query.eq('tenant_id', filters.tenantId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as SuggestItem[];
    },
  });
}

export function useSuggestItem(id: string | undefined) {
  return useQuery({
    queryKey: ['suggest-item', id],
    queryFn: async (): Promise<SuggestItem | null> => {
      const { data, error } = await supabase
        .from('suggest_items' as any)
        .select(SUGGEST_ITEMS_SELECT)
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as SuggestItem | null;
    },
    enabled: !!id,
  });
}

export function useCreateSuggestItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: Record<string, any>) => {
      const { data, error } = await supabase
        .from('suggest_items' as any)
        .insert(item)
        .select('id')
        .single();
      if (error) throw error;
      return data as unknown as { id: string };
    },
    onSuccess: () => {
      toast({ title: 'Suggestion created' });
      queryClient.invalidateQueries({ queryKey: ['suggest-items'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to create suggestion', description: err.message, variant: 'destructive' });
    },
  });
}

export function useReleasedSuggestItems() {
  return useQuery({
    queryKey: ['suggest-items-released'],
    queryFn: async (): Promise<SuggestItem[]> => {
      const { data, error } = await supabase
        .from('suggest_items' as any)
        .select(SUGGEST_ITEMS_SELECT)
        .eq('is_deleted', false)
        .not('released_at', 'is', null)
        .order('released_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as SuggestItem[];
    },
  });
}

export function useUpdateSuggestItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Record<string, any> & { id: string }) => {
      const { error } = await supabase
        .from('suggest_items' as any)
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast({ title: 'Suggestion updated' });
      queryClient.invalidateQueries({ queryKey: ['suggest-items'] });
      queryClient.invalidateQueries({ queryKey: ['suggest-item', variables.id] });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to update suggestion', description: err.message, variant: 'destructive' });
    },
  });
}

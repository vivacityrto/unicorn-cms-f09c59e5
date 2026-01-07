import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface MyWorkItem {
  action_item_id: string;
  client_id: string;
  client_name: string;
  tenant_id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
  source: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
  is_overdue: boolean;
}

export function useMyWork() {
  const [items, setItems] = useState<MyWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { profile } = useAuth();

  const fetchItems = useCallback(async (statusFilter: string = 'open') => {
    if (!profile?.user_uuid) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('rpc_get_my_action_items', {
        p_user_id: profile.user_uuid,
        p_status_filter: statusFilter,
        p_include_overdue: true
      });

      if (error) throw error;

      setItems((data || []) as MyWorkItem[]);
    } catch (error: any) {
      console.error('Error fetching my work items:', error);
      toast({
        title: 'Error',
        description: 'Failed to load your action items',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [profile?.user_uuid, toast]);

  const setStatus = useCallback(async (itemId: string, status: string, clientId: string, tenantId: number) => {
    try {
      const { data: result, error } = await supabase.rpc('rpc_set_action_item_status', {
        p_action_item_id: itemId,
        p_status: status
      });

      if (error) throw error;

      const res = result as { success: boolean; error?: string };
      if (!res.success) {
        throw new Error(res.error || 'Failed to update status');
      }

      toast({ title: status === 'done' ? 'Action item completed' : 'Status updated' });
      
      // Update local state
      setItems(prev => prev.map(item => 
        item.action_item_id === itemId 
          ? { ...item, status: status as MyWorkItem['status'] }
          : item
      ).filter(item => {
        // Remove done/cancelled items from open view
        if (status === 'done' || status === 'cancelled') {
          return item.action_item_id !== itemId;
        }
        return true;
      }));
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  }, [toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Computed lists
  const overdueItems = items.filter(item => item.is_overdue);
  const dueSoonItems = items.filter(item => {
    if (!item.due_date || item.is_overdue) return false;
    const dueDate = new Date(item.due_date);
    const today = new Date();
    const weekFromNow = new Date();
    weekFromNow.setDate(today.getDate() + 7);
    return dueDate >= today && dueDate <= weekFromNow;
  });
  const allOpenItems = items.filter(item => 
    item.status === 'open' || item.status === 'in_progress' || item.status === 'blocked'
  );

  return {
    items,
    overdueItems,
    dueSoonItems,
    allOpenItems,
    loading,
    refresh: fetchItems,
    setStatus
  };
}

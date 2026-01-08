import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

// =============================================
// Types
// =============================================

export type ItemType = 'internal' | 'client';
export type ItemStatus = 'todo' | 'in_progress' | 'blocked' | 'waiting_client' | 'done' | 'cancelled';
export type ItemPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface WorkboardItem {
  id: string;
  tenant_id: number;
  client_id: string;
  package_id: number | null;
  stage_id: number | null;
  title: string;
  description: string | null;
  item_type: ItemType;
  status: ItemStatus;
  priority: ItemPriority;
  assignee_user_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  sort_order: number;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  assignee?: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
  package?: {
    id: number;
    name: string;
  };
  stage?: {
    id: number;
    name: string;
  };
}

export interface WorkboardComment {
  id: string;
  tenant_id: number;
  action_item_id: string;
  body: string;
  created_by: string | null;
  created_at: string;
  creator?: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

export interface WorkboardFilters {
  status?: ItemStatus[];
  assignee?: string;
  itemType?: ItemType;
  dueFilter?: 'overdue' | 'this_week' | 'all';
  packageId?: number;
  stageId?: number;
  search?: string;
}

// =============================================
// Status helpers
// =============================================

export const STATUS_CONFIG: Record<ItemStatus, { label: string; color: string }> = {
  todo: { label: 'To Do', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  blocked: { label: 'Blocked', color: 'bg-red-100 text-red-700 border-red-200' },
  waiting_client: { label: 'Waiting Client', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  done: { label: 'Done', color: 'bg-green-100 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground border-muted' }
};

export const PRIORITY_CONFIG: Record<ItemPriority, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-slate-100 text-slate-600' },
  medium: { label: 'Medium', color: 'bg-blue-100 text-blue-700' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700' }
};

export const KANBAN_COLUMNS: ItemStatus[] = ['todo', 'in_progress', 'blocked', 'waiting_client', 'done'];

// =============================================
// Hook
// =============================================

export function useClientWorkboard(tenantId: number | null, clientId: number | null) {
  const [items, setItems] = useState<WorkboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<WorkboardFilters>({});
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch items
  const fetchItems = useCallback(async () => {
    if (!tenantId || !clientId) return;

    setLoading(true);
    try {
      let query = supabase
        .from('client_action_items')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('client_id', clientId.toString())
        .neq('status', 'cancelled')
        .order('sort_order', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }
      if (filters.assignee) {
        query = query.eq('assignee_user_id', filters.assignee);
      }
      if (filters.itemType) {
        query = query.eq('item_type', filters.itemType);
      }
      if (filters.packageId) {
        query = query.eq('package_id', filters.packageId);
      }
      if (filters.stageId) {
        query = query.eq('stage_id', filters.stageId);
      }
      if (filters.search) {
        query = query.ilike('title', `%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch assignee info
      const assigneeIds = [...new Set((data || []).map(i => i.assignee_user_id).filter(Boolean))];
      let assigneesMap = new Map();

      if (assigneeIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('user_uuid, first_name, last_name, avatar_url')
          .in('user_uuid', assigneeIds);
        assigneesMap = new Map(users?.map(u => [u.user_uuid, u]) || []);
      }

      // Fetch package info
      const packageIds = [...new Set((data || []).map(i => i.package_id).filter(Boolean))];
      let packagesMap = new Map();

      if (packageIds.length > 0) {
        const { data: packages } = await supabase
          .from('packages')
          .select('id, name')
          .in('id', packageIds);
        packagesMap = new Map(packages?.map(p => [p.id, p]) || []);
      }

      // Fetch stage info
      const stageIds = [...new Set((data || []).map(i => i.stage_id).filter(Boolean))];
      let stagesMap = new Map();

      if (stageIds.length > 0) {
        const { data: stages } = await supabase
          .from('documents_stages')
          .select('id, stage_name')
          .in('id', stageIds);
        stagesMap = new Map(stages?.map(s => [s.id, { id: s.id, name: s.stage_name }]) || []);
      }

      const itemsWithRelations: WorkboardItem[] = (data || []).map(item => ({
        ...item,
        item_type: ((item as any).item_type || 'internal') as ItemType,
        status: (item.status || 'todo') as ItemStatus,
        priority: (item.priority || 'medium') as ItemPriority,
        tags: (item as any).tags || [],
        assignee: assigneesMap.get(item.assignee_user_id),
        package: packagesMap.get(item.package_id),
        stage: stagesMap.get(item.stage_id)
      }));

      setItems(itemsWithRelations);
    } catch (error: any) {
      console.error('Error fetching workboard items:', error);
      toast({
        title: 'Error',
        description: 'Failed to load workboard items',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, clientId, filters, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Create item
  const createItem = useCallback(async (data: {
    title: string;
    description?: string;
    item_type?: ItemType;
    status?: ItemStatus;
    priority?: ItemPriority;
    assignee_user_id?: string;
    due_date?: string;
    package_id?: number;
    stage_id?: number;
    tags?: string[];
  }) => {
    if (!tenantId || !clientId) return null;

    try {
      const { data: result, error } = await supabase
        .from('client_action_items')
        .insert({
          tenant_id: tenantId,
          client_id: clientId.toString(),
          title: data.title,
          description: data.description || null,
          item_type: data.item_type || 'internal',
          status: data.status || 'todo',
          priority: data.priority || 'medium',
          assignee_user_id: data.assignee_user_id || null,
          due_date: data.due_date || null,
          package_id: data.package_id || null,
          stage_id: data.stage_id || null,
          tags: data.tags || [],
          created_by: user?.id || null
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: 'Action item created' });
      fetchItems();
      return result;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return null;
    }
  }, [tenantId, clientId, user, toast, fetchItems]);

  // Update item
  const updateItem = useCallback(async (
    itemId: string, 
    updates: Partial<Pick<WorkboardItem, 'title' | 'description' | 'status' | 'priority' | 'assignee_user_id' | 'due_date' | 'package_id' | 'stage_id' | 'sort_order' | 'tags' | 'item_type'>>
  ) => {
    try {
      // If completing, set completed fields
      const finalUpdates: any = { ...updates };
      if (updates.status === 'done') {
        finalUpdates.completed_at = new Date().toISOString();
        finalUpdates.completed_by = user?.id;
      } else if (updates.status && updates.status !== 'done') {
        finalUpdates.completed_at = null;
        finalUpdates.completed_by = null;
      }

      const { error } = await supabase
        .from('client_action_items')
        .update(finalUpdates)
        .eq('id', itemId);

      if (error) throw error;

      // Optimistic update
      setItems(prev => prev.map(item => 
        item.id === itemId ? { ...item, ...finalUpdates } : item
      ));

      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      fetchItems(); // Refetch on error
      return false;
    }
  }, [user, toast, fetchItems]);

  // Update status (convenience method for drag-drop)
  const updateStatus = useCallback(async (itemId: string, status: ItemStatus) => {
    return updateItem(itemId, { status });
  }, [updateItem]);

  // Delete item
  const deleteItem = useCallback(async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('client_action_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      toast({ title: 'Action item deleted' });
      setItems(prev => prev.filter(i => i.id !== itemId));
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return false;
    }
  }, [toast]);

  // Reorder items in a column
  const reorderItems = useCallback(async (itemId: string, newIndex: number, status: ItemStatus) => {
    const columnItems = items.filter(i => i.status === status);
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    // Calculate new sort_order based on position
    let newSortOrder: number;
    if (newIndex === 0) {
      newSortOrder = (columnItems[0]?.sort_order || 0) - 1;
    } else if (newIndex >= columnItems.length) {
      newSortOrder = (columnItems[columnItems.length - 1]?.sort_order || 0) + 1;
    } else {
      const prevOrder = columnItems[newIndex - 1]?.sort_order || 0;
      const nextOrder = columnItems[newIndex]?.sort_order || prevOrder + 2;
      newSortOrder = Math.floor((prevOrder + nextOrder) / 2);
    }

    await updateItem(itemId, { sort_order: newSortOrder, status });
  }, [items, updateItem]);

  // Stats
  const stats = {
    total: items.length,
    todo: items.filter(i => i.status === 'todo').length,
    inProgress: items.filter(i => i.status === 'in_progress').length,
    blocked: items.filter(i => i.status === 'blocked').length,
    waitingClient: items.filter(i => i.status === 'waiting_client').length,
    done: items.filter(i => (i.status as string) === 'done').length,
    overdue: items.filter(i =>
      i.due_date && 
      new Date(i.due_date) < new Date() && 
      !['done', 'cancelled'].includes(i.status)
    ).length
  };

  return {
    items,
    loading,
    filters,
    setFilters,
    stats,
    refresh: fetchItems,
    createItem,
    updateItem,
    updateStatus,
    deleteItem,
    reorderItems
  };
}

// =============================================
// Comments Hook
// =============================================

export function useWorkboardComments(actionItemId: string | null) {
  const [comments, setComments] = useState<WorkboardComment[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchComments = useCallback(async () => {
    if (!actionItemId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_action_item_comments')
        .select('*')
        .eq('action_item_id', actionItemId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch creators
      const creatorIds = [...new Set((data || []).map(c => c.created_by).filter(Boolean))];
      let creatorsMap = new Map();

      if (creatorIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('user_uuid, first_name, last_name, avatar_url')
          .in('user_uuid', creatorIds);
        creatorsMap = new Map(users?.map(u => [u.user_uuid, u]) || []);
      }

      setComments((data || []).map(c => ({
        ...c,
        creator: creatorsMap.get(c.created_by)
      })));
    } catch (error: any) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  }, [actionItemId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const addComment = useCallback(async (body: string, tenantId: number) => {
    if (!actionItemId || !body.trim()) return null;

    try {
      const { data, error } = await supabase
        .from('client_action_item_comments')
        .insert({
          tenant_id: tenantId,
          action_item_id: actionItemId,
          body: body.trim(),
          created_by: user?.id || null
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: 'Comment added' });
      fetchComments();
      return data;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return null;
    }
  }, [actionItemId, user, toast, fetchComments]);

  return {
    comments,
    loading,
    refresh: fetchComments,
    addComment
  };
}

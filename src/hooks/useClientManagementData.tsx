import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// =============================================
// Types
// =============================================

export interface TimelineEvent {
  id: string;
  tenant_id: number;
  client_id: string;
  created_at: string;
  occurred_at: string;
  created_by: string | null;
  source: 'system' | 'user' | 'microsoft';
  event_type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  package_id: number | null;
  visibility: 'internal' | 'client';
  creator?: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

export interface ClientNote {
  id: string;
  tenant_id: number;
  client_id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  note_type: 'meeting' | 'decision' | 'risk' | 'follow_up' | 'escalation' | 'general';
  title: string | null;
  content: string;
  tags: string[];
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_pinned: boolean;
  creator?: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

export interface ActionItem {
  id: string;
  tenant_id: number;
  client_id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  title: string;
  description: string | null;
  owner_user_id: string | null;
  due_date: string | null;
  status: 'open' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  source: 'manual' | 'note' | 'stage_rule' | 'system';
  source_note_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  recurrence_rule: string | null;
  completed_at: string | null;
  completed_by: string | null;
  owner?: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
  creator?: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

// =============================================
// Timeline Hook
// =============================================

const EVENT_TYPE_FILTERS: Record<string, string[]> = {
  all: [],
  meetings: ['meeting_synced', 'meeting_attendance_imported', 'meeting_artifacts_captured', 'minutes_draft_created', 'minutes_draft_updated', 'minutes_published_pdf'],
  time: ['time_posted', 'time_ignored'],
  tasks: ['task_completed_team', 'task_completed_client', 'tasks_created_from_minutes', 'action_item_created', 'action_item_updated', 'action_item_completed'],
  emails: ['email_sent', 'email_failed', 'email_linked', 'email_attachment_saved'],
  docs: ['document_uploaded', 'document_downloaded', 'document_shared_to_client', 'sharepoint_doc_linked', 'sharepoint_root_configured', 'sharepoint_root_invalid'],
  notes: ['note_added', 'note_created', 'note_pinned', 'note_unpinned'],
  microsoft: [
    'microsoft_connected', 'microsoft_disconnected', 'microsoft_sync_failed',
    'sharepoint_doc_linked', 'sharepoint_root_configured', 'sharepoint_root_invalid',
    'meeting_synced', 'meeting_attendance_imported', 'meeting_artifacts_captured',
    'minutes_draft_created', 'minutes_draft_updated', 'minutes_published_pdf',
    'tasks_created_from_minutes',
    'email_linked', 'email_attachment_saved',
  ],
};

export interface PinnedNote {
  id: string;
  title: string | null;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
  note_type: string;
  creator?: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export function useClientTimeline(tenantId: number | null, clientId: string | null) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [pinnedNotes, setPinnedNotes] = useState<PinnedNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const { toast } = useToast();

  const fetchPinnedNotes = useCallback(async () => {
    if (!tenantId || !clientId) return;
    
    try {
      const { data, error } = await supabase
        .from('client_notes')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('client_id', clientId)
        .eq('is_pinned', true)
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      
      // Fetch creators
      const creatorIds = [...new Set((data || []).map(n => n.created_by).filter(Boolean))];
      let creatorsMap = new Map();
      
      if (creatorIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('user_uuid, first_name, last_name, avatar_url')
          .in('user_uuid', creatorIds);
        creatorsMap = new Map(users?.map(u => [u.user_uuid, u]) || []);
      }
      
      setPinnedNotes((data || []).map(note => ({
        ...note,
        creator: creatorsMap.get(note.created_by)
      })));
    } catch (error) {
      console.error('Error fetching pinned notes:', error);
    }
  }, [tenantId, clientId]);

  const fetchEvents = useCallback(async (
    limit = 30,
    offset = 0
  ) => {
    if (!tenantId || !clientId) return;

    setLoading(true);
    try {
      const eventTypes = filter !== 'all' ? EVENT_TYPE_FILTERS[filter] || null : null;
      // For 'microsoft' filter, also pass source filter
      const sourceFilter = filter === 'microsoft' ? 'microsoft' : null;
      
      const { data, error } = await supabase.rpc('rpc_search_timeline_events', {
        p_tenant_id: Number(tenantId),
        p_client_id: Number(clientId),
        p_search: search || null,
        p_event_types: eventTypes,
        p_limit: limit,
        p_offset: offset,
        p_from_date: dateRange.from?.toISOString() || null,
        p_to_date: dateRange.to?.toISOString() || null,
        p_source: sourceFilter,
        p_package_id: null,
        p_visibility: null  // RLS handles visibility; null = return all allowed rows
      });

      if (error) throw error;

      // Fetch creator info
      const creatorIds = [...new Set((data || []).map((e: any) => e.created_by).filter(Boolean))];
      let creatorsMap = new Map();
      
      if (creatorIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('user_uuid, first_name, last_name, avatar_url')
          .in('user_uuid', creatorIds);
        
        creatorsMap = new Map(users?.map(u => [u.user_uuid, u]) || []);
      }

      const eventsWithCreators = (data || []).map((event: any) => ({
        ...event,
        metadata: event.metadata as Record<string, unknown>,
        creator: creatorsMap.get(event.created_by)
      })) as TimelineEvent[];

      if (offset === 0) {
        setEvents(eventsWithCreators);
      } else {
        setEvents(prev => [...prev, ...eventsWithCreators]);
      }
      
      setHasMore((data?.length || 0) === limit);
    } catch (error: any) {
      console.error('Error fetching timeline:', error);
      toast({
        title: 'Error',
        description: 'Failed to load timeline',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, clientId, filter, search, dateRange, toast]);

  useEffect(() => {
    fetchEvents();
    fetchPinnedNotes();
  }, [fetchEvents, fetchPinnedNotes]);

  const addQuickNote = useCallback(async (title: string, content: string) => {
    if (!tenantId || !clientId) return false;

    try {
      const { error } = await supabase.rpc('rpc_create_client_note', {
        p_tenant_id: tenantId,
        p_client_id: clientId,
        p_note_type: 'general',
        p_title: title,
        p_content: content,
        p_tags: [],
        p_related_entity_type: null,
        p_related_entity_id: null,
        p_is_pinned: false
      });

      if (error) throw error;
      
      toast({ title: 'Note added' });
      fetchEvents();
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return false;
    }
  }, [tenantId, clientId, toast, fetchEvents]);

  const toggleNotePin = useCallback(async (noteId: string, isPinned: boolean) => {
    try {
      const { data, error } = await supabase.rpc('rpc_toggle_client_note_pin', {
        p_note_id: noteId,
        p_is_pinned: isPinned
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to update pin status');
      }
      
      toast({ title: isPinned ? 'Note pinned' : 'Note unpinned' });
      fetchEvents();
      fetchPinnedNotes();
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return false;
    }
  }, [toast, fetchEvents, fetchPinnedNotes]);

  return {
    events,
    pinnedNotes,
    loading,
    hasMore,
    filter,
    setFilter,
    search,
    setSearch,
    dateRange,
    setDateRange,
    refresh: () => { fetchEvents(); fetchPinnedNotes(); },
    loadMore: (offset: number) => fetchEvents(30, offset),
    addQuickNote,
    toggleNotePin
  };
}

// =============================================
// Notes Hook
// =============================================

export function useClientNotes(tenantId: number | null, clientId: string | null) {
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchNotes = useCallback(async () => {
    if (!tenantId || !clientId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_notes')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('client_id', clientId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch creator info
      const creatorIds = [...new Set((data || []).map(n => n.created_by))];
      let creatorsMap = new Map();
      
      if (creatorIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('user_uuid, first_name, last_name, avatar_url')
          .in('user_uuid', creatorIds);
        
        creatorsMap = new Map(users?.map(u => [u.user_uuid, u]) || []);
      }

      const notesWithCreators = (data || []).map(note => ({
        ...note,
        creator: creatorsMap.get(note.created_by)
      })) as ClientNote[];

      setNotes(notesWithCreators);
    } catch (error: any) {
      console.error('Error fetching notes:', error);
      toast({
        title: 'Error',
        description: 'Failed to load notes',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, clientId, toast]);

  const createNote = useCallback(async (data: {
    note_type: string;
    title?: string;
    content: string;
    tags?: string[];
    related_entity_type?: string;
    related_entity_id?: string;
    is_pinned?: boolean;
  }) => {
    if (!tenantId || !clientId) return null;

    try {
      const { data: result, error } = await supabase.rpc('rpc_create_client_note', {
        p_tenant_id: tenantId,
        p_client_id: clientId,
        p_note_type: data.note_type,
        p_title: data.title || null,
        p_content: data.content,
        p_tags: data.tags || [],
        p_related_entity_type: data.related_entity_type || null,
        p_related_entity_id: data.related_entity_id || null,
        p_is_pinned: data.is_pinned || false
      });

      if (error) throw error;

      const res = result as { success: boolean; note_id?: string; error?: string };
      if (!res.success) {
        throw new Error(res.error || 'Failed to create note');
      }

      toast({ title: 'Note created' });
      fetchNotes();
      return res.note_id;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return null;
    }
  }, [tenantId, clientId, toast, fetchNotes]);

  const updateNote = useCallback(async (noteId: string, updates: Partial<ClientNote>) => {
    try {
      const { data: result, error } = await supabase.rpc('rpc_update_client_note', {
        p_note_id: noteId,
        p_updates: updates
      });

      if (error) throw error;

      const res = result as { success: boolean; error?: string };
      if (!res.success) {
        throw new Error(res.error || 'Failed to update note');
      }

      toast({ title: 'Note updated' });
      fetchNotes();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  }, [toast, fetchNotes]);

  const deleteNote = useCallback(async (noteId: string) => {
    try {
      const { error } = await supabase
        .from('client_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;

      toast({ title: 'Note deleted' });
      fetchNotes();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  }, [toast, fetchNotes]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  return {
    notes,
    loading,
    refresh: fetchNotes,
    createNote,
    updateNote,
    deleteNote
  };
}

// =============================================
// Action Items Hook
// =============================================

export function useClientActionItems(tenantId: number | null, clientId: string | null) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchItems = useCallback(async (filter?: {
    status?: string;
    owner?: string;
    overdue?: boolean;
  }) => {
    if (!tenantId || !clientId) return;

    setLoading(true);
    try {
      let query = supabase
        .from('client_action_items')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('client_id', clientId)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false });

      if (filter?.status && filter.status !== 'all') {
        query = query.eq('status', filter.status);
      }
      
      if (filter?.owner) {
        query = query.eq('owner_user_id', filter.owner);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch owner and creator info
      const userIds = [...new Set([
        ...(data || []).map(i => i.owner_user_id).filter(Boolean),
        ...(data || []).map(i => i.created_by)
      ])];
      
      let usersMap = new Map();
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('user_uuid, first_name, last_name, avatar_url')
          .in('user_uuid', userIds);
        
        usersMap = new Map(users?.map(u => [u.user_uuid, u]) || []);
      }

      let itemsWithUsers = (data || []).map(item => ({
        ...item,
        owner: item.owner_user_id ? usersMap.get(item.owner_user_id) : undefined,
        creator: usersMap.get(item.created_by)
      })) as ActionItem[];

      // Filter overdue items
      if (filter?.overdue) {
        const today = new Date().toISOString().split('T')[0];
        itemsWithUsers = itemsWithUsers.filter(
          item => item.due_date && item.due_date < today && item.status !== 'done' && item.status !== 'cancelled'
        );
      }

      setItems(itemsWithUsers);
    } catch (error: any) {
      console.error('Error fetching action items:', error);
      toast({
        title: 'Error',
        description: 'Failed to load action items',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, clientId, toast]);

  const createItem = useCallback(async (data: {
    title: string;
    description?: string;
    owner_user_id?: string;
    due_date?: string;
    priority?: string;
    source?: string;
    source_note_id?: string;
    related_entity_type?: string;
    related_entity_id?: string;
    recurrence_rule?: string;
  }) => {
    if (!tenantId || !clientId) return null;

    try {
      const { data: result, error } = await supabase.rpc('rpc_create_action_item', {
        p_tenant_id: tenantId,
        p_client_id: clientId,
        p_title: data.title,
        p_description: data.description || null,
        p_owner_user_id: data.owner_user_id || null,
        p_due_date: data.due_date || null,
        p_priority: data.priority || 'normal',
        p_source: data.source || 'manual',
        p_source_note_id: data.source_note_id || null,
        p_related_entity_type: data.related_entity_type || null,
        p_related_entity_id: data.related_entity_id || null,
        p_recurrence_rule: data.recurrence_rule || null
      });

      if (error) throw error;

      const res = result as { success: boolean; action_item_id?: string; error?: string };
      if (!res.success) {
        throw new Error(res.error || 'Failed to create action item');
      }

      toast({ title: 'Action item created' });
      fetchItems();
      return res.action_item_id;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return null;
    }
  }, [tenantId, clientId, toast, fetchItems]);

  const setStatus = useCallback(async (itemId: string, status: string) => {
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
      fetchItems();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  }, [toast, fetchItems]);

  const updateItem = useCallback(async (itemId: string, updates: Partial<ActionItem>) => {
    try {
      const { error } = await supabase
        .from('client_action_items')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId);

      if (error) throw error;

      toast({ title: 'Action item updated' });
      fetchItems();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  }, [toast, fetchItems]);

  const deleteItem = useCallback(async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('client_action_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      toast({ title: 'Action item deleted' });
      fetchItems();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  }, [toast, fetchItems]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return {
    items,
    loading,
    refresh: fetchItems,
    createItem,
    setStatus,
    updateItem,
    deleteItem
  };
}

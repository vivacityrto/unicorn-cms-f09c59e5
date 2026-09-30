import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { groupPortfolioTimelineEvents } from '@/hooks/portfolioTimelineGrouping';
import { fetchEnrollmentCourseContext } from '@/hooks/academyEnrollmentActorContext';
import { plainTextToNoteHtml } from '@/lib/noteHtml';

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
  source: 'system' | 'user' | 'microsoft' | 'unicorn';
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
  item_type: 'client' | 'internal';
  source_note_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  recurrence_rule: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notify_staff_user_ids: string[];
  notify_tenant_user_ids: string[];
  notify_offset_days: number[];
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

export const EVENT_TYPE_FILTERS: Record<string, string[]> = {
  all: [],
  meetings: ['meeting_synced', 'meeting_attendance_imported', 'meeting_artifacts_captured', 'minutes_draft_created', 'minutes_draft_updated', 'minutes_published_pdf'],
  time: ['time_posted', 'time_ignored', 'time_reallocated'],
  tasks: ['task_completed_team', 'task_completed_client', 'task_status_changed', 'tasks_created_from_minutes', 'action_item_created', 'action_item_updated', 'action_item_completed', 'action_item_comment'],
  emails: ['email_sent', 'email_failed', 'email_linked', 'email_attachment_saved'],
  docs: ['document_uploaded', 'document_downloaded', 'document_shared_to_client', 'sharepoint_doc_linked', 'sharepoint_root_configured', 'sharepoint_root_invalid'],
  notes: ['note_added', 'note_created', 'note_pinned', 'note_unpinned', 'structured_note_added'],
  accounts: ['account_invited', 'account_activated', 'account_deactivated', 'account_role_changed', 'account_removed', 'invitation_sent', 'invitation_opened', 'invitation_clicked', 'invitation_bounced', 'invitation_accepted'],
  logins: ['client_login'],
  messages: ['message_sent', 'message_read'],
  academy: ['academy_enrolled', 'academy_lesson_completed', 'academy_certificate_issued', 'academy_course_published'],
  stages: ['stage_status_changed'],
  packages: ['package_status_changed', 'package_renewed'],
  portal_activity: ['portal_activity_summary'],
  tenant_status: ['tenant_status_changed'],
  invoices: ['xero_invoice_paid', 'xero_invoice_issued'],
  audits: ['audit_created', 'audit_completed'],
  microsoft: [
    'microsoft_connected', 'microsoft_disconnected', 'microsoft_sync_failed',
    'sharepoint_doc_linked', 'sharepoint_root_configured', 'sharepoint_root_invalid',
    'meeting_synced', 'meeting_attendance_imported', 'meeting_artifacts_captured',
    'minutes_draft_created', 'minutes_draft_updated', 'minutes_published_pdf',
    'tasks_created_from_minutes',
    'email_linked', 'email_attachment_saved',
  ],
};

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export function useClientTimeline(tenantId: number | null, clientId: string | null) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  // Raw (ungrouped) rows accumulated across "Load more" pages. Grouping
  // must run over this full accumulator each time, not per-page — a single
  // burst (all rows sharing one timestamp) can span more than one page,
  // and grouping each page in isolation fragments it into one fake
  // cluster per page instead of the one real cluster it actually is.
  const rawEventsRef = useRef<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const { toast } = useToast();

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
      const creatorIds = [...new Set((data || []).map((e) => e.created_by).filter(Boolean))];
      let creatorsMap = new Map();
      
      if (creatorIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('user_uuid, first_name, last_name, avatar_url')
          .in('user_uuid', creatorIds);
        
        creatorsMap = new Map(users?.map(u => [u.user_uuid, u]) || []);
      }

      const eventsWithCreators = (data || []).map((event) => ({
        ...event,
        metadata: event.metadata as Record<string, unknown>,
        creator: creatorsMap.get(event.created_by)
      })) as unknown as TimelineEvent[];

      rawEventsRef.current = offset === 0
        ? eventsWithCreators
        : [...rawEventsRef.current, ...eventsWithCreators];

      // Same display-only grouping as the portfolio-wide feed: collapses a
      // mass/auto academy enrollment into one row and rewords even a lone
      // auto-enrolled row so it doesn't read as the user's own action.
      // Scoped to this one tenant already (RPC-filtered), so it never
      // produces a cross-tenant 'enrollment_multi' group here. Regrouped
      // over the full raw accumulator (not just this page) so a burst that
      // spans a "Load more" page boundary still collapses into one row.
      // Broadcasts are left ungrouped here (groupBroadcasts: false) — this
      // view renders title/body only, not tenant_name, so the dashboard's
      // subject-in-tenant_name rewording would just lose the message.
      const { courseInfoByCourseId, actorByUuid } = await fetchEnrollmentCourseContext(rawEventsRef.current);
      const groupedEvents = groupPortfolioTimelineEvents(
        rawEventsRef.current.map((e) => ({ ...e, tenant_name: '' })),
        courseInfoByCourseId,
        actorByUuid,
        { groupBroadcasts: false }
      ) as TimelineEvent[];

      setEvents(groupedEvents);

      setHasMore((data?.length || 0) === limit);
    } catch (error: unknown) {
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
  }, [fetchEvents]);

  // Quick notes go to the `notes` table (the real notes system) as client-level
  // notes, so they show up on the Notes tab and can be pinned like any other.
  // The notes INSERT trigger writes the timeline event.
  const addQuickNote = useCallback(async (title: string, content: string) => {
    if (!tenantId) return false;

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { error } = await supabase.from("notes").insert({
        tenant_id: tenantId,
        parent_type: "tenant",
        parent_id: tenantId,
        title: title || null,
        note_details: plainTextToNoteHtml(content),
        note_type: "general",
        created_by: userData.user.id,
      });

      if (error) throw error;

      toast({ title: "Note added" });
      fetchEvents();
      return true;
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Unknown error",
        variant: "destructive"
      });
      return false;
    }
  }, [tenantId, toast, fetchEvents]);

  return {
    events,
    loading,
    hasMore,
    filter,
    setFilter,
    search,
    setSearch,
    dateRange,
    setDateRange,
    refresh: () => { fetchEvents(); },
    // Always paginate off the raw (ungrouped) accumulator length, not the
    // displayed `events.length` — grouping can collapse many raw rows into
    // one, so the caller's displayed count under-advances the RPC offset
    // and re-fetches rows already seen.
    loadMore: () => fetchEvents(30, rawEventsRef.current.length),
    addQuickNote
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
    } catch (error: unknown) {
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
        p_priority: data.priority || 'medium',
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
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Unknown error',
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
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Unknown error',
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
        } as never)
        .eq('id', itemId);

      if (error) throw error;

      toast({ title: 'Action item updated' });
      fetchItems();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Unknown error',
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
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Unknown error',
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

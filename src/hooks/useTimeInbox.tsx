import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { format, subDays } from 'date-fns';

export interface TimeDraftRow {
  id: string;
  tenant_id: number;
  created_by: string;
  calendar_event_id: string;
  client_id: number | null;
  package_id: number | null;
  stage_id: number | null;
  minutes: number;
  work_date: string;
  notes: string | null;
  confidence: number;
  suggestion: Record<string, unknown>;
  status: string;
  work_type: string | null;
  is_billable: boolean;
  last_viewed_at: string | null;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
  event_title: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  client_name: string | null;
  // Suggestion fields
  suggested_client_id: number | null;
  suggested_package_id: number | null;
  match_confidence: number;
  match_reason: string | null;
  suggested_client_name?: string | null;
  suggested_package_name?: string | null;
}

export interface TimeInboxStats {
  recent_count: number;
  overdue_count: number;
  total_drafts: number;
}

export type DateFilter = 'today' | 'yesterday' | 'last7days' | 'custom';
export type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low';
export type StatusFilter = 'draft' | 'overdue' | 'all';

export function useTimeInbox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<TimeDraftRow[]>([]);
  const [stats, setStats] = useState<TimeInboxStats | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filters
  const [dateFilter, setDateFilter] = useState<DateFilter>('last7days');
  const [customDateRange, setCustomDateRange] = useState({
    from: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd')
  });
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  const getDateRange = useCallback(() => {
    const today = new Date();
    switch (dateFilter) {
      case 'today':
        return { from: format(today, 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
      case 'yesterday':
        const yesterday = subDays(today, 1);
        return { from: format(yesterday, 'yyyy-MM-dd'), to: format(yesterday, 'yyyy-MM-dd') };
      case 'last7days':
        return { from: format(subDays(today, 7), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
      case 'custom':
        return customDateRange;
      default:
        return { from: format(subDays(today, 7), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
    }
  }, [dateFilter, customDateRange]);

  const fetchDrafts = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const range = getDateRange();
      const { data, error } = await supabase.rpc('rpc_list_time_drafts', {
        p_from: showOverdueOnly ? null : range.from,
        p_to: showOverdueOnly ? null : range.to,
        p_status: 'draft',
        p_overdue_only: showOverdueOnly
      });

      if (error) {
        console.error('[useTimeInbox] Error fetching drafts:', error);
        toast({ title: 'Error', description: 'Failed to load drafts', variant: 'destructive' });
        return;
      }

      let filteredData = ((data || []) as unknown as TimeDraftRow[]);

      // Apply confidence filter
      if (confidenceFilter !== 'all') {
        filteredData = filteredData.filter(d => {
          const conf = d.confidence || 0;
          switch (confidenceFilter) {
            case 'high': return conf >= 0.85;
            case 'medium': return conf >= 0.5 && conf < 0.85;
            case 'low': return conf < 0.5;
            default: return true;
          }
        });
      }

      setDrafts(filteredData);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('[useTimeInbox] Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, getDateRange, confidenceFilter, toast]);

  const fetchStats = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('rpc_get_time_inbox_stats');
      if (!error && data) {
        setStats(data as unknown as TimeInboxStats);
      }
    } catch (err) {
      console.error('[useTimeInbox] Error fetching stats:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const updateDraft = useCallback(async (draftId: string, fields: Record<string, unknown>) => {
    try {
      const { data, error } = await supabase.rpc('rpc_update_time_draft', {
        p_draft_id: draftId,
        p_fields: fields as unknown as Record<string, never>
      });

      if (error) {
        console.error('[useTimeInbox] Update draft error:', error.message, error.details, error.hint);
        toast({ title: 'Error', description: error.message || 'Failed to update draft', variant: 'destructive' });
        return false;
      }

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        toast({ title: 'Error', description: result.error || 'Failed to update', variant: 'destructive' });
        return false;
      }

      await fetchDrafts();
      return true;
    } catch (err) {
      console.error('[useTimeInbox] Update error:', err);
      return false;
    }
  }, [fetchDrafts, toast]);

  const postDraft = useCallback(async (draftId: string) => {
    try {
      const { data, error } = await supabase.rpc('rpc_bulk_post_time_drafts', {
        p_draft_ids: [draftId]
      });

      if (error) {
        toast({ title: 'Error', description: 'Failed to post draft', variant: 'destructive' });
        return false;
      }

      const result = data as { success: boolean; posted_count: number; errors?: unknown };
      const errors = Array.isArray(result.errors) ? result.errors as Array<{ draft_id: string; error: string }> : [];
      
      if (errors.length > 0) {
        toast({ title: 'Error', description: errors[0].error, variant: 'destructive' });
        return false;
      }

      toast({ title: 'Time entry posted' });
      await fetchDrafts();
      await fetchStats();
      return true;
    } catch (err) {
      console.error('[useTimeInbox] Post error:', err);
      return false;
    }
  }, [fetchDrafts, fetchStats, toast]);

  const discardDraft = useCallback(async (draftId: string) => {
    try {
      const { data, error } = await supabase.rpc('rpc_bulk_discard_time_drafts', {
        p_draft_ids: [draftId]
      });

      if (error) {
        toast({ title: 'Error', description: 'Failed to discard draft', variant: 'destructive' });
        return false;
      }

      toast({ title: 'Draft discarded' });
      await fetchDrafts();
      await fetchStats();
      return true;
    } catch (err) {
      console.error('[useTimeInbox] Discard error:', err);
      return false;
    }
  }, [fetchDrafts, fetchStats, toast]);

  const bulkPost = useCallback(async () => {
    if (selectedIds.size === 0) return false;

    try {
      const { data, error } = await supabase.rpc('rpc_bulk_post_time_drafts', {
        p_draft_ids: Array.from(selectedIds)
      });

      if (error) {
        toast({ title: 'Error', description: 'Failed to post drafts', variant: 'destructive' });
        return false;
      }

      const result = data as { success: boolean; posted_count: number; errors: Array<{ draft_id: string; error: string }> };
      
      if (result.errors?.length > 0) {
        toast({ 
          title: `Posted ${result.posted_count}, ${result.errors.length} failed`, 
          description: result.errors[0].error, 
          variant: 'destructive' 
        });
      } else {
        toast({ title: `Posted ${result.posted_count} time entries` });
      }

      await fetchDrafts();
      await fetchStats();
      return true;
    } catch (err) {
      console.error('[useTimeInbox] Bulk post error:', err);
      return false;
    }
  }, [selectedIds, fetchDrafts, fetchStats, toast]);

  const bulkUpdateClient = useCallback(async (clientId: number) => {
    if (selectedIds.size === 0) return false;

    try {
      const { data, error } = await supabase.rpc('rpc_bulk_update_time_drafts', {
        p_draft_ids: Array.from(selectedIds),
        p_fields: { client_id: clientId }
      });

      if (error) {
        toast({ title: 'Error', description: 'Failed to update drafts', variant: 'destructive' });
        return false;
      }

      const result = data as { success: boolean; updated_count: number; errors: Array<{ draft_id: string; error: string }> };
      toast({ title: `Updated ${result.updated_count} drafts` });

      await fetchDrafts();
      return true;
    } catch (err) {
      console.error('[useTimeInbox] Bulk update client error:', err);
      return false;
    }
  }, [selectedIds, fetchDrafts, toast]);

  const bulkUpdatePackage = useCallback(async (packageId: number) => {
    if (selectedIds.size === 0) return false;

    try {
      const { data, error } = await supabase.rpc('rpc_bulk_update_time_drafts', {
        p_draft_ids: Array.from(selectedIds),
        p_fields: { package_id: packageId }
      });

      if (error) {
        toast({ title: 'Error', description: 'Failed to update drafts', variant: 'destructive' });
        return false;
      }

      const result = data as { success: boolean; updated_count: number; errors: Array<{ draft_id: string; error: string }> };
      toast({ title: `Updated ${result.updated_count} drafts` });

      await fetchDrafts();
      return true;
    } catch (err) {
      console.error('[useTimeInbox] Bulk update package error:', err);
      return false;
    }
  }, [selectedIds, fetchDrafts, toast]);

  const applySuggestion = useCallback(async (draftId: string, applyClient = true, applyPackage = true) => {
    try {
      const { data, error } = await supabase.rpc('rpc_apply_draft_suggestion', {
        p_draft_id: draftId,
        p_apply_client: applyClient,
        p_apply_package: applyPackage
      });

      if (error) {
        toast({ title: 'Error', description: 'Failed to apply suggestion', variant: 'destructive' });
        return false;
      }

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        toast({ title: 'Error', description: result.error || 'Failed to apply', variant: 'destructive' });
        return false;
      }

      toast({ title: 'Suggestion applied' });
      await fetchDrafts();
      return true;
    } catch (err) {
      console.error('[useTimeInbox] Apply suggestion error:', err);
      return false;
    }
  }, [fetchDrafts, toast]);

  const bulkDiscard = useCallback(async () => {
    if (selectedIds.size === 0) return false;

    try {
      const { data, error } = await supabase.rpc('rpc_bulk_discard_time_drafts', {
        p_draft_ids: Array.from(selectedIds)
      });

      if (error) {
        toast({ title: 'Error', description: 'Failed to discard drafts', variant: 'destructive' });
        return false;
      }

      const result = data as { success: boolean; discarded_count: number };
      toast({ title: `Discarded ${result.discarded_count} drafts` });

      await fetchDrafts();
      await fetchStats();
      return true;
    } catch (err) {
      console.error('[useTimeInbox] Bulk discard error:', err);
      return false;
    }
  }, [selectedIds, fetchDrafts, fetchStats, toast]);

  const snoozeDraft = useCallback(async (draftId: string, until: string) => {
    try {
      const { data, error } = await supabase.rpc('rpc_snooze_time_draft', {
        p_draft_id: draftId,
        p_until: until
      });

      if (error) {
        toast({ title: 'Error', description: 'Failed to snooze draft', variant: 'destructive' });
        return false;
      }

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        toast({ title: 'Error', description: result.error || 'Failed to snooze', variant: 'destructive' });
        return false;
      }

      toast({ title: 'Draft snoozed' });
      await fetchDrafts();
      await fetchStats();
      return true;
    } catch (err) {
      console.error('[useTimeInbox] Snooze error:', err);
      return false;
    }
  }, [fetchDrafts, fetchStats, toast]);

  const bulkSnooze = useCallback(async (until: string) => {
    if (selectedIds.size === 0) return false;

    try {
      const { data, error } = await supabase.rpc('rpc_bulk_snooze_time_drafts', {
        p_draft_ids: Array.from(selectedIds),
        p_until: until
      });

      if (error) {
        toast({ title: 'Error', description: 'Failed to snooze drafts', variant: 'destructive' });
        return false;
      }

      const result = data as { success: boolean; snoozed_count: number };
      toast({ title: `Snoozed ${result.snoozed_count} drafts` });

      await fetchDrafts();
      await fetchStats();
      return true;
    } catch (err) {
      console.error('[useTimeInbox] Bulk snooze error:', err);
      return false;
    }
  }, [selectedIds, fetchDrafts, fetchStats, toast]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(drafts.map(d => d.id)));
  }, [drafts]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    loading,
    drafts,
    stats,
    selectedIds,
    dateFilter,
    setDateFilter,
    customDateRange,
    setCustomDateRange,
    confidenceFilter,
    setConfidenceFilter,
    showOverdueOnly,
    setShowOverdueOnly,
    fetchDrafts,
    fetchStats,
    updateDraft,
    postDraft,
    discardDraft,
    snoozeDraft,
    bulkPost,
    bulkDiscard,
    bulkSnooze,
    bulkUpdateClient,
    bulkUpdatePackage,
    applySuggestion,
    toggleSelection,
    selectAll,
    clearSelection
  };
}

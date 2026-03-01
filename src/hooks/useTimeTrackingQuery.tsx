import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { QUERY_STALE_TIMES } from '@/lib/queryConfig';

export interface TimeEntry {
  id: string;
  tenant_id: number;
  client_id: number;
  package_id: number | null;
  stage_id: number | null;
  task_id: string | null;
  user_id: string;
  work_type: string;
  is_billable: boolean;
  start_at: string | null;
  end_at: string | null;
  duration_minutes: number;
  notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface ActiveTimer {
  id: string;
  tenant_id: number;
  client_id: number;
  package_id: number | null;
  stage_id: number | null;
  task_id: string | null;
  user_id: string;
  work_type: string;
  start_at: string;
  notes: string | null;
  created_at: string;
}

export interface TimeSummary {
  thisWeek: number;
  thisMonth: number;
  last90Days: number;
  billableMinutes: number;
  nonBillableMinutes: number;
}

// Query keys for cache management
export const timeTrackingKeys = {
  all: ['time-tracking'] as const,
  summary: (clientId: number) => [...timeTrackingKeys.all, 'summary', clientId] as const,
  entries: (clientId: number) => [...timeTrackingKeys.all, 'entries', clientId] as const,
  activeTimer: (userId: string) => [...timeTrackingKeys.all, 'active-timer', userId] as const,
};

export function useTimeSummaryQuery(clientId: number | null, packageId?: number | null) {
  return useQuery({
    queryKey: clientId ? [...timeTrackingKeys.summary(clientId), packageId ?? 'all'] : ['time-tracking', 'summary', 'none'],
    queryFn: async (): Promise<TimeSummary> => {
      if (!clientId) {
        return {
          thisWeek: 0,
          thisMonth: 0,
          last90Days: 0,
          billableMinutes: 0,
          nonBillableMinutes: 0
        };
      }

      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const last90Days = new Date(now);
      last90Days.setDate(now.getDate() - 90);
      
      let query = supabase
        .from('time_entries')
        .select('duration_minutes, is_billable, start_at')
        .eq('client_id', clientId);
      
      // Filter by package if specified
      if (packageId) {
        query = query.eq('package_id', packageId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      const summary: TimeSummary = {
        thisWeek: 0,
        thisMonth: 0,
        last90Days: 0,
        billableMinutes: 0,
        nonBillableMinutes: 0
      };
      
      (data || []).forEach((entry: { duration_minutes: number; is_billable: boolean; start_at: string | null }) => {
        const entryDate = entry.start_at ? new Date(entry.start_at) : new Date();
        
        if (entryDate >= startOfWeek) {
          summary.thisWeek += entry.duration_minutes;
        }
        if (entryDate >= startOfMonth) {
          summary.thisMonth += entry.duration_minutes;
        }
        if (entryDate >= last90Days) {
          summary.last90Days += entry.duration_minutes;
        }
        
        if (entry.is_billable) {
          summary.billableMinutes += entry.duration_minutes;
        } else {
          summary.nonBillableMinutes += entry.duration_minutes;
        }
      });
      
      return summary;
    },
    enabled: !!clientId,
    staleTime: QUERY_STALE_TIMES.REALTIME,
  });
}

export function useTimeEntriesQuery(clientId: number | null) {
  return useQuery({
    queryKey: clientId ? timeTrackingKeys.entries(clientId) : ['time-tracking', 'entries', 'none'],
    queryFn: async (): Promise<TimeEntry[]> => {
      if (!clientId) return [];

      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return (data || []) as TimeEntry[];
    },
    enabled: !!clientId,
    staleTime: QUERY_STALE_TIMES.REALTIME,
  });
}

export function useActiveTimerQuery() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: user?.id ? timeTrackingKeys.activeTimer(user.id) : ['time-tracking', 'active-timer', 'none'],
    queryFn: async (): Promise<ActiveTimer | null> => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('active_timers')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as ActiveTimer | null;
    },
    enabled: !!user?.id,
    staleTime: QUERY_STALE_TIMES.ACTIVE,
  });
}

// Hook to invalidate all time tracking queries for a client
export function useInvalidateTimeTracking() {
  const queryClient = useQueryClient();
  
  return {
    invalidateClient: (clientId: number) => {
      queryClient.invalidateQueries({ 
        queryKey: timeTrackingKeys.summary(clientId),
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: timeTrackingKeys.entries(clientId),
        refetchType: 'active'
      });
    },
    invalidateAll: () => {
      queryClient.invalidateQueries({ 
        queryKey: timeTrackingKeys.all,
        refetchType: 'active'
      });
    }
  };
}

// Combined hook that matches the old useTimeTracking interface
export function useTimeTrackingQuery(clientId: number | null) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const { data: summary = { thisWeek: 0, thisMonth: 0, last90Days: 0, billableMinutes: 0, nonBillableMinutes: 0 }, isLoading: summaryLoading } = useTimeSummaryQuery(clientId);
  const { data: entries = [], isLoading: entriesLoading } = useTimeEntriesQuery(clientId);
  const { data: activeTimer = null, isLoading: timerLoading } = useActiveTimerQuery();

  const loading = summaryLoading || entriesLoading || timerLoading;

  const startTimer = async (
    tenantId: number,
    packageId?: number | null,
    stageId?: number | null,
    taskId?: string | null,
    workType: string = 'general',
    notes?: string | null
  ) => {
    if (!clientId) return { success: false, error: 'no_client' };
    
    const { data, error } = await supabase.rpc('rpc_start_timer', {
      p_tenant_id: tenantId,
      p_client_id: clientId,
      p_package_id: packageId || null,
      p_stage_id: stageId || null,
      p_task_id: taskId || null,
      p_work_type: workType,
      p_notes: notes || null
    });
    
    if (error) {
      toast({
        title: 'Failed to start timer',
        description: error.message,
        variant: 'destructive'
      });
      return { success: false, error: error.message };
    }
    
    const result = data as unknown as { success: boolean; error?: string; timer?: ActiveTimer };
    
    if (result.success) {
      // Invalidate active timer query
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: timeTrackingKeys.activeTimer(user.id) });
      }
      toast({
        title: 'Timer started',
        description: 'Time tracking has begun'
      });
    } else if (result.error === 'timer_already_running') {
      toast({
        title: 'Timer already running',
        description: 'Stop your current timer first',
        variant: 'destructive'
      });
    }
    
    return result;
  };

  const stopTimer = async () => {
    const { data, error } = await supabase.rpc('rpc_stop_timer');
    
    if (error) {
      toast({
        title: 'Failed to stop timer',
        description: error.message,
        variant: 'destructive'
      });
      return { success: false, error: error.message };
    }
    
    const result = data as unknown as { success: boolean; error?: string; time_entry?: TimeEntry };
    
    if (result.success) {
      // Invalidate all relevant queries
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: timeTrackingKeys.activeTimer(user.id) });
      }
      if (clientId) {
        queryClient.invalidateQueries({ queryKey: timeTrackingKeys.entries(clientId) });
        queryClient.invalidateQueries({ queryKey: timeTrackingKeys.summary(clientId) });
      }
      
      const mins = result.time_entry?.duration_minutes || 0;
      toast({
        title: 'Timer stopped',
        description: `Logged ${Math.floor(mins / 60)}h ${mins % 60}m`
      });
    }
    
    return result;
  };

  const addTimeEntry = async (
    tenantId: number,
    durationMinutes: number,
    date: string,
    packageId?: number | null,
    stageId?: number | null,
    taskId?: string | null,
    workType: string = 'general',
    notes?: string | null,
    isBillable: boolean = true
  ) => {
    if (!clientId) return { success: false, error: 'no_client' };
    
    const { data, error } = await supabase.rpc('rpc_add_time_entry', {
      p_tenant_id: tenantId,
      p_client_id: clientId,
      p_duration_minutes: durationMinutes,
      p_date: date,
      p_package_id: packageId || null,
      p_stage_id: stageId || null,
      p_task_id: taskId || null,
      p_work_type: workType,
      p_notes: notes || null,
      p_is_billable: isBillable
    });
    
    if (error) {
      toast({
        title: 'Failed to add time',
        description: error.message,
        variant: 'destructive'
      });
      return { success: false, error: error.message };
    }
    
    const result = data as unknown as { success: boolean; error?: string };
    
    if (result.success) {
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: timeTrackingKeys.entries(clientId) });
      queryClient.invalidateQueries({ queryKey: timeTrackingKeys.summary(clientId) });
      toast({
        title: 'Time added',
        description: `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m logged`
      });
    }
    
    return result;
  };

  const updateEntry = async (entryId: string, updates: Partial<TimeEntry>) => {
    const { error } = await supabase
      .from('time_entries')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', entryId);
    
    if (error) {
      toast({
        title: 'Failed to update entry',
        description: error.message,
        variant: 'destructive'
      });
      return false;
    }
    
    if (clientId) {
      queryClient.invalidateQueries({ queryKey: timeTrackingKeys.entries(clientId) });
      queryClient.invalidateQueries({ queryKey: timeTrackingKeys.summary(clientId) });
    }
    return true;
  };

  const deleteEntry = async (entryId: string) => {
    const { error } = await supabase
      .from('time_entries')
      .delete()
      .eq('id', entryId);
    
    if (error) {
      toast({
        title: 'Failed to delete entry',
        description: error.message,
        variant: 'destructive'
      });
      return false;
    }
    
    if (clientId) {
      queryClient.invalidateQueries({ queryKey: timeTrackingKeys.entries(clientId) });
      queryClient.invalidateQueries({ queryKey: timeTrackingKeys.summary(clientId) });
    }
    toast({
      title: 'Entry deleted'
    });
    return true;
  };

  const refresh = async () => {
    if (clientId) {
      queryClient.invalidateQueries({ queryKey: timeTrackingKeys.summary(clientId) });
      queryClient.invalidateQueries({ queryKey: timeTrackingKeys.entries(clientId) });
    }
    if (user?.id) {
      queryClient.invalidateQueries({ queryKey: timeTrackingKeys.activeTimer(user.id) });
    }
  };

  return {
    entries,
    activeTimer,
    summary,
    loading,
    startTimer,
    stopTimer,
    addTimeEntry,
    updateEntry,
    deleteEntry,
    refresh
  };
}

export function formatDuration(minutes: number): string {
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = Math.round(absMinutes % 60);
  const sign = minutes < 0 ? '-' : '';
  return `${sign}${hours}:${mins.toString().padStart(2, '0')}`;
}

export function formatElapsedTime(startAt: string): string {
  const start = new Date(startAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

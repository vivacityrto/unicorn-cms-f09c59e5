import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import type { 
  EosRock, 
  EosIssue, 
  EosTodo, 
  EosMeeting,
  EosScorecardMetric,
  EosScorecardEntry,
  EosAgendaTemplate,
  EosMeetingSegment,
  EosHeadline,
  EosMeetingParticipant,
  RockStatus,
  IssueStatus,
  TodoStatus
} from '@/types/eos';

// Hook for EOS Rocks
export const useEosRocks = () => {
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = isSuperAdmin();
  
  // Check if user is Vivacity Team member (Super Admin, Team Leader, Team Member)
  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || ''
  );

  const { data: rocks, isLoading } = useQuery({
    queryKey: ['eos-rocks', isSuper || isVivacityTeam ? 'vivacity_team' : profile?.tenant_id],
    queryFn: async () => {
      let query = supabase
        .from('eos_rocks')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Vivacity Team sees all; client users filter by tenant
      if (!isSuper && !isVivacityTeam && profile?.tenant_id) {
        query = query.eq('tenant_id', profile.tenant_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as EosRock[];
    },
    enabled: isSuper || isVivacityTeam || !!profile?.tenant_id,
  });

  const createRock = useMutation({
    mutationFn: async (rock: Partial<EosRock>) => {
      const { tenant_id, ...rockData } = rock;
      const { data, error } = await supabase
        .from('eos_rocks')
        .insert(rockData as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-rocks'] });
      queryClient.invalidateQueries({ queryKey: ['eos-rocks-hierarchy'] });
      toast({ title: 'Rock created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating rock', description: error.message, variant: 'destructive' });
    },
  });

  const updateRock = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EosRock> & { id: string }) => {
      const { data, error } = await supabase
        .from('eos_rocks')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-rocks'] });
      queryClient.invalidateQueries({ queryKey: ['eos-rocks-hierarchy'] });
      toast({ title: 'Rock updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating rock', description: error.message, variant: 'destructive' });
    },
  });

  const deleteRock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('eos_rocks')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-rocks'] });
      queryClient.invalidateQueries({ queryKey: ['eos-rocks-hierarchy'] });
      toast({ title: 'Rock deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting rock', description: error.message, variant: 'destructive' });
    },
  });

  return {
    rocks,
    isLoading,
    createRock,
    updateRock,
    deleteRock,
  };
};

// Hook for EOS Issues
export const useEosIssues = () => {
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = isSuperAdmin();
  
  // Check if user is Vivacity Team member
  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || ''
  );

  const { data: issues, isLoading } = useQuery({
    queryKey: ['eos-issues', isSuper || isVivacityTeam ? 'vivacity_team' : profile?.tenant_id],
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
      return data as EosIssue[];
    },
    enabled: isSuper || isVivacityTeam || !!profile?.tenant_id,
  });

  const createIssue = useMutation({
    mutationFn: async (issue: Partial<EosIssue>) => {
      const { tenant_id, ...issueData } = issue;
      const { data, error } = await supabase
        .from('eos_issues')
        .insert(issueData as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-issues'] });
      toast({ title: 'Issue created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating issue', description: error.message, variant: 'destructive' });
    },
  });

  const updateIssue = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EosIssue> & { id: string }) => {
      const { data, error } = await supabase
        .from('eos_issues')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-issues'] });
      toast({ title: 'Issue updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating issue', description: error.message, variant: 'destructive' });
    },
  });

  const deleteIssue = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('eos_issues')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-issues'] });
      toast({ title: 'Issue deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting issue', description: error.message, variant: 'destructive' });
    },
  });

  return {
    issues,
    isLoading,
    createIssue,
    updateIssue,
    deleteIssue,
  };
};

// Hook for EOS To-Dos
export const useEosTodos = () => {
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = isSuperAdmin();
  
  // Check if user is Vivacity Team member
  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || ''
  );

  const { data: todos, isLoading } = useQuery({
    queryKey: ['eos-todos', isSuper || isVivacityTeam ? 'vivacity_team' : profile?.tenant_id],
    queryFn: async () => {
      let query = supabase
        .from('eos_todos')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Vivacity Team sees all; client users filter by tenant
      if (!isSuper && !isVivacityTeam && profile?.tenant_id) {
        query = query.eq('tenant_id', profile.tenant_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as EosTodo[];
    },
    enabled: isSuper || isVivacityTeam || !!profile?.tenant_id,
  });

  const createTodo = useMutation({
    mutationFn: async (todo: Partial<EosTodo>) => {
      const { tenant_id, ...todoData } = todo;
      const { data, error } = await supabase
        .from('eos_todos')
        .insert(todoData as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-todos'] });
      toast({ title: 'To-Do created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating to-do', description: error.message, variant: 'destructive' });
    },
  });

  const updateTodo = useMutation({
    mutationFn: async ({ id, status, completed_at, ...updates }: Partial<EosTodo> & { id: string; status?: string; completed_at?: string }) => {
      const updateData: any = { ...updates };
      if (status) updateData.status = status;
      if (completed_at !== undefined) updateData.completed_date = completed_at;
      
      const { data, error } = await supabase
        .from('eos_todos')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-todos'] });
      toast({ title: 'To-Do updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating to-do', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTodo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('eos_todos')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-todos'] });
      toast({ title: 'To-Do deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting to-do', description: error.message, variant: 'destructive' });
    },
  });

  return {
    todos,
    isLoading,
    createTodo,
    updateTodo,
    deleteTodo,
  };
};

// Hook for EOS Meetings
export const useEosMeetings = () => {
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = isSuperAdmin();
  
  // Check if user is Vivacity Team member (Super Admin, Team Leader, Team Member)
  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || ''
  );

  const { data: meetings, isLoading, error, refetch } = useQuery({
    queryKey: ['eos-meetings', isSuper || isVivacityTeam ? 'vivacity_team' : profile?.tenant_id],
    queryFn: async () => {
      let query = supabase
        .from('eos_meetings')
        .select('*')
        .order('scheduled_date', { ascending: false });
      
      // Vivacity Team members (including SuperAdmins) see all vivacity_team scoped meetings
      // RLS will handle the filtering server-side
      if (!isSuper && !isVivacityTeam && profile?.tenant_id) {
        query = query.eq('tenant_id', profile.tenant_id);
      }
      
      const { data, error } = await query;
      if (error) {
        console.error('[useEosMeetings] Query failed:', {
          message: error.message,
          details: error.details,
          code: error.code,
          hint: error.hint,
        });
        // Create a new error that includes all details for the UI
        const detailedError = new Error(error.message) as Error & { 
          details?: string; 
          code?: string;
          hint?: string;
        };
        detailedError.details = error.details;
        detailedError.code = error.code;
        detailedError.hint = error.hint;
        throw detailedError;
      }
      return data as EosMeeting[];
    },
    enabled: isSuper || isVivacityTeam || !!profile?.tenant_id,
  });

  const createMeeting = useMutation({
    mutationFn: async (meeting: Partial<EosMeeting>) => {
      const { tenant_id, ...meetingData } = meeting;
      const { data, error } = await supabase
        .from('eos_meetings')
        .insert(meetingData as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      toast({ title: 'Meeting created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating meeting', description: error.message, variant: 'destructive' });
    },
  });

  const updateMeeting = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EosMeeting> & { id: string }) => {
      const { data, error } = await supabase
        .from('eos_meetings')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      toast({ title: 'Meeting updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating meeting', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMeeting = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('eos_meetings')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      toast({ title: 'Meeting deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting meeting', description: error.message, variant: 'destructive' });
    },
  });

  return {
    meetings,
    isLoading,
    error,
    refetch,
    createMeeting,
    updateMeeting,
    deleteMeeting,
  };
};

// Hook for Scorecard Metrics
export const useEosScorecardMetrics = () => {
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = isSuperAdmin();
  
  // Check if user is Vivacity Team member
  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || ''
  );

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['eos-scorecard-metrics', isSuper || isVivacityTeam ? 'vivacity_team' : profile?.tenant_id],
    queryFn: async () => {
      let query = supabase
        .from('eos_scorecard_metrics')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      
      // Vivacity Team sees all; client users filter by tenant
      if (!isSuper && !isVivacityTeam && profile?.tenant_id) {
        query = query.eq('tenant_id', profile.tenant_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as EosScorecardMetric[];
    },
    enabled: isSuper || isVivacityTeam || !!profile?.tenant_id,
  });

  const createMetric = useMutation({
    mutationFn: async (metric: Partial<EosScorecardMetric>) => {
      const { tenant_id, ...metricData } = metric;
      const { data, error } = await supabase
        .from('eos_scorecard_metrics')
        .insert(metricData as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-scorecard-metrics'] });
      toast({ title: 'Metric created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating metric', description: error.message, variant: 'destructive' });
    },
  });

  return {
    metrics,
    isLoading,
    createMetric,
  };
};

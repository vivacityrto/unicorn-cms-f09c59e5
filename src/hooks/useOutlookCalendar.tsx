import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Json } from '@/integrations/supabase/types';

export interface CalendarEvent {
  id: string;
  tenant_id: number;
  user_id: string;
  provider: string;
  provider_event_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  organizer_email: string | null;
  attendees: Json;
  meeting_url: string | null;
  status: string;
  location: string | null;
}

export interface TimeDraft {
  id: string;
  calendar_event_id: string;
  client_id: number | null;
  package_id: number | null;
  stage_id: number | null;
  minutes: number;
  work_date: string;
  notes: string | null;
  confidence: number;
  suggestion: Json;
  status: string;
}

// Determine the canonical redirect URI based on current origin
export function getOutlookRedirectUri(): string {
  const origin = window.location.origin;
  const path = '/calendar/outlook-callback';
  
  // Log for debugging
  console.log('[useOutlookCalendar] Current origin:', origin);
  console.log('[useOutlookCalendar] Full redirect URI:', `${origin}${path}`);
  
  return `${origin}${path}`;
}

export function useOutlookCalendar() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [drafts, setDrafts] = useState<TimeDraft[]>([]);

  const checkConnection = useCallback(async () => {
    if (!user) {
      console.log('[useOutlookCalendar] No user, skipping connection check');
      setInitializing(false);
      return false;
    }
    
    try {
      console.log('[useOutlookCalendar] Checking connection for user:', user.id);
      const { data, error } = await supabase.functions.invoke('outlook-auth', {
        body: { action: 'status' }
      });
      
      if (error) {
        console.error('[useOutlookCalendar] Check connection error:', error);
        setConnected(false);
        setInitializing(false);
        return false;
      }
      
      console.log('[useOutlookCalendar] Connection status:', data?.connected);
      setConnected(data?.connected || false);
      setInitializing(false);
      return data?.connected;
    } catch (err) {
      console.error('[useOutlookCalendar] Check connection failed:', err);
      setConnected(false);
      setInitializing(false);
      return false;
    }
  }, [user]);

  // Auto-check connection when user becomes available
  useEffect(() => {
    if (user) {
      checkConnection();
    } else {
      setInitializing(false);
    }
  }, [user, checkConnection]);

  const connect = useCallback(async (tenantId: number) => {
    if (!user) {
      toast({ title: 'Please log in first', variant: 'destructive' });
      return;
    }
    
    const redirectUri = getOutlookRedirectUri();
    
    console.log('[useOutlookCalendar] Starting OAuth with redirect URI:', redirectUri);
    console.log('[useOutlookCalendar] Tenant ID:', tenantId);
    
    setLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('outlook-auth', {
        body: { 
          action: 'get-auth-url',
          redirect_uri: redirectUri, 
          tenant_id: tenantId 
        }
      });
      
      if (error || !data?.auth_url) {
        console.error('[useOutlookCalendar] Failed to get auth URL:', error, data);
        toast({ title: 'Failed to start connection', description: error?.message || 'Unknown error', variant: 'destructive' });
        setLoading(false);
        return;
      }
      
      console.log('[useOutlookCalendar] Got auth URL, state:', data.state);
      console.log('[useOutlookCalendar] Redirect URI saved in state:', redirectUri);
      
      // Store state in localStorage as backup (server has the canonical state)
      localStorage.setItem('outlook_oauth_state', data.state);
      localStorage.setItem('outlook_oauth_redirect', redirectUri);
      
      // Redirect to Microsoft login
      console.log('[useOutlookCalendar] Redirecting to Microsoft...');
      window.location.href = data.auth_url;
    } catch (err) {
      console.error('[useOutlookCalendar] Connect error:', err);
      toast({ title: 'Connection failed', variant: 'destructive' });
      setLoading(false);
    }
  }, [user, toast]);

  const disconnect = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.functions.invoke('outlook-auth', {
      body: { action: 'disconnect' }
    });
    
    if (error) {
      toast({ title: 'Failed to disconnect', variant: 'destructive' });
    } else {
      setConnected(false);
      setEvents([]);
      toast({ title: 'Outlook disconnected' });
    }
    setLoading(false);
  }, [toast]);

  const syncCalendar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('sync-outlook-calendar', {});
    
    if (error) {
      toast({ title: 'Sync failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Calendar synced', description: `${data.synced} events updated` });
      await fetchEvents();
    }
    setLoading(false);
  }, [toast]);

  const fetchEvents = useCallback(async (filters?: { startDate?: string; endDate?: string; unprocessedOnly?: boolean }) => {
    if (!user) return;
    
    let query = supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'confirmed')
      .order('start_at', { ascending: false });
    
    if (filters?.startDate) {
      query = query.gte('start_at', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('start_at', filters.endDate);
    }
    
    const { data, error } = await query.limit(100);
    
    if (!error && data) {
      setEvents(data as CalendarEvent[]);
    }
  }, [user]);

  const fetchDrafts = useCallback(async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('calendar_time_drafts')
      .select('*')
      .eq('created_by', user.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setDrafts(data as TimeDraft[]);
    }
  }, [user]);

  const createDraft = useCallback(async (eventId: string) => {
    const { data, error } = await supabase.rpc('rpc_create_time_draft_from_event', {
      p_event_id: eventId
    });
    
    if (error) {
      toast({ title: 'Failed to create draft', description: error.message, variant: 'destructive' });
      return null;
    }
    
    const result = data as { success: boolean; draft_id?: string; error?: string };
    
    if (!result.success) {
      toast({ title: 'Failed to create draft', description: result.error, variant: 'destructive' });
      return null;
    }
    
    await fetchDrafts();
    toast({ title: 'Draft created' });
    return result.draft_id;
  }, [toast, fetchDrafts]);

  const updateDraft = useCallback(async (draftId: string, updates: Partial<Omit<TimeDraft, 'suggestion'>> & { suggestion?: Json }) => {
    const { suggestion, ...rest } = updates;
    const updatePayload: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };
    if (suggestion !== undefined) {
      updatePayload.suggestion = suggestion;
    }
    const { error } = await supabase
      .from('calendar_time_drafts')
      .update(updatePayload as { updated_at: string })
      .eq('id', draftId);
    
    if (error) {
      toast({ title: 'Failed to update draft', variant: 'destructive' });
      return false;
    }
    
    await fetchDrafts();
    return true;
  }, [toast, fetchDrafts]);

  const postDraft = useCallback(async (draftId: string) => {
    const { data, error } = await supabase.rpc('rpc_post_time_draft', {
      p_draft_id: draftId
    });
    
    if (error) {
      toast({ title: 'Failed to post time', description: error.message, variant: 'destructive' });
      return false;
    }
    
    const result = data as { success: boolean; error?: string };
    
    if (!result.success) {
      toast({ title: 'Failed to post time', description: result.error, variant: 'destructive' });
      return false;
    }
    
    await fetchDrafts();
    toast({ title: 'Time posted successfully' });
    return true;
  }, [toast, fetchDrafts]);

  const discardDraft = useCallback(async (draftId: string) => {
    const { data, error } = await supabase.rpc('rpc_discard_time_draft', {
      p_draft_id: draftId
    });
    
    if (error) {
      toast({ title: 'Failed to discard draft', variant: 'destructive' });
      return false;
    }
    
    await fetchDrafts();
    toast({ title: 'Draft discarded' });
    return true;
  }, [toast, fetchDrafts]);

  // Debug function to test connection
  const runDiagnostics = useCallback(async () => {
    console.log('=== OUTLOOK CALENDAR DIAGNOSTICS ===');
    console.log('User ID:', user?.id);
    console.log('Current origin:', window.location.origin);
    console.log('Expected redirect URI:', getOutlookRedirectUri());
    
    // Check oauth_tokens
    const { data: tokens, error: tokenError } = await supabase
      .from('oauth_tokens')
      .select('id, user_id, provider, expires_at, updated_at')
      .eq('provider', 'microsoft');
    
    console.log('OAuth tokens:', tokens, tokenError);
    
    // Check calendar_events count
    const { count, error: eventError } = await supabase
      .from('calendar_events')
      .select('*', { count: 'exact', head: true })
      .eq('provider', 'outlook');
    
    console.log('Calendar events count:', count, eventError);
    
    // Check connection status via edge function
    const { data: status, error: statusError } = await supabase.functions.invoke('outlook-auth', {
      body: { action: 'status' }
    });
    
    console.log('Connection status from edge function:', status, statusError);
    
    return {
      userId: user?.id,
      origin: window.location.origin,
      redirectUri: getOutlookRedirectUri(),
      tokensCount: tokens?.length || 0,
      eventsCount: count || 0,
      connected: status?.connected || false
    };
  }, [user]);

  return {
    loading,
    initializing,
    connected,
    events,
    drafts,
    checkConnection,
    connect,
    disconnect,
    syncCalendar,
    fetchEvents,
    fetchDrafts,
    createDraft,
    updateDraft,
    postDraft,
    discardDraft,
    runDiagnostics
  };
}

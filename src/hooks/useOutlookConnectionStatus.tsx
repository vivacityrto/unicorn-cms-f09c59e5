import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface OutlookConnectionStatus {
  id: string;
  user_id: string;
  tenant_id: number;
  provider: string;
  expires_at: string;
  last_synced_at: string | null;
  last_error: string | null;
  account_email: string | null;
  token_status: 'valid' | 'expired';
  connection_status: 'connected' | 'expired' | 'error';
  created_at: string;
  updated_at: string;
}

/**
 * Hook for managing per-user Outlook calendar connection status.
 * Uses the user_outlook_connection_status view which is filtered by auth.uid()
 * to ensure strict data isolation between users.
 */
export function useOutlookConnectionStatus() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query connection status from the secure view
  const { data: connectionStatus, isLoading, error, refetch } = useQuery({
    queryKey: ['outlook-connection-status', user?.id],
    queryFn: async (): Promise<OutlookConnectionStatus | null> => {
      if (!user) return null;

      // Query the secure view - it's already filtered by auth.uid()
      const { data, error } = await supabase
        .from('user_outlook_connection_status')
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('[useOutlookConnectionStatus] Error fetching status:', error);
        throw error;
      }

      return data as OutlookConnectionStatus | null;
    },
    enabled: !!user,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  // Check connection via edge function (includes token validation)
  const checkConnectionMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('outlook-auth', {
        body: { action: 'status' }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outlook-connection-status'] });
    },
  });

  // Connect to Outlook
  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.tenant_id) {
        throw new Error('No tenant ID available');
      }

      const redirectUri = `${window.location.origin}/calendar/outlook-callback`;
      
      console.log('[useOutlookConnectionStatus] Starting OAuth for user:', user?.id);
      
      const { data, error } = await supabase.functions.invoke('outlook-auth', {
        body: { 
          action: 'get-auth-url',
          redirect_uri: redirectUri,
          tenant_id: profile.tenant_id
        }
      });

      if (error || !data?.auth_url) {
        throw new Error(error?.message || 'Failed to get authorization URL');
      }

      // Store state for callback validation
      localStorage.setItem('outlook_oauth_state', data.state);
      localStorage.setItem('outlook_oauth_redirect', redirectUri);

      // Check if in iframe
      const isInIframe = window.self !== window.top;
      
      if (isInIframe) {
        const newWindow = window.open(data.auth_url, '_blank', 'noopener,noreferrer');
        if (!newWindow) {
          return { openedInNewTab: false, authUrl: data.auth_url };
        }
        return { openedInNewTab: true };
      } else {
        window.location.href = data.auth_url;
        return { redirected: true };
      }
    },
    onError: (error) => {
      toast({
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Failed to connect to Outlook',
        variant: 'destructive',
      });
    },
  });

  // Disconnect from Outlook
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('outlook-auth', {
        body: { action: 'disconnect' }
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outlook-connection-status'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast({
        title: 'Disconnected',
        description: 'Microsoft Outlook has been disconnected',
      });
    },
    onError: (error) => {
      toast({
        title: 'Disconnect Failed',
        description: error instanceof Error ? error.message : 'Failed to disconnect',
        variant: 'destructive',
      });
    },
  });

  // Sync calendar
  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-outlook-calendar', {});
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['outlook-connection-status'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast({
        title: 'Calendar Synced',
        description: `${data?.synced || 0} events synchronized`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Sync Failed',
        description: error instanceof Error ? error.message : 'Failed to sync calendar',
        variant: 'destructive',
      });
    },
  });

  // Derived state
  const isConnected = !!connectionStatus && connectionStatus.connection_status === 'connected';
  const hasError = connectionStatus?.connection_status === 'error';
  const isExpired = connectionStatus?.connection_status === 'expired';

  return {
    connectionStatus,
    isLoading,
    error,
    isConnected,
    hasError,
    isExpired,
    refetch,
    connect: connectMutation.mutateAsync,
    disconnect: disconnectMutation.mutateAsync,
    sync: syncMutation.mutateAsync,
    checkConnection: checkConnectionMutation.mutateAsync,
    isConnecting: connectMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
    isSyncing: syncMutation.isPending,
    isChecking: checkConnectionMutation.isPending,
  };
}

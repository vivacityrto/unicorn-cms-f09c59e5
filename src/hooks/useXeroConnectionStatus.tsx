import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { QUERY_STALE_TIMES } from '@/lib/queryConfig';

export interface XeroConnectionStatus {
  connected: boolean;
  organisation_name: string | null;
  expires_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  is_expired: boolean;
}

/**
 * Manages the single shared Vivacity-org Xero connection (not per-user,
 * per-client-tenant, or per-calling-staff-member - see xero-auth edge
 * function). Any Vivacity staff can view status; only Super Admins can
 * connect/disconnect.
 */
export function useXeroConnectionStatus() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: connectionStatus, isLoading, error, refetch } = useQuery({
    queryKey: ['xero-connection-status'],
    queryFn: async (): Promise<XeroConnectionStatus> => {
      const { data, error } = await supabase.functions.invoke('xero-auth', {
        body: { action: 'status' },
      });
      if (error) throw error;
      return data as XeroConnectionStatus;
    },
    staleTime: QUERY_STALE_TIMES.REALTIME,
    refetchOnWindowFocus: true,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const redirectUri = `${window.location.origin}/admin/integrations/xero-callback`;

      const { data, error } = await supabase.functions.invoke('xero-auth', {
        body: { action: 'get-auth-url', redirect_uri: redirectUri },
      });

      if (error || !data?.auth_url) {
        throw new Error(error?.message || data?.error || 'Failed to get authorization URL');
      }

      localStorage.setItem('xero_oauth_state', data.state);
      localStorage.setItem('xero_oauth_redirect', redirectUri);

      window.location.href = data.auth_url;
    },
    onError: (error) => {
      toast({
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Failed to connect to Xero',
        variant: 'destructive',
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('xero-auth', {
        body: { action: 'disconnect' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['xero-connection-status'] });
      toast({
        title: 'Disconnected',
        description: 'Xero has been disconnected',
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

  return {
    connectionStatus,
    isLoading,
    error,
    refetch,
    connect: connectMutation.mutateAsync,
    disconnect: disconnectMutation.mutateAsync,
    isConnecting: connectMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
  };
}

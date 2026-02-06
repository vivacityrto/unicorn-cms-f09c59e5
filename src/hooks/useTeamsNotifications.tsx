import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export type NotificationEventType = 
  | 'task_assigned'
  | 'task_overdue'
  | 'risk_flagged'
  | 'package_threshold_80'
  | 'package_threshold_95'
  | 'package_threshold_100'
  | 'meeting_action_created';

export type DeliveryTarget = 'dm' | 'channel';

export interface NotificationRule {
  id: string;
  user_uuid: string;
  event_type: NotificationEventType;
  is_enabled: boolean;
  delivery_target: DeliveryTarget;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserNotificationIntegration {
  id: string;
  user_uuid: string;
  provider: string;
  status: 'connected' | 'disconnected' | 'error';
  ms_user_id: string | null;
  preferred_channel_id: string | null;
  preferred_team_id: string | null;
  webhook_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationOutbox {
  id: string;
  event_type: NotificationEventType;
  tenant_id: number | null;
  client_id: number | null;
  record_type: string;
  record_id: string;
  recipient_user_uuid: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

// Fetch user's Teams integration status
export function useTeamsIntegration() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['teams-integration', user?.id],
    queryFn: async (): Promise<UserNotificationIntegration | null> => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('user_notification_integrations')
        .select('*')
        .eq('user_uuid', user.id)
        .eq('provider', 'microsoft_teams')
        .maybeSingle();

      if (error) throw error;
      return data as UserNotificationIntegration | null;
    },
    enabled: !!user?.id,
  });
}

// Fetch user's notification rules
export function useNotificationRules() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notification-rules', user?.id],
    queryFn: async (): Promise<NotificationRule[]> => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('notification_rules')
        .select('*')
        .eq('user_uuid', user.id);

      if (error) throw error;
      return (data || []) as NotificationRule[];
    },
    enabled: !!user?.id,
  });
}

// Fetch recent notifications (for the current user)
export function useRecentNotifications(limit = 20) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['recent-notifications', user?.id, limit],
    queryFn: async (): Promise<NotificationOutbox[]> => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('notification_outbox')
        .select('*')
        .eq('recipient_user_uuid', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as NotificationOutbox[];
    },
    enabled: !!user?.id,
  });
}

// Connect Teams integration with webhook URL
export function useConnectTeams() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (webhookUrl: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_notification_integrations')
        .upsert({
          user_uuid: user.id,
          provider: 'microsoft_teams',
          status: 'connected',
          webhook_url: webhookUrl,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_uuid,provider',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams-integration'] });
      toast({ title: 'Teams connected successfully' });
    },
    onError: (error) => {
      toast({ 
        title: 'Failed to connect Teams', 
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Disconnect Teams integration
export function useDisconnectTeams() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('user_notification_integrations')
        .update({
          status: 'disconnected',
          webhook_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_uuid', user.id)
        .eq('provider', 'microsoft_teams');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams-integration'] });
      toast({ title: 'Teams disconnected' });
    },
    onError: (error) => {
      toast({ 
        title: 'Failed to disconnect Teams', 
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Update a notification rule
export function useUpdateNotificationRule() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      eventType: NotificationEventType;
      isEnabled?: boolean;
      deliveryTarget?: DeliveryTarget;
      quietHoursStart?: string | null;
      quietHoursEnd?: string | null;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('notification_rules')
        .upsert({
          user_uuid: user.id,
          event_type: params.eventType,
          is_enabled: params.isEnabled ?? true,
          delivery_target: params.deliveryTarget ?? 'dm',
          quiet_hours_start: params.quietHoursStart ?? null,
          quiet_hours_end: params.quietHoursEnd ?? null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_uuid,event_type',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
    },
    onError: (error) => {
      toast({ 
        title: 'Failed to update notification rule', 
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Bulk update quiet hours for all rules
export function useUpdateQuietHours() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      quietHoursStart: string | null;
      quietHoursEnd: string | null;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('notification_rules')
        .update({
          quiet_hours_start: params.quietHoursStart,
          quiet_hours_end: params.quietHoursEnd,
          updated_at: new Date().toISOString(),
        })
        .eq('user_uuid', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
      toast({ title: 'Quiet hours updated' });
    },
    onError: (error) => {
      toast({ 
        title: 'Failed to update quiet hours', 
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Helper to emit a notification (for use in other parts of the app)
export async function emitNotification(params: {
  eventType: NotificationEventType;
  recipientUserUuid: string;
  recordType: string;
  recordId: string;
  payload: Record<string, unknown>;
  tenantId?: number;
  clientId?: number;
}) {
  const { data, error } = await supabase.rpc('emit_notification', {
    p_event_type: params.eventType,
    p_recipient_user_uuid: params.recipientUserUuid,
    p_record_type: params.recordType,
    p_record_id: params.recordId,
    p_payload: JSON.parse(JSON.stringify(params.payload)),
    p_tenant_id: params.tenantId || null,
    p_client_id: params.clientId || null,
  });

  if (error) {
    console.error('Failed to emit notification:', error);
    throw error;
  }

  return data;
}

// Event type labels for UI
export const EVENT_TYPE_LABELS: Record<NotificationEventType, { label: string; description: string }> = {
  task_assigned: {
    label: 'Task Assigned',
    description: 'When a task is assigned to you',
  },
  task_overdue: {
    label: 'Task Overdue',
    description: 'When your task becomes overdue',
  },
  risk_flagged: {
    label: 'Risk Flagged',
    description: 'When a client risk is flagged',
  },
  package_threshold_80: {
    label: 'Package at 80%',
    description: 'When package hours reach 80%',
  },
  package_threshold_95: {
    label: 'Package at 95%',
    description: 'When package hours reach 95%',
  },
  package_threshold_100: {
    label: 'Package at 100%',
    description: 'When package hours are fully used',
  },
  meeting_action_created: {
    label: 'Meeting Action',
    description: 'When an action is created from a meeting',
  },
};

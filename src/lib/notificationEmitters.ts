/**
 * Notification Event Emitter Utilities
 * 
 * These utilities should be called when specific events occur in Unicorn
 * to queue notifications for delivery via Teams.
 */

import { supabase } from '@/integrations/supabase/client';

export interface TaskNotificationPayload {
  title: string;
  client_name?: string;
  due_date?: string;
  assigned_by?: string;
  priority?: string;
  deep_link: string;
  base_url?: string;
}

export interface PackageNotificationPayload {
  title: string;
  client_name: string;
  hours_used: number;
  hours_total: number;
  percentage: number;
  deep_link: string;
  base_url?: string;
}

export interface RiskNotificationPayload {
  title: string;
  client_name: string;
  risk_level: string;
  description?: string;
  deep_link: string;
  base_url?: string;
}

export interface MeetingActionPayload {
  title: string;
  meeting_title?: string;
  client_name?: string;
  deep_link: string;
  base_url?: string;
}

// Emit task assigned notification
export async function emitTaskAssigned(
  recipientUserUuid: string,
  taskId: string,
  payload: TaskNotificationPayload,
  tenantId?: number,
  clientId?: number
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('emit_notification', {
      p_event_type: 'task_assigned',
      p_recipient_user_uuid: recipientUserUuid,
      p_record_type: 'task',
      p_record_id: taskId,
      p_payload: JSON.parse(JSON.stringify(payload)),
      p_tenant_id: tenantId || null,
      p_client_id: clientId || null,
    });

    if (error) {
      console.error('Failed to emit task_assigned notification:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error emitting task_assigned notification:', err);
    return null;
  }
}

// Emit task overdue notification
export async function emitTaskOverdue(
  recipientUserUuid: string,
  taskId: string,
  payload: TaskNotificationPayload,
  tenantId?: number,
  clientId?: number
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('emit_notification', {
      p_event_type: 'task_overdue',
      p_recipient_user_uuid: recipientUserUuid,
      p_record_type: 'task',
      p_record_id: taskId,
      p_payload: JSON.parse(JSON.stringify(payload)),
      p_tenant_id: tenantId || null,
      p_client_id: clientId || null,
    });

    if (error) {
      console.error('Failed to emit task_overdue notification:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error emitting task_overdue notification:', err);
    return null;
  }
}

// Emit risk flagged notification
export async function emitRiskFlagged(
  recipientUserUuid: string,
  riskId: string,
  payload: RiskNotificationPayload,
  tenantId?: number,
  clientId?: number
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('emit_notification', {
      p_event_type: 'risk_flagged',
      p_recipient_user_uuid: recipientUserUuid,
      p_record_type: 'risk',
      p_record_id: riskId,
      p_payload: JSON.parse(JSON.stringify(payload)),
      p_tenant_id: tenantId || null,
      p_client_id: clientId || null,
    });

    if (error) {
      console.error('Failed to emit risk_flagged notification:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error emitting risk_flagged notification:', err);
    return null;
  }
}

// Emit package threshold notification (80%, 95%, or 100%)
export async function emitPackageThreshold(
  recipientUserUuid: string,
  packageId: string,
  threshold: 80 | 95 | 100,
  payload: PackageNotificationPayload,
  tenantId?: number,
  clientId?: number
): Promise<string | null> {
  const eventTypeMap = {
    80: 'package_threshold_80',
    95: 'package_threshold_95',
    100: 'package_threshold_100',
  } as const;

  try {
    const { data, error } = await supabase.rpc('emit_notification', {
      p_event_type: eventTypeMap[threshold],
      p_recipient_user_uuid: recipientUserUuid,
      p_record_type: 'package',
      p_record_id: packageId,
      p_payload: JSON.parse(JSON.stringify(payload)),
      p_tenant_id: tenantId || null,
      p_client_id: clientId || null,
    });

    if (error) {
      console.error(`Failed to emit package_threshold_${threshold} notification:`, error);
      return null;
    }

    return data;
  } catch (err) {
    console.error(`Error emitting package_threshold_${threshold} notification:`, err);
    return null;
  }
}

// Emit meeting action created notification
export async function emitMeetingActionCreated(
  recipientUserUuid: string,
  actionId: string,
  payload: MeetingActionPayload,
  tenantId?: number,
  clientId?: number
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('emit_notification', {
      p_event_type: 'meeting_action_created',
      p_recipient_user_uuid: recipientUserUuid,
      p_record_type: 'meeting_action',
      p_record_id: actionId,
      p_payload: JSON.parse(JSON.stringify(payload)),
      p_tenant_id: tenantId || null,
      p_client_id: clientId || null,
    });

    if (error) {
      console.error('Failed to emit meeting_action_created notification:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error emitting meeting_action_created notification:', err);
    return null;
  }
}

// Helper to trigger the notification worker (for testing or manual processing)
export async function triggerNotificationWorker(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
} | null> {
  try {
    const { data, error } = await supabase.functions.invoke('process-notification-outbox', {
      body: { batch_size: 50 },
    });

    if (error) {
      console.error('Failed to trigger notification worker:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error triggering notification worker:', err);
    return null;
  }
}

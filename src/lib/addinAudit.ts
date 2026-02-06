import { supabase } from "@/integrations/supabase/client";

export type AddinAuditAction = 'addin_opened' | 'addin_action_executed' | 'addin_action_failed';

export type AddinSurface = 'outlook_mail' | 'outlook_calendar' | 'teams_meeting' | 'word' | 'excel';

export interface AddinAuditPayload {
  action: AddinAuditAction;
  recordType?: string;
  recordId?: string;
  surface?: AddinSurface;
  metadata?: Record<string, unknown>;
  clientInfo?: string;
}

/**
 * Log an add-in audit event
 * Call this from edge functions or frontend when add-in actions occur
 */
export async function logAddinAuditEvent(payload: AddinAuditPayload): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.warn('[addin-audit] No authenticated user, skipping audit log');
      return;
    }

    // Direct insert using raw fetch to bypass TypeScript types for new table
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.warn('[addin-audit] No session, skipping audit log');
      return;
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL || 'https://yxkgdalkbrriasiyyrwk.supabase.co'}/rest/v1/addin_audit_log`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4a2dkYWxrYnJyaWFzaXl5cndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2MjQwMzEsImV4cCI6MjA2MzIwMDAzMX0.bBFTaO-6Afko1koQqx-PWdzl2mu5qmE0xWNTvneqyqY',
          'Authorization': `Bearer ${session.access_token}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          user_uuid: user.id,
          action: payload.action,
          record_type: payload.recordType || null,
          record_id: payload.recordId || null,
          surface: payload.surface || null,
          metadata: payload.metadata || {},
          client_info: payload.clientInfo || null,
        }),
      }
    );

    if (!response.ok) {
      console.error('[addin-audit] Failed to log audit event:', response.statusText);
    }
  } catch (err) {
    console.error('[addin-audit] Error logging audit event:', err);
  }
}

/**
 * Log when the add-in panel is opened
 */
export async function logAddinOpened(surface: AddinSurface, metadata?: Record<string, unknown>): Promise<void> {
  return logAddinAuditEvent({
    action: 'addin_opened',
    surface,
    metadata,
  });
}

/**
 * Log when an add-in action is successfully executed
 */
export async function logAddinActionExecuted(
  actionName: string,
  surface: AddinSurface,
  recordType?: string,
  recordId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  return logAddinAuditEvent({
    action: 'addin_action_executed',
    surface,
    recordType,
    recordId,
    metadata: {
      action_name: actionName,
      ...metadata,
    },
  });
}

/**
 * Log when an add-in action fails
 */
export async function logAddinActionFailed(
  actionName: string,
  surface: AddinSurface,
  errorMessage: string,
  recordType?: string,
  recordId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  return logAddinAuditEvent({
    action: 'addin_action_failed',
    surface,
    recordType,
    recordId,
    metadata: {
      action_name: actionName,
      error: errorMessage,
      ...metadata,
    },
  });
}

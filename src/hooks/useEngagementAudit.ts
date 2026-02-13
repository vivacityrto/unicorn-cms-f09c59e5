/**
 * useEngagementAudit – Unicorn 2.0
 *
 * Logs engagement events (celebrations, badge unlocks) with validation status.
 */

import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AuditPayload {
  tenantId: number;
  clientId?: number | null;
  packageInstanceId?: number | null;
  actorUserUuid?: string | null;
  eventType: string;
  tier?: string | null;
  validationPassed: boolean;
  validationNotes?: Record<string, unknown>;
}

export function useEngagementAudit() {
  const logEngagementEvent = useCallback(async (payload: AuditPayload) => {
    const { error } = await supabase
      .from('engagement_audit_log' as any)
      .insert({
        tenant_id: payload.tenantId,
        client_id: payload.clientId ?? null,
        package_instance_id: payload.packageInstanceId ?? null,
        actor_user_uuid: payload.actorUserUuid ?? null,
        event_type: payload.eventType,
        tier: payload.tier ?? null,
        integrity_validation_passed: payload.validationPassed,
        validation_notes: payload.validationNotes ?? {},
      } as any);

    if (error) {
      console.error('[EngagementAudit] Failed to log:', error);
    }
  }, []);

  return { logEngagementEvent };
}

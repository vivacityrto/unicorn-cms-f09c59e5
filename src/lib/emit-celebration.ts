/**
 * emitCelebration – Unicorn 2.0
 *
 * Inserts into celebration_events and audit_events.
 * Returns the inserted event payload.
 * Call ONLY after server confirms success – never on optimistic UI.
 */

import { supabase } from '@/integrations/supabase/client';
import { ALLOWED_CELEBRATION_EVENTS, type AllowedCelebrationEvent } from '@/lib/engagement-guardrails';

export type CelebrationSourceModule = 'compliance' | 'eos' | 'time' | 'documents' | 'integrations' | 'admin';

export type CelebrationEventType =
  | 'section_complete'
  | 'phase_complete'
  | 'package_complete'
  | 'risk_resolved'
  | 'hours_milestone'
  | 'healthcheck_complete'
  | 'integration_clean_sync';

export interface EmitCelebrationPayload {
  tenant_id: number;
  actor_user_uuid: string;
  client_id?: number | null;
  package_id?: number | null;
  source_module: CelebrationSourceModule;
  event_type: CelebrationEventType;
  tier: 1 | 2 | 3;
  title: string;
  subtitle?: string | null;
  cta_label?: string | null;
  cta_href?: string | null;
}

export async function emitCelebration(payload: EmitCelebrationPayload) {
  // Guardrail: check event is whitelisted
  if (!(payload.event_type in ALLOWED_CELEBRATION_EVENTS)) {
    console.warn(`[Celebration] Blocked non-whitelisted event: ${payload.event_type}`);
    return null;
  }

  // Insert celebration event
  const { data, error } = await supabase
    .from('celebration_events' as any)
    .insert({
      tenant_id: payload.tenant_id,
      actor_user_uuid: payload.actor_user_uuid,
      client_id: payload.client_id ?? null,
      package_id: payload.package_id ?? null,
      source_module: payload.source_module,
      event_type: payload.event_type,
      tier: payload.tier,
      title: payload.title,
      subtitle: payload.subtitle ?? null,
      cta_label: payload.cta_label ?? null,
      cta_href: payload.cta_href ?? null,
    } as any)
    .select()
    .single();

  if (error) {
    console.error('[Celebration] Failed to log event:', error);
  }

  // Also log to audit_events
  await supabase.from('audit_events').insert({
    entity: 'celebration',
    entity_id: (data as any)?.id ?? crypto.randomUUID(),
    action: `celebration.${payload.event_type}`,
    user_id: payload.actor_user_uuid,
    details: {
      tier: payload.tier,
      source_module: payload.source_module,
      title: payload.title,
      subtitle: payload.subtitle,
      client_id: payload.client_id,
      package_id: payload.package_id,
    },
  });

  return data;
}

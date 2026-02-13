/**
 * useRecoveryCelebration – Unicorn 2.0
 *
 * Detects momentum recovery and triggers Tier 1 celebration.
 * Anti-spam: won't fire again within 7 days for same package.
 * Uses engagement guardrails for validation.
 */

import { useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCelebration } from '@/hooks/use-celebration';
import { useEngagementAudit } from '@/hooks/useEngagementAudit';
import { validateEngagementEvent, ENGAGEMENT_COPY } from '@/lib/engagement-guardrails';
import { useUIPrefs } from '@/hooks/use-ui-prefs';

const RECOVERY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface RecoveryCelebrationOptions {
  celebrationsEnabled?: boolean;
  isClientPortal?: boolean;
}

export function useRecoveryCelebration(options: RecoveryCelebrationOptions = {}) {
  const { trigger } = useCelebration();
  const cooldownMap = useRef<Map<string, number>>(new Map());
  const { logEngagementEvent } = useEngagementAudit();
  const { prefs } = useUIPrefs();

  const logRecovery = useMutation({
    mutationFn: async ({
      tenantId,
      packageInstanceId,
    }: {
      tenantId: number;
      packageInstanceId: number;
    }) => {
      await supabase.from('momentum_state_history' as any).insert({
        tenant_id: tenantId,
        package_instance_id: packageInstanceId,
        state: 'recovered',
        pause_reason: [],
        changed_by_system: false,
      });

      await supabase.from('audit_events').insert({
        entity: 'momentum',
        entity_id: String(packageInstanceId),
        action: 'momentum_recovered',
        user_id: null,
        details: { tenant_id: tenantId, package_instance_id: packageInstanceId },
      });
    },
  });

  const triggerRecovery = useCallback(
    (tenantId: number, packageInstanceId: number) => {
      const key = `${tenantId}:${packageInstanceId}`;
      const now = Date.now();
      const last = cooldownMap.current.get(key);
      if (last && now - last < RECOVERY_COOLDOWN_MS) return;

      // Guardrail validation
      const validation = validateEngagementEvent({
        eventType: 'momentum_restored',
        isClientPortal: options.isClientPortal ?? false,
        reducedMotion: prefs.reduce_motion,
        celebrationsEnabled: options.celebrationsEnabled ?? true,
        completionCascadeEnabled: true,
      });

      logEngagementEvent({
        tenantId,
        packageInstanceId,
        eventType: 'momentum_restored',
        tier: 'spark',
        validationPassed: validation.allowed,
        validationNotes: { reasons_blocked: validation.reasonsBlocked },
      });

      if (!validation.allowed) {
        console.warn('[RecoveryCelebration] Blocked:', validation.reasonsBlocked);
        return;
      }

      cooldownMap.current.set(key, now);
      logRecovery.mutate({ tenantId, packageInstanceId });

      const copy = ENGAGEMENT_COPY.momentum_restored;
      trigger({
        tier: 'spark',
        message: copy.title,
        duration: 1500,
      });
    },
    [trigger, logRecovery, prefs.reduce_motion, options, logEngagementEvent],
  );

  return { triggerRecovery };
}

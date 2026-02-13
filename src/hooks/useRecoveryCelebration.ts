/**
 * useRecoveryCelebration – Unicorn 2.0
 *
 * Detects momentum recovery and triggers Tier 1 celebration.
 * Anti-spam: won't fire again within 7 days for same package.
 */

import { useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCelebration } from '@/hooks/use-celebration';

const RECOVERY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function useRecoveryCelebration() {
  const { trigger } = useCelebration();
  const cooldownMap = useRef<Map<string, number>>(new Map());

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

      cooldownMap.current.set(key, now);

      logRecovery.mutate({ tenantId, packageInstanceId });

      trigger({
        tier: 'spark',
        message: 'Momentum Restored',
        duration: 1500,
      });
    },
    [trigger, logRecovery],
  );

  return { triggerRecovery };
}

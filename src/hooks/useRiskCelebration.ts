/**
 * useRiskCelebration – Unicorn 2.0
 *
 * Hook to trigger a Tier 1 celebration when risks are resolved.
 * Anti-spam: only one celebration per batch, with 60s cooldown.
 * Call triggerRiskResolved(count) after server confirms risk status change.
 */

import { useCallback, useRef } from 'react';
import { useCelebration } from '@/hooks/use-celebration';

const RISK_COOLDOWN_MS = 60_000;

export function useRiskCelebration() {
  const { trigger } = useCelebration();
  const lastFiredRef = useRef<number>(0);

  const triggerRiskResolved = useCallback(
    (count: number = 1) => {
      const now = Date.now();
      if (now - lastFiredRef.current < RISK_COOLDOWN_MS) return;
      lastFiredRef.current = now;

      trigger({
        tier: 'spark',
        message: count > 1 ? `${count} Risks Resolved` : 'Risk Resolved',
        duration: 1500,
      });
    },
    [trigger],
  );

  return { triggerRiskResolved };
}

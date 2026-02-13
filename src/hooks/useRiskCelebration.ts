/**
 * useRiskCelebration – Unicorn 2.0
 *
 * Tier 1 celebration on risk resolution with guardrail validation.
 * Anti-spam: 60s cooldown. Logs to engagement audit.
 */

import { useCallback, useRef } from 'react';
import { useCelebration } from '@/hooks/use-celebration';
import { useEngagementAudit } from './useEngagementAudit';
import { validateEngagementEvent, ENGAGEMENT_COPY } from '@/lib/engagement-guardrails';
import { useUIPrefs } from '@/hooks/use-ui-prefs';

const RISK_COOLDOWN_MS = 60_000;

interface RiskCelebrationOptions {
  tenantId?: number;
  celebrationsEnabled?: boolean;
  isClientPortal?: boolean;
  actorUserUuid?: string;
}

export function useRiskCelebration(options: RiskCelebrationOptions = {}) {
  const { trigger } = useCelebration();
  const lastFiredRef = useRef<number>(0);
  const { logEngagementEvent } = useEngagementAudit();
  const { prefs } = useUIPrefs();

  const triggerRiskResolved = useCallback(
    (count: number = 1) => {
      const now = Date.now();
      if (now - lastFiredRef.current < RISK_COOLDOWN_MS) return;

      // Validate through guardrails
      const validation = validateEngagementEvent({
        eventType: 'risk_resolved',
        isClientPortal: options.isClientPortal ?? false,
        reducedMotion: prefs.reduce_motion,
        celebrationsEnabled: options.celebrationsEnabled ?? true,
        completionCascadeEnabled: true,
      });

      // Always log
      if (options.tenantId) {
        logEngagementEvent({
          tenantId: options.tenantId,
          actorUserUuid: options.actorUserUuid,
          eventType: 'risk_resolved',
          tier: 'spark',
          validationPassed: validation.allowed,
          validationNotes: { reasons_blocked: validation.reasonsBlocked, count },
        });
      }

      if (!validation.allowed) {
        console.warn('[RiskCelebration] Blocked:', validation.reasonsBlocked);
        return;
      }

      lastFiredRef.current = now;
      const copy = ENGAGEMENT_COPY.risk_resolved;

      trigger({
        tier: 'spark',
        message: count > 1 ? `${count} Risks Resolved` : copy.title,
        duration: 1500,
      });
    },
    [trigger, prefs.reduce_motion, options, logEngagementEvent],
  );

  return { triggerRiskResolved };
}

/**
 * useCompletionCascade – Unicorn 2.0
 *
 * Orchestrates the completion cascade with integrity guardrails.
 * Validates via engagement-guardrails before triggering.
 */

import { useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCelebration } from '@/hooks/use-celebration';
import { useCompletionEligibility } from './useCompletionEligibility';
import { useEngagementAudit } from './useEngagementAudit';
import {
  validateEngagementEvent,
  validateBadgeUnlock,
  ENGAGEMENT_COPY,
} from '@/lib/engagement-guardrails';
import { useUIPrefs } from '@/hooks/use-ui-prefs';

interface CompletionCascadeParams {
  tenantId: number;
  packageInstanceId: number;
  actorUserUuid: string;
  isClientPortal?: boolean;
  celebrationsEnabled?: boolean;
  completionCascadeEnabled?: boolean;
  onComplete?: (completionId: string) => void;
}

export function useCompletionCascade({
  tenantId,
  packageInstanceId,
  actorUserUuid,
  isClientPortal = false,
  celebrationsEnabled = true,
  completionCascadeEnabled = true,
  onComplete,
}: CompletionCascadeParams) {
  const { trigger } = useCelebration();
  const queryClient = useQueryClient();
  const firedRef = useRef(false);
  const { logEngagementEvent } = useEngagementAudit();
  const { prefs } = useUIPrefs();

  const { data: eligibility } = useCompletionEligibility(tenantId, packageInstanceId);

  const executeCascade = useMutation({
    mutationFn: async () => {
      if (firedRef.current) throw new Error('Cascade already executed');

      // ── Engagement validation ──
      const validation = validateEngagementEvent({
        eventType: 'completion_cascade',
        isClientPortal,
        reducedMotion: prefs.reduce_motion,
        celebrationsEnabled,
        completionCascadeEnabled,
        complianceContext: eligibility ? {
          finalPhaseCompleted: eligibility.is_final_phase_completed,
          missingRequiredDocsRatio: eligibility.missing_required_docs_ratio,
          hasActiveCritical: eligibility.has_active_critical,
        } : undefined,
      });

      // ── Badge validation ──
      const badgeValidation = validateBadgeUnlock({
        finalPhaseCompleted: eligibility?.is_final_phase_completed ?? false,
        requiredDocsPresent: (eligibility?.missing_required_docs_ratio ?? 1) <= 0.05,
        hasActiveCritical: eligibility?.has_active_critical ?? true,
        complianceScoreCapped: false,
      });

      // Log the attempt regardless
      await logEngagementEvent({
        tenantId,
        packageInstanceId,
        actorUserUuid,
        eventType: 'completion_cascade',
        tier: validation.tierAllowed ?? 'milestone',
        validationPassed: validation.allowed && badgeValidation.allowed,
        validationNotes: {
          engagement_reasons: validation.reasonsBlocked,
          badge_reasons: badgeValidation.reasons,
        },
      });

      if (!validation.allowed || !badgeValidation.allowed) {
        throw new Error(
          `Integrity check failed: ${[...validation.reasonsBlocked, ...badgeValidation.reasons].join(', ')}`,
        );
      }

      firedRef.current = true;

      // Step 1: Unlock badge
      const { error: badgeError } = await supabase
        .from('client_badges' as any)
        .upsert({
          tenant_id: tenantId,
          package_instance_id: packageInstanceId,
          badge_key: 'audit_ready',
          badge_label: 'Audit Ready',
          unlocked_by_user_uuid: actorUserUuid,
          meta: { triggered_by: 'completion_cascade' },
        }, { onConflict: 'tenant_id,package_instance_id,badge_key' });

      if (badgeError) console.error('[Completion] Badge error:', badgeError);

      // Step 2: Create completion record
      const { data: completion, error: completionError } = await supabase
        .from('client_completions' as any)
        .upsert({
          tenant_id: tenantId,
          package_instance_id: packageInstanceId,
          completed_by_user_uuid: actorUserUuid,
          completed_at: new Date().toISOString(),
          meta: { cascade_triggered: true },
        }, { onConflict: 'tenant_id,package_instance_id' })
        .select()
        .single();

      if (completionError) console.error('[Completion] Record error:', completionError);

      // Step 3: Audit log
      await supabase.from('audit_events').insert({
        entity: 'completion',
        entity_id: (completion as any)?.id ?? crypto.randomUUID(),
        action: 'package_completion_cascade',
        user_id: actorUserUuid,
        details: {
          tenant_id: tenantId,
          package_instance_id: packageInstanceId,
          is_client_portal: isClientPortal,
          integrity_passed: true,
        },
      });

      return completion;
    },
    onSuccess: (completion) => {
      const copy = ENGAGEMENT_COPY.completion_cascade;
      trigger({
        tier: 'milestone',
        message: copy.title,
        subtitle: copy.subtitle,
        duration: 2000,
        ctaLabel: 'View Summary',
        ctaAction: () => onComplete?.((completion as any)?.id),
      });

      queryClient.invalidateQueries({ queryKey: ['completion-eligibility'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-score'] });
    },
  });

  const canTrigger = eligibility?.eligible === true && !firedRef.current;

  const triggerCascade = useCallback(() => {
    if (!canTrigger) return;
    executeCascade.mutate();
  }, [canTrigger, executeCascade]);

  return {
    eligibility,
    canTrigger,
    triggerCascade,
    isExecuting: executeCascade.isPending,
  };
}

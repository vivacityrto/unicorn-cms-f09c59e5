/**
 * useCompletionCascade – Unicorn 2.0
 *
 * Orchestrates the completion cascade sequence:
 * 1. Check eligibility
 * 2. Fire celebration (Tier 2)
 * 3. Unlock badge
 * 4. Create completion record
 * 5. Open summary modal
 */

import { useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCelebration } from '@/hooks/use-celebration';
import { useCompletionEligibility } from './useCompletionEligibility';

interface CompletionCascadeParams {
  tenantId: number;
  packageInstanceId: number;
  actorUserUuid: string;
  isClientPortal?: boolean;
  onComplete?: (completionId: string) => void;
}

export function useCompletionCascade({
  tenantId,
  packageInstanceId,
  actorUserUuid,
  isClientPortal = false,
  onComplete,
}: CompletionCascadeParams) {
  const { trigger } = useCelebration();
  const queryClient = useQueryClient();
  const firedRef = useRef(false);

  const { data: eligibility } = useCompletionEligibility(tenantId, packageInstanceId);

  const executeCascade = useMutation({
    mutationFn: async () => {
      if (firedRef.current) throw new Error('Cascade already executed');
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
        },
      });

      return completion;
    },
    onSuccess: (completion) => {
      // Step 4: Fire celebration
      trigger({
        tier: 'milestone', // Tier 2
        message: 'Completion Achieved',
        subtitle: 'All phases complete. Your package is audit ready.',
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

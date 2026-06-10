import { useAuth } from '@/hooks/useAuth';
import { isVivacityStaffRole } from '@/lib/roles/vivacityRoles';

/**
 * Returns true if the current user is eligible to see EOS facilitator
 * guidance (prompts, checklists, insights, alerts, onboarding/health panels).
 *
 * Replaces the old global Facilitator Mode toggle — guidance now renders
 * automatically for eligible internal staff on EOS pages.
 *
 * Eligible: any Vivacity internal staff role.
 */
export function useEosFacilitatorEligible(): boolean {
  const { profile } = useAuth();
  return isVivacityStaffRole(profile?.unicorn_role);
}

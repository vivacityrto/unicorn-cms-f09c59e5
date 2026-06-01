import { useAuth } from '@/hooks/useAuth';

/**
 * Returns true if the current user is eligible to see EOS facilitator
 * guidance (prompts, checklists, insights, alerts, onboarding/health panels).
 *
 * Replaces the old global Facilitator Mode toggle — guidance now renders
 * automatically for eligible internal staff on EOS pages.
 *
 * Eligible roles: Super Admin, Team Leader.
 */
export function useEosFacilitatorEligible(): boolean {
  const { profile } = useAuth();
  const role = profile?.unicorn_role || '';
  return role === 'Super Admin' || role === 'Team Leader';
}

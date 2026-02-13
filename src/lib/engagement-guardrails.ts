/**
 * Engagement Guardrails – Unicorn 2.0
 *
 * Central integrity layer enforcing celebration governance.
 * All celebration/badge triggers MUST pass through validateEngagementEvent().
 */

import type { CelebrationTier } from '@/lib/celebration-engine';

// ============================================================
// 1. Allowed celebration events (strict whitelist)
// ============================================================

export type AllowedCelebrationEvent =
  // Tier 2
  | 'phase_complete'
  | 'healthcheck_finalised'
  | 'package_complete'
  | 'completion_cascade'
  // Tier 1
  | 'risk_resolved'
  | 'weekly_milestone'
  | 'momentum_restored';

export const ALLOWED_CELEBRATION_EVENTS: Record<AllowedCelebrationEvent, CelebrationTier> = {
  // Tier 2 – milestone
  phase_complete: 'milestone',
  healthcheck_finalised: 'milestone',
  package_complete: 'milestone',
  completion_cascade: 'milestone',
  // Tier 1 – spark
  risk_resolved: 'spark',
  weekly_milestone: 'spark',
  momentum_restored: 'spark',
} as const;

/** Events that are explicitly blocked from triggering celebrations */
const BLOCKED_EVENTS = new Set([
  'form_save',
  'minor_edit',
  'checklist_item_update',
  'single_document_upload',
  'admin_change',
  'settings_update',
  'note_added',
]);

// ============================================================
// 2. Engagement copy dictionary (no gamified language)
// ============================================================

export const ENGAGEMENT_COPY: Record<AllowedCelebrationEvent, { title: string; subtitle: string }> = {
  phase_complete: { title: 'Phase Completed', subtitle: 'This compliance phase is now finalised.' },
  healthcheck_finalised: { title: 'Health Check Finalised', subtitle: 'Health check review is complete.' },
  package_complete: { title: 'Package Complete', subtitle: 'All package deliverables are finalised.' },
  completion_cascade: { title: 'Completion Achieved', subtitle: 'All phases complete. Audit ready.' },
  risk_resolved: { title: 'Risk Resolved', subtitle: 'Outstanding risk has been addressed.' },
  weekly_milestone: { title: 'Weekly Milestone', subtitle: 'Milestone unlocked this week.' },
  momentum_restored: { title: 'Momentum Restored', subtitle: 'Progress has resumed.' },
};

// ============================================================
// 3. Config flag
// ============================================================

export const ENABLE_TEAM_LEADERBOARD = false;

// ============================================================
// 4. Validation context
// ============================================================

export interface EngagementValidationContext {
  eventType: string;
  isClientPortal: boolean;
  reducedMotion: boolean;
  celebrationsEnabled: boolean;
  completionCascadeEnabled: boolean;
  /** For completion/badge events */
  complianceContext?: {
    finalPhaseCompleted: boolean;
    missingRequiredDocsRatio: number;
    hasActiveCritical: boolean;
    /** Score cap keys that are active */
    activeCaps?: string[];
  };
}

export interface EngagementValidationResult {
  allowed: boolean;
  tierAllowed: CelebrationTier | null;
  reasonsBlocked: string[];
}

// ============================================================
// 5. Central guard function
// ============================================================

export function validateEngagementEvent(
  context: EngagementValidationContext,
): EngagementValidationResult {
  const reasons: string[] = [];

  // Check global celebration toggle
  if (!context.celebrationsEnabled) {
    reasons.push('celebrations_disabled');
  }

  // Check if event is explicitly blocked
  if (BLOCKED_EVENTS.has(context.eventType)) {
    reasons.push('event_blocked');
  }

  // Check if event is in allowed whitelist
  const allowedTier = ALLOWED_CELEBRATION_EVENTS[context.eventType as AllowedCelebrationEvent];
  if (!allowedTier) {
    reasons.push('event_not_whitelisted');
  }

  // Client portal: never Tier 3
  if (context.isClientPortal && allowedTier === 'enterprise') {
    reasons.push('tier3_blocked_in_client_portal');
  }

  // Completion cascade gate
  if (
    (context.eventType === 'completion_cascade' || context.eventType === 'package_complete') &&
    !context.completionCascadeEnabled
  ) {
    reasons.push('completion_cascade_disabled');
  }

  // Compliance integrity checks for completion/badge events
  if (context.complianceContext) {
    const cc = context.complianceContext;

    if (!cc.finalPhaseCompleted) {
      reasons.push('final_phase_not_completed');
    }

    // Required docs coverage must be ≥ 95%
    if (cc.missingRequiredDocsRatio > 0.05) {
      reasons.push('missing_required_docs_above_threshold');
    }

    if (cc.hasActiveCritical) {
      reasons.push('active_critical_risk');
    }

    // Check score caps
    if (cc.activeCaps?.includes('critical_risk_cap')) {
      reasons.push('critical_risk_cap_active');
    }
    if (cc.activeCaps?.includes('missing_docs_cap')) {
      reasons.push('missing_docs_cap_active');
    }
  }

  const allowed = reasons.length === 0;
  const tierAllowed = allowed ? (allowedTier ?? null) : null;

  return { allowed, tierAllowed, reasonsBlocked: reasons };
}

// ============================================================
// 6. Badge validation
// ============================================================

export interface BadgeValidationContext {
  finalPhaseCompleted: boolean;
  requiredDocsPresent: boolean;
  hasActiveCritical: boolean;
  complianceScoreCapped: boolean;
}

export function validateBadgeUnlock(context: BadgeValidationContext): {
  allowed: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (!context.finalPhaseCompleted) reasons.push('phase_incomplete');
  if (!context.requiredDocsPresent) reasons.push('required_docs_missing');
  if (context.hasActiveCritical) reasons.push('active_critical_risk');
  if (context.complianceScoreCapped) reasons.push('score_capped');

  return { allowed: reasons.length === 0, reasons };
}

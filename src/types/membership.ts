// Superhero Membership Dashboard Types
import type { Json } from '@/integrations/supabase/types';

export type MembershipState = 'active' | 'at_risk' | 'paused' | 'exiting';
export type ObligationStatus = 'not_scheduled' | 'scheduled' | 'delivered';

// Package type definitions
export type PackageType = 'membership' | 'audit' | 'project' | 'regulatory_submission';
export type ProgressMode = 'stage_completion' | 'phase_based' | 'milestone_based' | 'entitlement_milestone';
export type StageType = 'setup' | 'delivery' | 'review' | 'submission' | 'waiting' | 'entitlement' | 'recurring' | 'closeout';

// Task status enums (canonical)
export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'waiting_on_client' | 'waiting_on_regulator' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskSource = 'manual' | 'template' | 'system_suggestion' | 'ai_suggestion';

// Stage status enum
export type StageStatus = 'not_started' | 'in_progress' | 'blocked' | 'waiting' | 'complete' | 'skipped';

// Client package state
export type ClientPackageState = 'ACTIVE' | 'AT_RISK' | 'PAUSED' | 'EXITING' | 'CLOSED';

// Package Stage Map (links stages to packages)
export interface PackageStageMap {
  id: number;
  package_id: number;
  stage_id: number;
  sort_order: number;
  is_required: boolean;
  dashboard_visible: boolean;
  created_at: string;
  updated_at: string;
}

// Client Package Stage State
export interface ClientPackageStageState {
  id: number;
  tenant_id: number;
  package_id: number;
  stage_id: number;
  status: StageStatus;
  is_required: boolean;
  sort_order: number;
  started_at: string | null;
  completed_at: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  waiting_at: string | null;
  waiting_reason: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  // Joined fields
  stage_name?: string;
  stage_type?: StageType;
}

// Stage State Audit Log entry
export interface StageStateAuditEntry {
  id: number;
  stage_state_id: number;
  old_status: string | null;
  new_status: string;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
}

// Stage group definitions for dashboard rendering
export const STAGE_GROUP_LABELS: Record<string, string> = {
  setup: 'Onboarding',
  delivery: 'Delivery',
  review: 'Review',
  submission: 'Submission & External',
  waiting: 'Waiting',
  entitlement: 'Ongoing Access',
  recurring: 'Usage & Support',
  closeout: 'Closeout',
};

// Stage types grouped by dashboard section
export const MEMBERSHIP_STAGE_GROUPS = {
  onboarding: ['setup'],
  ongoing_access: ['entitlement'],
  usage_support: ['recurring'],
  annual_obligations: ['review'], // CHC, Validation
  // closeout is hidden
};

export interface MembershipTier {
  id: number;
  name: string;
  fullText: string;
  hoursIncluded: number;
  color: string;
  bgColor: string;
  isCricos?: boolean;
}

export const MEMBERSHIP_TIERS: Record<string, MembershipTier> = {
  // RTO Tiers
  'M-AM': { id: 29, name: 'M-AM', fullText: 'Amethyst', hoursIncluded: 0, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  'M-GR': { id: 16, name: 'M-GR', fullText: 'Gold', hoursIncluded: 7, color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  'M-RR': { id: 3, name: 'M-RR', fullText: 'Ruby', hoursIncluded: 28, color: 'text-red-600', bgColor: 'bg-red-100' },
  'M-SAR': { id: 22, name: 'M-SAR', fullText: 'Sapphire', hoursIncluded: 56, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  'M-DR': { id: 39, name: 'M-DR', fullText: 'Diamond', hoursIncluded: 91, color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
  // CRICOS Tiers
  'M-GC': { id: 13, name: 'M-GC', fullText: 'Gold CRICOS', hoursIncluded: 7, color: 'text-yellow-600', bgColor: 'bg-yellow-100', isCricos: true },
  'M-RC': { id: 5, name: 'M-RC', fullText: 'Ruby CRICOS', hoursIncluded: 28, color: 'text-red-600', bgColor: 'bg-red-100', isCricos: true },
  'M-SAC': { id: 24, name: 'M-SAC', fullText: 'Sapphire CRICOS', hoursIncluded: 56, color: 'text-blue-600', bgColor: 'bg-blue-100', isCricos: true },
  'M-DC': { id: 40, name: 'M-DC', fullText: 'Diamond CRICOS', hoursIncluded: 105, color: 'text-cyan-600', bgColor: 'bg-cyan-100', isCricos: true },
};

// All membership package IDs (RTO + CRICOS)
export const SUPERHERO_PACKAGE_IDS = [29, 16, 3, 22, 39, 13, 5, 24, 40]; // M-AM, M-GR, M-RR, M-SAR, M-DR, M-GC, M-RC, M-SAC, M-DC

// Risk flag definitions
export type RiskFlagCode = 'OVERDUE_TASKS' | 'MISSING_CSC' | 'NO_ACTIVITY' | 'WAITING_TOO_LONG' | 'SUBMISSION_RISK' | 'HOURS_AT_RISK' | 'STAGE_OVERDUE';
export type RiskFlagSeverity = 'info' | 'warn' | 'critical';

export interface RiskFlag {
  code: RiskFlagCode;
  severity: RiskFlagSeverity;
  message: string;
  source: 'task' | 'stage' | 'activity' | 'system';
}

// Next action computed by server
export interface NextAction {
  title: string;
  due_at: string | null;
  owner_id: string | null;
  source: 'task' | 'system';
  reason: string;
}

// Phase for non-membership packages
export type PackagePhase = 'Setup' | 'Delivery' | 'Submission' | 'External' | 'Closeout' | 'Ongoing';

// Dashboard rollup from RPC
export interface MembershipRollup {
  tenant_id: number;
  package_id: number;
  next_action_title: string;
  next_action_due_at: string | null;
  next_action_owner_id: string | null;
  next_action_source: string;
  next_action_reason: string;
  risk_flags: RiskFlag[] | null;
  // New deterministic stage fields
  current_stage_name: string | null;
  current_stage_status: string | null;
  progress_percent: number;
  phase: PackagePhase | null;
}

export interface MembershipEntitlement {
  id: string;
  tenant_id: number;
  package_id: number;
  hours_included_monthly: number;
  hours_used_current_month: number;
  month_start_date: string;
  membership_state: string;
  setup_complete: boolean;
  setup_completed_at: string | null;
  health_check_status: string;
  health_check_scheduled_date: string | null;
  validation_status: string;
  validation_scheduled_date: string | null;
  csc_user_id: string | null;
  membership_started_at: string;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipActivity {
  id: string;
  tenant_id: number;
  package_id: number;
  user_id: string | null;
  activity_type: string;
  title: string;
  description: string | null;
  metadata: Json;
  created_at: string;
}

export interface MembershipTask {
  id: string;
  tenant_id: number;
  package_id: number;
  assigned_to: string | null;
  title: string;
  description: string | null;
  task_type: string;
  priority: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
}

export interface MembershipNote {
  id: string;
  tenant_id: number;
  package_id: number;
  content: string;
  note_type: string;
  created_by: string;
  created_at: string;
}

export interface MembershipAISuggestion {
  id: string;
  tenant_id: number;
  package_id: number;
  suggestion_type: string;
  title: string;
  content: string;
  priority: string;
  status: string;
  created_at: string;
}

export interface MembershipHealthScore {
  score: number;
  status: 'healthy' | 'warning' | 'critical';
  risk_factors: Array<{
    type: string;
    message: string;
  }>;
}

export interface MembershipWithDetails extends MembershipEntitlement {
  tenant_name: string;
  package_name: string;
  tier: MembershipTier;
  csc_name: string | null;
  csc_avatar: string | null;
  health_score: MembershipHealthScore;
  overdue_tasks_count: number;
  pending_tasks_count: number;
  // Computed from RPC
  next_action: NextAction | null;
  risk_flags: RiskFlag[];
  // Deterministic stage tracking
  current_stage_name: string | null;
  current_stage_status: StageStatus | null;
  progress_percent: number;
  phase: PackagePhase | null;
}

export interface KPIStats {
  overdueActions: number;
  hoursAtRisk: number;
  obligationsDue: number;
  noActivity21Days: number;
  atRiskMemberships: number;
}

export type SavedView = 'all' | 'my_memberships' | 'overdue_actions' | 'hours_at_risk' | 'obligations_due';

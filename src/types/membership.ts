// Superhero Membership Dashboard Types
import type { Json } from '@/integrations/supabase/types';

export type MembershipState = 'active' | 'at_risk' | 'paused' | 'exiting';
export type ObligationStatus = 'not_scheduled' | 'scheduled' | 'delivered';

export interface MembershipTier {
  id: number;
  name: string;
  fullText: string;
  hoursIncluded: number;
  color: string;
  bgColor: string;
}

export const MEMBERSHIP_TIERS: Record<string, MembershipTier> = {
  'M-AM': { id: 29, name: 'M-AM', fullText: 'Amethyst', hoursIncluded: 0, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  'M-GR': { id: 16, name: 'M-GR', fullText: 'Gold', hoursIncluded: 7, color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  'M-RR': { id: 3, name: 'M-RR', fullText: 'Ruby', hoursIncluded: 28, color: 'text-red-600', bgColor: 'bg-red-100' },
  'M-SAR': { id: 22, name: 'M-SAR', fullText: 'Sapphire', hoursIncluded: 56, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  'M-DR': { id: 39, name: 'M-DR', fullText: 'Diamond', hoursIncluded: 91, color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
};

export const SUPERHERO_PACKAGE_IDS = [29, 16, 3, 22, 39]; // M-AM, M-GR, M-RR, M-SAR, M-DR

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
}

export interface KPIStats {
  overdueActions: number;
  hoursAtRisk: number;
  obligationsDue: number;
  noActivity21Days: number;
  atRiskMemberships: number;
}

export type SavedView = 'all' | 'my_memberships' | 'overdue_actions' | 'hours_at_risk' | 'obligations_due';

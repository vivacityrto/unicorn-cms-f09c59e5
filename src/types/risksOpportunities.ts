// Risks & Opportunities Type Definitions
// These types are derived from database enums and views - do NOT hardcode values here

export type RiskOpportunityType = 'risk' | 'opportunity';

// Category values come from eos_issue_category_options view
export type RiskOpportunityCategory = 
  | 'Delivery'
  | 'Compliance'
  | 'Financial'
  | 'Capacity'
  | 'Systems'
  | 'Client'
  | 'Strategic'
  | 'Growth';

// Impact values come from eos_issue_impact_options view
export type RiskOpportunityImpact = 'Low' | 'Medium' | 'High' | 'Critical';

// Status values come from eos_issue_status enum via eos_issue_status_options view
// These MUST match the database enum exactly (case-sensitive)
export type RiskOpportunityStatus = 
  | 'Open'
  | 'Discussing'
  | 'Solved'
  | 'Archived'
  | 'In Review'
  | 'Actioning'
  | 'Escalated'
  | 'Closed';

export interface RiskOpportunity {
  id: string;
  tenant_id: number;
  item_type: RiskOpportunityType;
  title: string;
  description?: string;
  why_it_matters?: string;
  category?: RiskOpportunityCategory;
  impact?: RiskOpportunityImpact;
  status: RiskOpportunityStatus;
  quarter_number?: number;
  quarter_year?: number;
  linked_rock_id?: string;
  assigned_to?: string;
  created_by?: string;
  outcome_note?: string;
  meeting_id?: string;
  meeting_segment_id?: string;
  source?: 'ad_hoc' | 'meeting_ids' | 'ro_page' | 'meeting_l10' | 'meeting_quarterly' | 'meeting_annual';
  // Lifecycle tracking
  resolved_at?: string;
  resolved_by?: string;
  escalated_at?: string;
  escalation_reason?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

// NOTE: Do NOT use these hardcoded constants - use useEosOptions hooks instead
// These are kept only for TypeScript type definitions
// @deprecated Use useEosCategoryOptions() hook instead
export const CATEGORIES: RiskOpportunityCategory[] = [
  'Delivery',
  'Compliance',
  'Financial',
  'Capacity',
  'Systems',
  'Client',
  'Strategic',
  'Growth',
];

// @deprecated Use useEosImpactOptions() hook instead
export const IMPACTS: RiskOpportunityImpact[] = ['Low', 'Medium', 'High', 'Critical'];

// @deprecated Use useEosStatusOptions() hook instead
export const STATUSES: RiskOpportunityStatus[] = [
  'Open',
  'Discussing',
  'Solved',
  'Archived',
  'In Review',
  'Actioning',
  'Escalated',
  'Closed',
];

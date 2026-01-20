// Risks & Opportunities Type Definitions

export type RiskOpportunityType = 'risk' | 'opportunity';

export type RiskOpportunityCategory = 
  | 'Delivery'
  | 'Compliance'
  | 'Financial'
  | 'Capacity'
  | 'Systems'
  | 'Client'
  | 'Strategic'
  | 'Growth';

export type RiskOpportunityImpact = 'Low' | 'Medium' | 'High' | 'Critical';

export type RiskOpportunityStatus = 
  | 'Open'
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
  category?: RiskOpportunityCategory;
  impact?: RiskOpportunityImpact;
  status: RiskOpportunityStatus;
  quarter_number?: number;
  quarter_year?: number;
  linked_rock_id?: string;
  assigned_to?: string;
  created_by?: string;
  outcome_note?: string;
  created_at: string;
  updated_at: string;
}

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

export const IMPACTS: RiskOpportunityImpact[] = ['Low', 'Medium', 'High', 'Critical'];

export const STATUSES: RiskOpportunityStatus[] = [
  'Open',
  'In Review',
  'Actioning',
  'Escalated',
  'Closed',
];

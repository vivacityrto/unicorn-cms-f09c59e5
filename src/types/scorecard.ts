// EOS Scorecard v2 Type Definitions

export type MetricDirection = 'higher_is_better' | 'lower_is_better' | 'equals_target';
export type MetricSource = 'manual' | 'automatic' | 'hybrid';
export type MetricStatus = 'green' | 'red' | 'amber' | 'no_data';
export type EntrySource = 'manual' | 'system';

export type MetricCategory =
  | 'Sales'
  | 'Marketing'
  | 'Delivery'
  | 'Product'
  | 'Finance'
  | 'Team'
  | 'Compliance'
  | 'CST';

export const METRIC_CATEGORIES: MetricCategory[] = [
  'Sales',
  'Marketing',
  'Delivery',
  'Product',
  'Finance',
  'Team',
  'Compliance',
  'CST',
];

export const METRIC_UNITS = ['Count', '$', '%', 'Hours', 'Days'];

export interface ScorecardMetric {
  id: string;
  scorecard_id: string;
  tenant_id: number;
  name: string;
  description?: string | null;
  category: string;
  owner_id?: string | null;
  target_value: number;
  unit: string;
  direction: MetricDirection;
  frequency: string;
  metric_source: MetricSource;
  metric_key?: string | null;
  example_result?: string | null;
  is_active: boolean;
  is_archived: boolean;
  display_order: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // computed
  latestEntry?: ScorecardEntry | null;
  latestStatus?: MetricStatus;
  recentEntries?: ScorecardEntry[];
}

export interface ScorecardEntry {
  id: string;
  metric_id: string;
  tenant_id: number;
  week_ending: string;
  value: number;
  actual_value?: number | null;
  notes?: string | null;
  entered_by: string;
  entered_at: string;
  entry_source: EntrySource;
  status?: MetricStatus | null;
  created_by?: string | null;
  updated_at?: string | null;
}

export interface AutomationRule {
  id: string;
  metric_id: string;
  tenant_id: number;
  source_type: string;
  source_config: Record<string, unknown>;
  is_enabled: boolean;
  last_run_at?: string | null;
  last_run_status?: string | null;
  created_at: string;
  updated_at: string;
}

// Status calculation
export function calculateStatus(
  actualValue: number,
  targetValue: number,
  direction: MetricDirection,
  amberThresholdPct = 10,
): MetricStatus {
  const diff = actualValue - targetValue;
  const pctOff = Math.abs(diff / targetValue) * 100;

  switch (direction) {
    case 'higher_is_better':
      if (actualValue >= targetValue) return 'green';
      if (pctOff <= amberThresholdPct) return 'amber';
      return 'red';
    case 'lower_is_better':
      if (actualValue <= targetValue) return 'green';
      if (pctOff <= amberThresholdPct) return 'amber';
      return 'red';
    case 'equals_target':
      if (actualValue === targetValue) return 'green';
      if (pctOff <= amberThresholdPct) return 'amber';
      return 'red';
    default:
      return 'no_data';
  }
}

// Direction labels
export const DIRECTION_LABELS: Record<MetricDirection, string> = {
  higher_is_better: 'Higher is better',
  lower_is_better: 'Lower is better',
  equals_target: 'Must equal target',
};

export const DIRECTION_PREVIEW: Record<MetricDirection, string> = {
  higher_is_better: '🟢 Green when actual ≥ target',
  lower_is_better: '🟢 Green when actual ≤ target',
  equals_target: '🟢 Green when actual = target',
};

// Metric templates
export interface MetricTemplate {
  name: string;
  description: string;
  category: MetricCategory;
  unit: string;
  direction: MetricDirection;
  metric_source: MetricSource;
  metric_key?: string;
  example_result?: string;
  defaultTarget?: number;
}

export const METRIC_TEMPLATES: MetricTemplate[] = [
  {
    name: 'Qualified Leads',
    description: 'Number of qualified leads generated this week',
    category: 'Sales',
    unit: 'Count',
    direction: 'higher_is_better',
    metric_source: 'manual',
    metric_key: 'qualified_leads_count',
    example_result: '12 leads',
    defaultTarget: 10,
  },
  {
    name: 'Discovery Calls Booked',
    description: 'Number of discovery calls booked this week',
    category: 'Sales',
    unit: 'Count',
    direction: 'higher_is_better',
    metric_source: 'manual',
    metric_key: 'discovery_calls_booked_count',
    example_result: '5 calls',
    defaultTarget: 5,
  },
  {
    name: 'Proposals Sent',
    description: 'Number of proposals submitted this week',
    category: 'Sales',
    unit: 'Count',
    direction: 'higher_is_better',
    metric_source: 'manual',
    metric_key: 'proposals_sent_count',
    example_result: '3 proposals',
    defaultTarget: 3,
  },
  {
    name: 'New Clients Signed',
    description: 'Number of new client contracts signed this week',
    category: 'Sales',
    unit: 'Count',
    direction: 'higher_is_better',
    metric_source: 'manual',
    metric_key: 'new_clients_signed_count',
    example_result: '1 client',
    defaultTarget: 1,
  },
  {
    name: 'New Revenue Booked',
    description: 'Total new revenue committed or contracted this week',
    category: 'Finance',
    unit: '$',
    direction: 'higher_is_better',
    metric_source: 'manual',
    metric_key: 'new_revenue_booked_amount',
    example_result: '$12,500',
    defaultTarget: 10000,
  },
  {
    name: 'Projects On Track %',
    description: 'Percentage of active client projects on track this week',
    category: 'Delivery',
    unit: '%',
    direction: 'higher_is_better',
    metric_source: 'automatic',
    metric_key: 'projects_on_track_pct',
    example_result: '85%',
    defaultTarget: 80,
  },
  {
    name: 'Active ComplyHub Users %',
    description: 'Percentage of ComplyHub subscribers active in the last 7 days',
    category: 'Product',
    unit: '%',
    direction: 'higher_is_better',
    metric_source: 'automatic',
    metric_key: 'active_complyhub_users_pct',
    example_result: '72%',
    defaultTarget: 70,
  },
  {
    name: 'Website to Free Trial Conversion %',
    description: 'Percentage of website visitors who start a free trial',
    category: 'Marketing',
    unit: '%',
    direction: 'higher_is_better',
    metric_source: 'manual',
    metric_key: 'website_to_trial_conversion_rate',
    example_result: '3.2%',
    defaultTarget: 3,
  },
  {
    name: 'Platform Reliability Incidents',
    description: 'Number of platform reliability incidents reported this week',
    category: 'Product',
    unit: 'Count',
    direction: 'lower_is_better',
    metric_source: 'manual',
    metric_key: 'platform_reliability_incidents_count',
    example_result: '0 incidents',
    defaultTarget: 0,
  },
  {
    name: 'Clients with Current CHC %',
    description: 'Percentage of clients with a current, valid CHC assessment',
    category: 'Compliance',
    unit: '%',
    direction: 'higher_is_better',
    metric_source: 'automatic',
    metric_key: 'clients_with_current_chc_pct',
    example_result: '92%',
    defaultTarget: 90,
  },
  // CST team metrics for Live Client RTOs. Definitions and the week each value
  // belongs to: docs/kb/reference/cst-scorecard-metric-dictionary-2026-11-17.md.
  // Values come from cst_scorecard_weekly_snapshot via scorecard-refresh.
  // Targets are placeholders for the CST to set.
  {
    name: 'CST: Client activity rate %',
    description: 'Client users active in the portal in the last 28 days, as a share of all client users at Live Client RTOs',
    category: 'CST',
    unit: '%',
    direction: 'higher_is_better',
    metric_source: 'automatic',
    metric_key: 'cst_client_activity_rate_pct',
    example_result: '20%',
    defaultTarget: 50,
  },
  {
    name: 'CST: RTOs with client activity %',
    description: 'Live Client RTOs with at least one active client user in the last 28 days',
    category: 'CST',
    unit: '%',
    direction: 'higher_is_better',
    metric_source: 'automatic',
    metric_key: 'cst_rtos_with_activity_pct',
    example_result: '38%',
    defaultTarget: 60,
  },
  {
    name: 'CST: Certificates issued',
    description: 'Academy certificates issued this week to Live Client RTOs',
    category: 'CST',
    unit: 'Count',
    direction: 'higher_is_better',
    metric_source: 'automatic',
    metric_key: 'cst_certificates_issued_count',
    example_result: '3 certificates',
    defaultTarget: 3,
  },
  {
    name: 'CST: Users never signed in',
    description: 'Client users at Live Client RTOs who have never signed in',
    category: 'CST',
    unit: 'Count',
    direction: 'lower_is_better',
    metric_source: 'automatic',
    metric_key: 'cst_users_never_signed_in_count',
    example_result: '30 users',
    defaultTarget: 15,
  },
  {
    name: 'CST: Live RTOs with no activity',
    description: 'Live Client RTOs with client users but no client activity in the last 28 days',
    category: 'CST',
    unit: 'Count',
    direction: 'lower_is_better',
    metric_source: 'automatic',
    metric_key: 'cst_rtos_no_activity_count',
    example_result: '34 RTOs',
    defaultTarget: 20,
  },
  {
    name: 'Clients with Current Validation %',
    description: 'Percentage of clients with a current assessment validation on file',
    category: 'Compliance',
    unit: '%',
    direction: 'higher_is_better',
    metric_source: 'automatic',
    metric_key: 'clients_with_current_validation_pct',
    example_result: '88%',
    defaultTarget: 85,
  },
];

// People Analyzer Types - Core Values Trend Reporting

export type PARating = 'Plus' | 'PlusMinus' | 'Minus';
export type PAAssessedBy = 'Manager' | 'TeamMember' | 'Self';
export type PATrend = 'Improving' | 'Stable' | 'Declining';

export interface PeopleAnalyzerEntry {
  id: string;
  tenant_id: number;
  qc_id: string;
  user_id: string;
  seat_id: string | null;
  core_value_id: string;
  core_value_text: string;
  rating: PARating;
  assessed_by: PAAssessedBy;
  quarter_year: number;
  quarter_number: number;
  created_at: string;
  created_by: string | null;
}

export interface PeopleAnalyzerTrend {
  id: string;
  tenant_id: number;
  user_id: string;
  seat_id: string | null;
  core_value_id: string;
  core_value_text: string;
  period_start: string;
  period_end: string;
  quarter_year: number;
  quarter_number: number;
  plus_rate: number;
  plus_minus_rate: number;
  minus_rate: number;
  trend: PATrend;
  manager_rating: PARating | null;
  team_member_rating: PARating | null;
  has_divergence: boolean;
  consecutive_minus_count: number;
  is_at_risk: boolean;
  calculated_at: string;
  created_at: string;
  updated_at: string;
}

// Aggregated view for UI
export interface CoreValueTrendSummary {
  core_value_id: string;
  core_value_text: string;
  currentRating: PARating | null;
  trend: PATrend;
  quarters: {
    year: number;
    quarter: number;
    rating: PARating | null;
    managerRating: PARating | null;
    teamMemberRating: PARating | null;
  }[];
  consecutiveMinusCount: number;
  hasDivergence: boolean;
  isAtRisk: boolean;
}

export interface PersonTrendSummary {
  userId: string;
  userName: string;
  seatId: string | null;
  seatName: string | null;
  coreValues: CoreValueTrendSummary[];
  overallHealth: 'Healthy' | 'AtRisk' | 'Declining';
  atRiskCount: number;
}

export interface SeatTrendSummary {
  seatId: string;
  seatName: string;
  functionName: string;
  coreValues: {
    core_value_id: string;
    core_value_text: string;
    trend: PATrend;
    atRiskCount: number;
    totalHolders: number;
  }[];
  systemicIssues: string[];
}

export interface TenantTrendSummary {
  tenantId: number;
  plusRate: number;
  plusMinusRate: number;
  minusRate: number;
  valuesAtRisk: { text: string; minusRate: number }[];
  valuesStrengthening: { text: string; plusRate: number }[];
  overallTrend: PATrend;
}

// Rating display config
export const RATING_CONFIG: Record<PARating, {
  label: string;
  symbol: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  Plus: {
    label: 'Plus',
    symbol: '+',
    color: 'text-emerald-700 dark:text-emerald-300',
    bgColor: 'bg-emerald-100 dark:bg-emerald-950/50',
    borderColor: 'border-emerald-300 dark:border-emerald-800',
  },
  PlusMinus: {
    label: 'Plus/Minus',
    symbol: '+/-',
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-950/50',
    borderColor: 'border-amber-300 dark:border-amber-800',
  },
  Minus: {
    label: 'Minus',
    symbol: '-',
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-950/50',
    borderColor: 'border-red-300 dark:border-red-800',
  },
};

export const TREND_CONFIG: Record<PATrend, {
  label: string;
  color: string;
  bgColor: string;
  icon: 'trending-up' | 'minus' | 'trending-down';
}> = {
  Improving: {
    label: 'Improving',
    color: 'text-emerald-700 dark:text-emerald-300',
    bgColor: 'bg-emerald-100 dark:bg-emerald-950/50',
    icon: 'trending-up',
  },
  Stable: {
    label: 'Stable',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    icon: 'minus',
  },
  Declining: {
    label: 'Declining',
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-950/50',
    icon: 'trending-down',
  },
};

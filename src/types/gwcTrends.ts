// GWC Trend Types for Seat-Based Reporting

export type GWCDimension = 'gets_it' | 'wants_it' | 'capacity';

export type TrendDirection = 'improving' | 'stable' | 'declining';

export type GWCStatus = 'strong' | 'watch' | 'risk';

export const GWC_DIMENSION_LABELS: Record<GWCDimension, string> = {
  gets_it: 'Get It',
  wants_it: 'Want It',
  capacity: 'Capacity',
};

export const GWC_DIMENSION_DESCRIPTIONS: Record<GWCDimension, string> = {
  gets_it: 'Understands the role, responsibilities, and what success looks like',
  wants_it: 'Passionate about the work, motivated, and engaged',
  capacity: 'Has the time, capability, and resources to succeed',
};

export const GWC_STATUS_CONFIG: Record<GWCStatus, { label: string; color: string; bgColor: string; borderColor: string }> = {
  strong: {
    label: 'Strong',
    color: 'text-emerald-700 dark:text-emerald-300',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
  },
  watch: {
    label: 'Watch',
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
  risk: {
    label: 'Risk',
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    borderColor: 'border-destructive/30',
  },
};

export const TREND_CONFIG: Record<TrendDirection, { label: string; color: string; icon: string }> = {
  improving: {
    label: 'Improving',
    color: 'text-emerald-600',
    icon: 'TrendingUp',
  },
  stable: {
    label: 'Stable',
    color: 'text-muted-foreground',
    icon: 'Minus',
  },
  declining: {
    label: 'Declining',
    color: 'text-destructive',
    icon: 'TrendingDown',
  },
};

export interface QuarterlyGWCData {
  quarter_year: number;
  quarter_number: number;
  gets_it_yes: number;
  gets_it_no: number;
  gets_it_total: number;
  wants_it_yes: number;
  wants_it_no: number;
  wants_it_total: number;
  capacity_yes: number;
  capacity_no: number;
  capacity_total: number;
  all_gwc_yes: number;
  total_assessments: number;
}

export interface DimensionTrend {
  dimension: GWCDimension;
  label: string;
  description: string;
  currentYesRate: number;
  previousYesRate: number | null;
  trend: TrendDirection;
  status: GWCStatus;
  quarterlyData: {
    quarter: string; // "Q1 2025"
    yesRate: number;
    yesCount: number;
    noCount: number;
    total: number;
  }[];
  consecutiveNo: number;
  hasDivergence: boolean; // Manager vs Team Member divergence
}

export interface SeatGWCTrends {
  seatId: string;
  seatName: string;
  functionName: string;
  ownerName: string | null;
  dimensions: DimensionTrend[];
  overallStatus: GWCStatus;
  overallTrend: TrendDirection;
  lastAssessed: string | null;
  totalQuarters: number;
  alerts: GWCAlert[];
}

export interface GWCAlert {
  id: string;
  dimension: GWCDimension;
  type: 'consecutive_no' | 'divergence' | 'declining_with_load' | 'all_no';
  severity: 'high' | 'medium' | 'low';
  message: string;
  seatId: string;
  seatName: string;
}

export interface TenantGWCSummary {
  totalSeats: number;
  seatsWithData: number;
  strongCount: number;
  watchCount: number;
  riskCount: number;
  dimensionSummary: {
    dimension: GWCDimension;
    avgYesRate: number;
    trend: TrendDirection;
    riskCount: number;
  }[];
  topAlerts: GWCAlert[];
}

// EOS Health Score Types

export type HealthBand = 'at_risk' | 'needs_attention' | 'healthy' | 'strong';

export type HealthDimension = 
  | 'cadence'      // L10 meeting discipline
  | 'rocks'        // Rock ownership and delivery
  | 'ids'          // Issue resolution effectiveness
  | 'people'       // Quarterly Conversations
  | 'quarterly';   // Quarterly planning rhythm

export type TrendDirection = 'improving' | 'stable' | 'declining';

export const HEALTH_BAND_LABELS: Record<HealthBand, string> = {
  at_risk: 'At Risk',
  needs_attention: 'Needs Attention',
  healthy: 'Healthy',
  strong: 'Strong',
};

export const HEALTH_BAND_RANGES: Record<HealthBand, { min: number; max: number }> = {
  at_risk: { min: 0, max: 39 },
  needs_attention: { min: 40, max: 69 },
  healthy: { min: 70, max: 84 },
  strong: { min: 85, max: 100 },
};

export const HEALTH_BAND_COLORS: Record<HealthBand, { bg: string; text: string; border: string }> = {
  at_risk: { 
    bg: 'bg-destructive/10', 
    text: 'text-destructive', 
    border: 'border-destructive/30' 
  },
  needs_attention: { 
    bg: 'bg-amber-50 dark:bg-amber-950/30', 
    text: 'text-amber-700 dark:text-amber-300', 
    border: 'border-amber-200 dark:border-amber-800' 
  },
  healthy: { 
    bg: 'bg-emerald-50 dark:bg-emerald-950/30', 
    text: 'text-emerald-700 dark:text-emerald-300', 
    border: 'border-emerald-200 dark:border-emerald-800' 
  },
  strong: { 
    bg: 'bg-primary/10', 
    text: 'text-primary', 
    border: 'border-primary/30' 
  },
};

export const DIMENSION_LABELS: Record<HealthDimension, string> = {
  cadence: 'Cadence Health',
  rocks: 'Rock Discipline',
  ids: 'IDS Effectiveness',
  people: 'People System',
  quarterly: 'Quarterly Rhythm',
};

export const DIMENSION_DESCRIPTIONS: Record<HealthDimension, string> = {
  cadence: 'Level 10 meeting frequency and completion',
  rocks: 'Rock ownership, tracking, and delivery',
  ids: 'Issue resolution speed and effectiveness',
  people: 'Quarterly Conversation completion',
  quarterly: 'Quarterly planning and review cycle',
};

export interface HealthIssue {
  id: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  link?: string;
}

export interface DimensionScore {
  dimension: HealthDimension;
  score: number;
  band: HealthBand;
  label: string;
  description: string;
  issues: HealthIssue[];
  signals: {
    label: string;
    value: string | number;
    isPositive: boolean;
  }[];
}

export interface EosHealthData {
  overallScore: number;
  overallBand: HealthBand;
  trend: TrendDirection;
  dimensions: DimensionScore[];
  lastCalculated: string;
}

export function getHealthBand(score: number): HealthBand {
  if (score >= 85) return 'strong';
  if (score >= 70) return 'healthy';
  if (score >= 40) return 'needs_attention';
  return 'at_risk';
}

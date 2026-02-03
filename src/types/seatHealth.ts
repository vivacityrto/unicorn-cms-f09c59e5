// Seat Health Scoring Types

export type HealthBand = 'healthy' | 'at_risk' | 'overloaded';
export type RecommendationType = 'reduce_rock_load' | 'move_rock' | 'add_backup' | 'split_seat' | 'seat_redesign' | 'people_review' | 'vacant_seat';
export type RecommendationStatus = 'new' | 'acknowledged' | 'action_taken' | 'dismissed';
export type RecommendationSeverity = 'high' | 'medium';

export interface ContributingFactor {
  type: 'rocks' | 'scorecard' | 'gwc' | 'rollover' | 'todos' | 'ids' | 'cadence';
  label: string;
  description: string;
  score: number;
  severity: 'high' | 'medium' | 'low';
}

export interface SeatHealthScore {
  id: string;
  tenant_id: number;
  seat_id: string;
  
  // Score components (0-100 each, higher = worse)
  rocks_score: number;
  scorecard_score: number;  // Scorecard pressure
  gwc_score: number;        // GWC Capacity trend
  rollover_score: number;   // Rollover history
  
  // Legacy fields for backward compatibility
  todos_score: number;
  ids_score: number;
  cadence_score: number;
  
  // Total weighted score (0-100)
  total_score: number;
  
  // Health band
  health_band: HealthBand;
  
  // Top contributing factors
  contributing_factors: ContributingFactor[];
  
  calculated_at: string;
  quarter_year: number;
  quarter_number: number;
  created_at: string;
  updated_at: string;
}

export interface SuggestedRock {
  id: string;
  title: string;
  status: string;
}

export interface SuggestedUser {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  current_seat_count: number;
}

export interface SuggestedSeat {
  id: string;
  seat_name: string;
  function_name: string;
  current_load_score: number;
}

export interface SeatRebalancingRecommendation {
  id: string;
  tenant_id: number;
  seat_id: string;
  
  recommendation_type: RecommendationType;
  title: string;
  description: string;
  
  suggested_rocks: SuggestedRock[];
  suggested_users: SuggestedUser[];
  suggested_seats: SuggestedSeat[];
  
  status: RecommendationStatus;
  severity: RecommendationSeverity;
  resolution_note?: string;
  dismissed_reason?: string;
  dismissed_by?: string;
  dismissed_at?: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  resolved_at?: string;
  resolved_by?: string;
  
  trigger_type: string;
  trigger_details?: Record<string, unknown>;
  
  quarter_year: number;
  quarter_number: number;
  created_at: string;
  updated_at: string;
}

// Health band colors and labels
export const HEALTH_BAND_CONFIG: Record<HealthBand, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: 'check' | 'alert-triangle' | 'alert-circle';
}> = {
  healthy: {
    label: 'Healthy',
    color: 'text-emerald-700 dark:text-emerald-300',
    bgColor: 'bg-emerald-100 dark:bg-emerald-950/50',
    borderColor: 'border-emerald-300 dark:border-emerald-800',
    icon: 'check',
  },
  at_risk: {
    label: 'At Risk',
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-950/50',
    borderColor: 'border-amber-300 dark:border-amber-800',
    icon: 'alert-triangle',
  },
  overloaded: {
    label: 'Overloaded',
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-950/50',
    borderColor: 'border-red-300 dark:border-red-800',
    icon: 'alert-circle',
  },
};

export const RECOMMENDATION_TYPE_CONFIG: Record<RecommendationType, {
  label: string;
  icon: 'minus-circle' | 'arrow-right' | 'user-plus' | 'scissors' | 'settings' | 'users' | 'user-x';
  description: string;
}> = {
  reduce_rock_load: {
    label: 'Consider Rock Load',
    icon: 'minus-circle',
    description: 'This seat may benefit from fewer active Rocks next quarter',
  },
  move_rock: {
    label: 'Review Rock Alignment',
    icon: 'arrow-right',
    description: 'Some Rocks may align better with another seat',
  },
  add_backup: {
    label: 'Consider Backup Owner',
    icon: 'user-plus',
    description: 'A secondary owner may reduce single-point dependency',
  },
  split_seat: {
    label: 'Review Seat Scope',
    icon: 'scissors',
    description: 'This seat may benefit from scope clarification or split',
  },
  seat_redesign: {
    label: 'Seat Redesign Flag',
    icon: 'settings',
    description: 'This seat may require scope clarification or restructure',
  },
  people_review: {
    label: 'People Review Prompt',
    icon: 'users',
    description: 'Consider reviewing seat fit during next Quarterly Conversation',
  },
  vacant_seat: {
    label: 'Vacant Seat',
    icon: 'user-x',
    description: 'This seat needs a primary owner assigned',
  },
};

// Score thresholds for health bands
// 0-39: Healthy, 40-69: At Risk, 70-100: Overloaded
export const HEALTH_THRESHOLDS = {
  healthy: { max: 39 },
  at_risk: { min: 40, max: 69 },
  overloaded: { min: 70 },
};

// Weight configuration for capacity score calculation (EOS-aligned)
// Rock Load (40%), Scorecard Pressure (25%), GWC Capacity Trend (25%), Rollover History (10%)
export const SCORE_WEIGHTS = {
  rocks: 0.40,          // 40% - Rock load and off-track status
  scorecard: 0.25,      // 25% - Scorecard pressure (off-track measurables)
  gwc: 0.25,            // 25% - GWC Capacity trend from QCs
  rollover: 0.10,       // 10% - Historical rollover pattern
};

// Legacy weights for backward compatibility
export const LEGACY_SCORE_WEIGHTS = {
  rocks: 0.40,
  todos: 0.20,
  ids: 0.20,
  cadence: 0.10,
  gwc: 0.10,
};

// Capacity status labels (more intuitive than health bands)
export const CAPACITY_STATUS_LABELS: Record<HealthBand, string> = {
  healthy: 'Healthy Capacity',
  at_risk: 'Capacity at Risk',
  overloaded: 'Overloaded',
};

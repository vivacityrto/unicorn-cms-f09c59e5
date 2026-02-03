// Seat-Level Scorecard Types

export type ScorecardStatus = 'Draft' | 'Active' | 'Archived';
export type ComparisonType = '>=' | '<=' | '=';
export type EntryStatus = 'On Track' | 'Off Track';

export interface SeatScorecard {
  id: string;
  tenant_id: number;
  seat_id: string;
  status: ScorecardStatus;
  current_version_id?: string;
  created_at: string;
  created_by: string;
  updated_at: string;
}

export interface SeatScorecardVersion {
  id: string;
  seat_scorecard_id: string;
  tenant_id: number;
  version_number: number;
  change_summary: string;
  created_at: string;
  created_by: string;
}

export interface SeatMeasurable {
  id: string;
  seat_scorecard_id: string;
  tenant_id: number;
  name: string;
  target_value: number;
  comparison_type: ComparisonType;
  frequency: 'Weekly';
  unit?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SeatMeasurableEntry {
  id: string;
  seat_measurable_id: string;
  tenant_id: number;
  week_start_date: string;
  actual_value: number;
  status: EntryStatus;
  comparison_type_stored: ComparisonType;
  target_value_stored: number;
  notes?: string;
  entered_by: string;
  entered_at: string;
}

// Extended types with relationships
export interface MeasurableWithEntries extends SeatMeasurable {
  entries: SeatMeasurableEntry[];
  latestEntry?: SeatMeasurableEntry;
  weeklyTrend: EntryStatus[];
}

export interface ScorecardWithDetails extends SeatScorecard {
  measurables: MeasurableWithEntries[];
  versions: SeatScorecardVersion[];
  seat?: {
    id: string;
    seat_name: string;
    function_id: string;
    primaryOwner?: {
      user_uuid: string;
      first_name?: string;
      last_name?: string;
      email?: string;
    };
  };
}

// Form types
export interface CreateMeasurableInput {
  seat_scorecard_id: string;
  name: string;
  target_value: number;
  comparison_type: ComparisonType;
  unit?: string;
  sort_order?: number;
}

export interface UpdateMeasurableInput {
  id: string;
  name?: string;
  target_value?: number;
  comparison_type?: ComparisonType;
  unit?: string;
  is_active?: boolean;
}

export interface CreateEntryInput {
  seat_measurable_id: string;
  week_start_date: string;
  actual_value: number;
  notes?: string;
}

export interface SaveVersionInput {
  seat_scorecard_id: string;
  change_summary: string;
}

// Status helpers
export const STATUS_COLORS: Record<ScorecardStatus, { bg: string; text: string; border: string }> = {
  Draft: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
  },
  Active: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
  Archived: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    border: 'border-muted',
  },
};

export const COMPARISON_LABELS: Record<ComparisonType, string> = {
  '>=': 'At least',
  '<=': 'At most',
  '=': 'Exactly',
};

export const COMPARISON_SYMBOLS: Record<ComparisonType, string> = {
  '>=': '≥',
  '<=': '≤',
  '=': '=',
};

// Utility to get Monday of the current week
export function getWeekStartDate(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

// Utility to get last N week start dates
export function getLastNWeeks(n: number, fromDate: Date = new Date()): string[] {
  const weeks: string[] = [];
  const current = new Date(fromDate);
  
  for (let i = 0; i < n; i++) {
    const weekStart = getWeekStartDate(current);
    weeks.push(weekStart);
    current.setDate(current.getDate() - 7);
  }
  
  return weeks;
}

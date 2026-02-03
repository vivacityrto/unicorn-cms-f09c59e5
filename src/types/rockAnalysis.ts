// Rock Success Analysis Types
// Read-only analysis of rock execution quality

export type RockOutcomeType = 'completed_on_time' | 'completed_late' | 'rolled_forward' | 'dropped';

export interface RockOutcome {
  id: string;
  tenant_id: number;
  rock_id: string;
  seat_id: string | null;
  owner_id: string | null;
  quarter_number: number;
  quarter_year: number;
  outcome_type: RockOutcomeType;
  rock_title: string;
  completed_at: string | null;
  due_date: string | null;
  rolled_from_quarter: string | null;
  rolled_to_quarter: string | null;
  notes: string | null;
  created_at: string;
}

export interface QuarterSummary {
  quarter: string; // e.g., 'Q1 2026'
  quarter_number: number;
  quarter_year: number;
  total_rocks: number;
  completed_on_time: number;
  completed_late: number;
  rolled_forward: number;
  dropped: number;
  completion_rate: number; // Percentage (0-100)
  on_time_rate: number;
  roll_rate: number;
  drop_rate: number;
}

export interface SeatRockSummary {
  seat_id: string;
  seat_name: string;
  owner_name: string | null;
  total_rocks: number;
  completed_on_time: number;
  completed_late: number;
  rolled_forward: number;
  dropped: number;
  completion_rate: number;
  roll_rate: number;
  drop_rate: number;
  flags: SeatFlag[];
}

export interface SeatFlag {
  type: 'high_roll_rate' | 'repeated_drops' | 'chronic_late';
  message: string;
  severity: 'warning' | 'critical';
}

export interface TrendData {
  quarters: string[];
  completion_rates: number[];
  roll_rates: number[];
  drop_rates: number[];
  on_time_rates: number[];
}

export const OUTCOME_CONFIG: Record<RockOutcomeType, { 
  label: string; 
  color: string; 
  bgColor: string;
  description: string;
}> = {
  completed_on_time: { 
    label: 'Completed On Time', 
    color: 'text-emerald-700 dark:text-emerald-300',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    description: 'Rock completed before quarter end'
  },
  completed_late: { 
    label: 'Completed Late', 
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    description: 'Rock completed after due date'
  },
  rolled_forward: { 
    label: 'Rolled Forward', 
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    description: 'Rock moved to next quarter'
  },
  dropped: { 
    label: 'Dropped', 
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    description: 'Rock not completed or continued'
  },
};

export function formatQuarter(quarter: number, year: number): string {
  return `Q${quarter} ${year}`;
}

export function parseQuarter(quarterStr: string): { quarter: number; year: number } | null {
  const match = quarterStr.match(/Q(\d)\s+(\d{4})/);
  if (!match) return null;
  return { quarter: parseInt(match[1]), year: parseInt(match[2]) };
}

export function getPreviousQuarter(quarter: number, year: number): { quarter: number; year: number } {
  if (quarter === 1) {
    return { quarter: 4, year: year - 1 };
  }
  return { quarter: quarter - 1, year };
}

export function getCurrentQuarter(): { quarter: number; year: number } {
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  return { quarter, year: now.getFullYear() };
}

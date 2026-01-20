// Flight Plan Type Definitions

export interface MonthFocus {
  items: string[];
  indicators: string[];
  notes: string;
}

export interface FlightPlan {
  id: string;
  tenant_id: number;
  quarter_number: 1 | 2 | 3 | 4;
  quarter_year: number;
  due_date: string;
  
  // Quarterly Goal
  quarterly_objective: string | null;
  success_indicators: string[];
  win_condition: string | null;
  stop_doing: string[];
  
  // Scoreboard
  revenue_target: number | null;
  profit_target: number | null;
  measurables: string[];
  
  // Monthly Focus
  month_1_focus: MonthFocus;
  month_2_focus: MonthFocus;
  month_3_focus: MonthFocus;
  
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export const QUARTER_LABELS: Record<number, string> = {
  1: 'JAN-MAR',
  2: 'APR-JUN',
  3: 'JUL-SEP',
  4: 'OCT-DEC',
};

export const MONTH_NAMES: Record<number, string[]> = {
  1: ['January', 'February', 'March'],
  2: ['April', 'May', 'June'],
  3: ['July', 'August', 'September'],
  4: ['October', 'November', 'December'],
};

export function getQuarterDueDate(quarter: number, year: number): string {
  const dueDates: Record<number, string> = {
    1: `${year}-03-31`,
    2: `${year}-06-30`,
    3: `${year}-09-30`,
    4: `${year}-12-31`,
  };
  return dueDates[quarter];
}

// EOS Accountability Chart Types

export type ChartStatus = 'Draft' | 'Active' | 'Archived';
export type AssignmentType = 'Primary' | 'Secondary';

export interface AccountabilityChart {
  id: string;
  tenant_id: number;
  status: ChartStatus;
  current_version_id?: string;
  created_at: string;
  created_by: string;
  updated_at: string;
}

export interface ChartVersion {
  id: string;
  chart_id: string;
  tenant_id: number;
  version_number: number;
  change_summary: string;
  snapshot: ChartSnapshot;
  created_at: string;
  created_by: string;
}

export interface ChartSnapshot {
  functions: AccountabilityFunction[];
  seats: AccountabilitySeat[];
  roles: SeatRole[];
  assignments: SeatAssignment[];
}

export interface AccountabilityFunction {
  id: string;
  chart_id: string;
  tenant_id: number;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AccountabilitySeat {
  id: string;
  function_id: string;
  chart_id: string;
  tenant_id: number;
  seat_name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SeatRole {
  id: string;
  seat_id: string;
  tenant_id: number;
  role_text: string;
  sort_order: number;
  created_at: string;
}

export interface SeatAssignment {
  id: string;
  seat_id: string;
  tenant_id: number;
  user_id: string;
  assignment_type: AssignmentType;
  start_date: string;
  end_date?: string;
  created_at: string;
  updated_at: string;
}

// Extended types with relationships
export interface SeatWithDetails extends AccountabilitySeat {
  roles: SeatRole[];
  assignments: (SeatAssignment & { user?: UserBasic })[];
  primaryOwner?: UserBasic;
}

export interface FunctionWithSeats extends AccountabilityFunction {
  seats: SeatWithDetails[];
}

export interface ChartWithDetails extends AccountabilityChart {
  functions: FunctionWithSeats[];
  versions: ChartVersion[];
}

export interface UserBasic {
  user_uuid: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar_url?: string;
}

// Form types
export interface CreateFunctionInput {
  chart_id: string;
  name: string;
  sort_order?: number;
}

export interface CreateSeatInput {
  function_id: string;
  chart_id: string;
  seat_name: string;
  sort_order?: number;
}

export interface CreateRoleInput {
  seat_id: string;
  role_text: string;
  sort_order?: number;
}

export interface CreateAssignmentInput {
  seat_id: string;
  user_id: string;
  assignment_type: AssignmentType;
  start_date?: string;
}

export interface SaveVersionInput {
  chart_id: string;
  change_summary: string;
}

// Status helpers
export const STATUS_COLORS: Record<ChartStatus, { bg: string; text: string; border: string }> = {
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

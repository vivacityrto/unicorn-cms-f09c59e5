// EOS Accountability Chart Types

export type ChartStatus = 'Draft' | 'Active' | 'Archived';
export type AssignmentType = 'Primary' | 'Secondary';

// EOS-specific seat role types
export type EosSeatRoleType = 'visionary' | 'integrator' | 'leadership_team' | 'functional_lead';

// Function types for organizational grouping
export type EosFunctionType = 'leadership' | 'operations' | 'finance' | 'delivery' | 'support' | 'sales_marketing';

export const EOS_SEAT_ROLE_LABELS: Record<EosSeatRoleType, string> = {
  visionary: 'Visionary',
  integrator: 'Integrator',
  leadership_team: 'Leadership Team',
  functional_lead: 'Functional Lead',
};

export const EOS_FUNCTION_TYPE_LABELS: Record<EosFunctionType, string> = {
  leadership: 'Leadership',
  operations: 'Operations',
  finance: 'Finance',
  delivery: 'Delivery',
  support: 'Support',
  sales_marketing: 'Sales & Marketing',
};

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
  function_type?: EosFunctionType | null;
  description?: string | null;
  sort_order: number;
  parent_function_id?: string | null;
  created_at: string;
  updated_at: string;
}

// Extended function type with nested children
export interface FunctionWithChildren extends AccountabilityFunction {
  children: FunctionWithSeats[];
}

export interface AccountabilitySeat {
  id: string;
  function_id: string;
  chart_id: string;
  tenant_id: number;
  seat_name: string;
  eos_role_type?: EosSeatRoleType | null;
  description?: string | null;
  gwc_get_it?: string | null;
  gwc_want_it?: string | null;
  gwc_capacity?: string | null;
  sort_order: number;
  is_required_for_quorum?: boolean;
  backup_owner_user_id?: string | null;
  critical_seat?: boolean;
  cover_notes?: string | null;
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
  end_date?: string | null;
  created_at: string;
  updated_at: string;
}

// Linked data from the view
export interface SeatLinkedData {
  seat_id: string;
  tenant_id: number;
  seat_name: string;
  eos_role_type: EosSeatRoleType | null;
  primary_owner_id: string | null;
  active_rocks_count: number;
  meetings_attended_count: number;
  meetings_missed_count: number;
}

// Extended types with relationships
export interface SeatWithDetails extends AccountabilitySeat {
  roles: SeatRole[];
  assignments: (SeatAssignment & { user?: UserBasic })[];
  primaryOwner?: UserBasic;
  linkedData?: SeatLinkedData;
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
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

// Form types
export interface CreateFunctionInput {
  chart_id: string;
  name: string;
  function_type?: EosFunctionType;
  description?: string;
  sort_order?: number;
  parent_function_id?: string | null;
}

export interface CreateSeatInput {
  function_id: string;
  chart_id: string;
  seat_name: string;
  eos_role_type?: EosSeatRoleType;
  description?: string;
  gwc_get_it?: string;
  gwc_want_it?: string;
  gwc_capacity?: string;
  sort_order?: number;
}

export interface UpdateSeatInput {
  seat_name?: string;
  eos_role_type?: EosSeatRoleType | null;
  description?: string | null;
  gwc_get_it?: string | null;
  gwc_want_it?: string | null;
  gwc_capacity?: string | null;
  is_required_for_quorum?: boolean;
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

// Accountability gaps detection
export interface AccountabilityGap {
  type: 'vacant_seat' | 'no_rocks' | 'overloaded_owner' | 'missing_meetings' | 'gwc_issues';
  severity: 'high' | 'medium' | 'low';
  seat?: SeatWithDetails;
  owner?: UserBasic;
  message: string;
  details?: string;
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

// EOS role type badge colors
export const EOS_ROLE_COLORS: Record<EosSeatRoleType, { bg: string; text: string }> = {
  visionary: { bg: 'bg-purple-100 dark:bg-purple-950/50', text: 'text-purple-700 dark:text-purple-300' },
  integrator: { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300' },
  leadership_team: { bg: 'bg-indigo-100 dark:bg-indigo-950/50', text: 'text-indigo-700 dark:text-indigo-300' },
  functional_lead: { bg: 'bg-teal-100 dark:bg-teal-950/50', text: 'text-teal-700 dark:text-teal-300' },
};

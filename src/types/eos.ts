// EOS Type Definitions
export type EosRole = 'admin' | 'facilitator' | 'scribe' | 'participant' | 'client_viewer';
export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'closed' | 'cancelled';
export type MeetingType = 'L10' | 'Quarterly' | 'Annual' | 'Same_Page' | 'Focus_Day' | 'Custom';
export type RockType = 'company' | 'team' | 'individual';
export type RockStatus = 'on_track' | 'off_track' | 'complete';
export type IssueStatus = 'open' | 'discussing' | 'solved' | 'archived';
export type IssuePriority = 'high' | 'medium' | 'low';
export type IssueCategory = 'weekly' | 'quarterly' | 'annual';
export type TodoStatus = 'pending' | 'in_progress' | 'complete' | 'cancelled';
export type SegmentType = 'segue' | 'scorecard' | 'rocks' | 'headlines' | 'todos' | 'ids' | 'conclude';

export interface EosUserRole {
  id: string;
  user_id: string;
  tenant_id: number;
  role: EosRole;
  assigned_at: string;
  assigned_by?: string;
}

export interface EosVtoVersion {
  id: string;
  tenant_id: number;
  client_id?: string | null;
  core_values?: any;
  target_market?: string | null;
  proven_process?: any;
  ten_year_target?: string | null;
  three_year_measurables?: any;
  three_year_revenue_target?: number | null;
  three_year_profit_target?: number | null;
  one_year_goals?: any;
  one_year_revenue_target?: number | null;
  one_year_profit_target?: number | null;
  created_at: string | null;
  created_by?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface EosVtoDraft {
  id: string;
  tenant_id: number;
  meeting_id: string;
  draft_json: Record<string, any>;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface EosChartDraft {
  id: string;
  tenant_id: number;
  meeting_id: string;
  draft_json: Record<string, any>;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface EosAccountabilityChart {
  id: string;
  tenant_id: number;
  version_number: number;
  is_active: boolean;
  chart_data: Record<string, any>;
  created_at: string;
  created_by: string;
  notes?: string;
}

export interface EosScorecardMetric {
  id: string;
  tenant_id: number;
  name: string;
  description?: string;
  owner_id?: string;
  target_value?: number;
  unit?: string;
  frequency: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface EosScorecardEntry {
  id: string;
  metric_id: string;
  tenant_id: number;
  week_ending: string;
  value: number;
  notes?: string;
  entered_by: string;
  entered_at: string;
}

// Using existing database schema for Rocks
export interface EosRock {
  id: string;
  tenant_id: number;
  client_id?: string;
  title: string;
  description?: string;
  owner_id?: string;
  status: string; // USER-DEFINED enum
  quarter_year: number;
  quarter_number: number;
  due_date: string;
  completed_date?: string;
  priority?: number;
  progress?: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

// Using existing database schema for Issues (with Phase 4 additions)
export interface EosIssue {
  id: string;
  tenant_id: number;
  client_id?: string;
  title: string;
  description?: string;
  status: string; // USER-DEFINED enum
  priority?: number | IssuePriority;
  category?: IssueCategory;
  created_by?: string;
  assigned_to?: string;
  raised_by?: string;
  meeting_id?: string;
  linked_rock_id?: string;
  solved_at?: string;
  solution?: string;
  resolved_at?: string;
  resolved_by?: string;
  created_at: string;
  updated_at: string;
}

// Using existing database schema for Todos (with Phase 4 additions)
export interface EosTodo {
  id: string;
  tenant_id: number;
  client_id?: string;
  title: string;
  description?: string;
  assigned_to?: string;
  owner_id?: string;
  status: string; // USER-DEFINED enum
  due_date?: string;
  completed_date?: string;
  completed_at?: string;
  meeting_id?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface EosAgendaSegment {
  name: string;
  duration_minutes: number;
  description?: string;
}

export interface EosAgendaTemplate {
  id: string;
  tenant_id: number;
  meeting_type: MeetingType;
  template_name: string;
  description?: string;
  segments: EosAgendaSegment[];
  is_default: boolean;
  is_system: boolean;
  is_archived: boolean;
  current_version_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface EosAgendaTemplateVersion {
  id: string;
  template_id: string;
  version_number: number;
  segments_snapshot: EosAgendaSegment[];
  change_summary?: string;
  is_published: boolean;
  created_by?: string;
  created_at: string;
}

export interface EosTemplateAuditLog {
  id: string;
  action: 'template_created' | 'template_version_created' | 'template_version_published' | 'template_version_restored' | 'template_archived' | 'template_set_default';
  user_id?: string;
  template_id?: string;
  version_id?: string;
  tenant_id: number;
  change_summary?: string;
  details?: Record<string, any>;
  created_at: string;
}

export type MinutesStatus = 'Draft' | 'Final' | 'Locked';

// Using existing database schema for Meetings
export interface EosMeeting {
  id: string;
  tenant_id: number;
  client_id?: string;
  meeting_type: MeetingType;
  title: string;
  scheduled_date: string;
  duration_minutes?: number;
  location?: string;
  notes?: string;
  scorecard_data?: Record<string, any>;
  rock_reviews?: Record<string, any>;
  headlines?: Record<string, any>;
  issues_discussed?: string[];
  status?: MeetingStatus;
  is_complete?: boolean;
  completed_at?: string;
  recurrence_rule?: string;
  recurrence_end_date?: string;
  parent_meeting_id?: string;
  template_id?: string;
  template_version_id?: string;
  current_minutes_version_id?: string;
  minutes_status?: MinutesStatus;
  is_multi_client?: boolean;
  previous_meeting_id?: string;
  next_meeting_id?: string;
  quorum_status?: 'met' | 'not_met' | 'overridden' | 'pending';
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface MinutesSnapshot {
  segments: {
    id: string;
    name: string;
    notes?: string;
    duration_minutes: number;
  }[];
  attendance: {
    user_id: string;
    name: string;
    attended: boolean;
  }[];
  decisions: {
    id: string;
    text: string;
    made_at: string;
  }[];
  linked_items: {
    rocks?: { id: string; title: string; status: string }[];
    issues?: { id: string; title: string; status: string }[];
    todos?: { id: string; title: string; owner?: string; due_date?: string }[];
  };
  action_items: {
    id: string;
    title: string;
    owner_id?: string;
    owner_name?: string;
    due_date?: string;
    status: string;
  }[];
  attachments?: {
    id: string;
    name: string;
    url: string;
  }[];
}

export interface EosMeetingMinutesVersion {
  id: string;
  meeting_id: string;
  version_number: number;
  created_by?: string;
  created_at: string;
  change_summary?: string;
  minutes_snapshot: MinutesSnapshot;
  is_final: boolean;
  is_locked: boolean;
}

export interface EosMinutesAuditLog {
  id: string;
  action: 'minutes_version_created' | 'minutes_finalised' | 'minutes_revision_created' | 'minutes_locked' | 'minutes_unlocked' | 'minutes_version_restored';
  user_id?: string;
  meeting_id: string;
  minutes_version_id?: string;
  tenant_id: number;
  change_summary?: string;
  details?: Record<string, any>;
  created_at: string;
}

export interface UserProfile {
  user_uuid: string;
  tenant_id: number;
  client_id?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  unicorn_role?: string;
  // ... other fields
}

export interface EosHeadline {
  id: string;
  meeting_id: string;
  user_id?: string;
  headline: string;
  is_good_news: boolean;
  created_at: string;
}

export interface EosMeetingParticipant {
  id: string;
  meeting_id: string;
  user_id: string;
  role: 'Leader' | 'Member' | 'Observer';
  attended: boolean;
  joined_at?: string;
  left_at?: string;
  created_at: string;
}

export interface EosMeetingSegment {
  id: string;
  meeting_id: string;
  segment_name: string;
  sequence_order: number;
  duration_minutes: number;
  started_at?: string;
  completed_at?: string;
  notes?: string;
  created_at: string;
}

export interface EosMeetingSummary {
  id: string;
  meeting_id: string;
  tenant_id: number;
  meeting_type?: string;
  period_range?: string;
  rating?: number;
  attendance: any[];
  todos: any[];
  issues: any[];
  rocks: any[];
  headlines: any[];
  cascades: any[];
  vto_changes?: any[];
  chart_changes?: any[];
  emailed_at?: string;
  created_at: string;
}

/**
 * Checkpoint Phases — TypeScript types
 *
 * These types mirror the database tables created in Step 2A.
 * They are manually defined because the Supabase generated types
 * may not yet include the new tables.
 */

/** Phase status lookup (dd_phase_status) */
export interface PhaseStatus {
  code: number;
  value: string;
  description: string;
  seq: number;
}

/** Reusable phase template (phases table) */
export interface Phase {
  id: string;
  phase_key: string;
  title: string;
  description: string | null;
  gate_type: "hard" | "soft" | "none";
  is_archived: boolean;
  allow_parallel: boolean;
  sort_order_default: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Phase-to-stage mapping per package (phase_stages table) */
export interface PhaseStage {
  id: string;
  phase_id: string;
  package_id: number;
  stage_id: number;
  sort_order: number;
  is_required: boolean;
  created_at: string;
}

/** Runtime phase instance per package instance (phase_instances table) */
export interface PhaseInstance {
  id: string;
  phase_id: string;
  package_instance_id: number;
  status: string;
  gate_type: "hard" | "soft" | "none";
  sort_order: number;
  notes: string | null;
  exception_reason: string | null;
  proceed_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}

/** v_phase_progress_summary view row */
export interface PhaseProgressSummary {
  package_instance_id: number;
  phase_instance_id: string;
  phase_id: string;
  phase_title: string;
  sort_order: number;
  gate_type: "hard" | "soft" | "none";
  status: string;
  total_stages: number;
  required_stages: number;
  completed_stages: number;
  completed_required: number;
  is_passable: boolean;
}

/** v_package_has_phases view row */
export interface PackageHasPhases {
  package_id: number;
  has_phases: boolean;
  phase_count: number;
}

/** Return type from fn_check_phase_gate RPC */
export interface PhaseGateCheck {
  is_passable: boolean;
  gate_type: "hard" | "soft" | "none";
  missing_stages: string[] | null;
}

/** Gate type options for UI selectors */
export const GATE_TYPE_OPTIONS = [
  { value: "none", label: "None", description: "Visual grouping only" },
  { value: "soft", label: "Soft", description: "Warning when incomplete, can proceed with reason" },
  { value: "hard", label: "Hard", description: "Blocks progression until all required stages complete" },
] as const;

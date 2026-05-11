import type { Database } from "@/integrations/supabase/types";

export type PdpAudience = Database["public"]["Tables"]["pdp_audiences"]["Row"];
export type PdpCycle = Database["public"]["Tables"]["pdp_cycles"]["Row"];
export type PdpGoal = Database["public"]["Tables"]["pdp_goals"]["Row"];
export type PdpEvidenceItem = Database["public"]["Tables"]["pdp_evidence_items"]["Row"];
export type PdpReflection = Database["public"]["Tables"]["pdp_reflections"]["Row"];
export type PdpReview = Database["public"]["Tables"]["pdp_reviews"]["Row"];
export type PdpCycleSummary = Database["public"]["Views"]["v_pdp_cycle_summary"]["Row"];
export type PdpUserCurrency = Database["public"]["Views"]["v_pdp_user_currency"]["Row"];

export type PdpCycleStatus = "planning" | "active" | "under_review" | "completed";
export type PdpGoalStatus = "open" | "in_progress" | "met" | "not_met" | "deferred";
export type PdpEvidenceType =
  | "academy_completion"
  | "academy_certificate"
  | "external_course"
  | "workshop"
  | "industry_placement"
  | "validation_activity"
  | "community_of_practice"
  | "conference"
  | "mentoring"
  | "reading"
  | "audit_response"
  | "other";
export type PdpReviewType = "mid_cycle" | "end_cycle" | "ad_hoc";
export type PdpReviewOutcome = "on_track" | "needs_action" | "completed" | "not_completed";
export type CurrencyStatus = "current" | "on_track" | "at_risk" | "overdue";

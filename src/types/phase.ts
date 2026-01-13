import { Database } from "@/integrations/supabase/types";

/**
 * Phase Registry Type
 * 
 * The Phase Registry (stored in `documents_stages` table) is the authoritative
 * source for all workflow phases in Unicorn 2.0.
 * 
 * Note: The underlying table retains the legacy "stage" naming for backwards
 * compatibility, but all UI and documentation refers to these as "Phases".
 */
export type PhaseRegistry = Database["public"]["Tables"]["documents_stages"]["Row"];

/**
 * Phase Registry Insert Type
 * Used when creating new phases
 */
export type PhaseRegistryInsert = Database["public"]["Tables"]["documents_stages"]["Insert"];

/**
 * Phase Registry Update Type
 * Used when updating existing phases
 */
export type PhaseRegistryUpdate = Database["public"]["Tables"]["documents_stages"]["Update"];

/**
 * Phase Types
 * Defines the classification of phases
 */
export type PhaseType = "delivery" | "internal" | "milestone" | "review";

/**
 * Phase Status
 * Lifecycle status of a phase
 */
export type PhaseStatus = "draft" | "active" | "deprecated";

/**
 * Compliance Frameworks
 * Supported regulatory frameworks
 */
export type ComplianceFramework = "RTO2015" | "RTO2025" | "CRICOS" | "GTO";

/**
 * Phase with extended metadata
 * Includes computed/joined fields commonly needed in UI
 */
export interface PhaseWithMetadata extends PhaseRegistry {
  document_count?: number;
  task_count?: number;
  package_count?: number;
  created_by_name?: string;
  dependency_phases?: PhaseRegistry[];
}

/**
 * Phase summary for list views
 */
export interface PhaseSummary {
  id: number;
  stage_key: string;
  title: string;
  short_name: string | null;
  stage_type: string | null;
  is_certified: boolean;
  is_archived: boolean;
  status: string | null;
  frameworks: string[] | null;
}

/**
 * Phase dependency graph node
 */
export interface PhaseDependencyNode {
  phase: PhaseSummary;
  requires: string[];
  required_by: string[];
}

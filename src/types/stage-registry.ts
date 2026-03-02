import { Database } from "@/integrations/supabase/types";

/**
 * Stage Registry Type
 * 
 * The Stage Registry (stored in `documents_stages` table) is the authoritative
 * source for all workflow stages in Unicorn 2.0.
 * 
 * Note: The underlying table retains the legacy "stage" naming for backwards
 * compatibility. All UI and documentation refers to these as "Stages".
 * Individual workflow steps. The new "Phase" concept (Checkpoint Phases)
 * is a grouping layer above Stages, introduced separately.
 */
export type StageRegistry = Database["public"]["Tables"]["stages"]["Row"];

/**
 * Stage Registry Insert Type
 * Used when creating new stages
 */
export type StageRegistryInsert = Database["public"]["Tables"]["stages"]["Insert"];

/**
 * Stage Registry Update Type
 * Used when updating existing stages
 */
export type StageRegistryUpdate = Database["public"]["Tables"]["stages"]["Update"];

/**
 * Stage Classification
 * Defines the classification of stages
 * (Named StageClassification to avoid conflict with StageType in membership.ts)
 */
export type StageClassification = "delivery" | "internal" | "milestone" | "review";

/**
 * Stage Lifecycle Status
 * Lifecycle status of a stage
 * (Named StageLifecycleStatus to avoid conflict with StageStatus in membership.ts)
 */
export type StageLifecycleStatus = "draft" | "active" | "deprecated";

/**
 * Compliance Frameworks
 * Supported regulatory frameworks
 */
export type ComplianceFramework = "RTO2015" | "RTO2025" | "CRICOS" | "GTO";

/**
 * Stage with extended metadata
 * Includes computed/joined fields commonly needed in UI
 */
export interface StageWithMetadata extends StageRegistry {
  document_count?: number;
  task_count?: number;
  package_count?: number;
  created_by_name?: string;
  dependency_stages?: StageRegistry[];
}

/**
 * Stage summary for list views
 */
export interface StageSummary {
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
 * Stage dependency graph node
 */
export interface StageDependencyNode {
  stage: StageSummary;
  requires: string[];
  required_by: string[];
}

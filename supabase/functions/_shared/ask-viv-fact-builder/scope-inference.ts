/**
 * Scope Inference
 * 
 * Infers missing scope IDs based on available context.
 * No guessing - if multiple candidates exist, returns gap.
 */

import type { 
  InferenceDecision, 
  PackageFactData, 
  PhaseFactData 
} from "./types.ts";

export interface InferenceResult {
  scope: {
    client_id: string | null;
    package_id: string | null;
    phase_id: string | null;
  };
  decisions: InferenceDecision[];
  gaps: string[];
}

/**
 * Infer missing scope IDs.
 * Order: client_id -> package_id -> phase_id
 * 
 * Rules:
 * - If only client_id provided: infer latest active package
 * - If package present: infer current active phase
 * - If multiple candidates: choose none, add gap
 */
export function inferScope(
  providedScope: {
    client_id: string | null;
    package_id: string | null;
    phase_id: string | null;
  },
  packages: PackageFactData[],
  phases: PhaseFactData[],
  tenantId: number
): InferenceResult {
  const decisions: InferenceDecision[] = [];
  const gaps: string[] = [];
  
  const scope = {
    client_id: providedScope.client_id,
    package_id: providedScope.package_id,
    phase_id: providedScope.phase_id,
  };

  // Client ID defaults to tenant ID if not provided
  if (!scope.client_id) {
    scope.client_id = tenantId.toString();
    decisions.push({
      field: "client_id",
      action: "inferred",
      reason: "Defaulted to tenant ID",
      inferred_value: scope.client_id,
    });
  }

  // Infer package_id if not provided
  if (!scope.package_id && packages.length > 0) {
    const activePackages = packages.filter(p => 
      p.status === "active" || p.status === "in_progress"
    );

    if (activePackages.length === 1) {
      scope.package_id = activePackages[0].id.toString();
      decisions.push({
        field: "package_id",
        action: "inferred",
        reason: `Single active package found: "${activePackages[0].name}"`,
        inferred_value: scope.package_id,
      });
    } else if (activePackages.length > 1) {
      decisions.push({
        field: "package_id",
        action: "multiple_candidates",
        reason: `${activePackages.length} active packages found`,
        inferred_value: null,
      });
      gaps.push(`Multiple active packages (${activePackages.length}). Specify package_id for more specific results.`);
    } else if (packages.length === 1) {
      // Only one package total, use it
      scope.package_id = packages[0].id.toString();
      decisions.push({
        field: "package_id",
        action: "inferred",
        reason: `Only package available: "${packages[0].name}"`,
        inferred_value: scope.package_id,
      });
    } else {
      decisions.push({
        field: "package_id",
        action: "skipped",
        reason: "No active packages found",
        inferred_value: null,
      });
    }
  } else if (!scope.package_id && packages.length === 0) {
    decisions.push({
      field: "package_id",
      action: "skipped",
      reason: "No packages available",
      inferred_value: null,
    });
  }

  // Infer phase_id if not provided
  if (!scope.phase_id && phases.length > 0) {
    const activePhases = phases.filter(p => 
      p.status === "active" || p.status === "in_progress" || p.status === "current"
    );

    if (activePhases.length === 1) {
      scope.phase_id = activePhases[0].id.toString();
      decisions.push({
        field: "phase_id",
        action: "inferred",
        reason: `Single active phase found: "${activePhases[0].title}"`,
        inferred_value: scope.phase_id,
      });
    } else if (activePhases.length > 1) {
      decisions.push({
        field: "phase_id",
        action: "multiple_candidates",
        reason: `${activePhases.length} active phases found`,
        inferred_value: null,
      });
      gaps.push(`Multiple active phases (${activePhases.length}). Specify phase_id for phase-specific results.`);
    } else if (phases.length === 1) {
      // Only one phase total
      scope.phase_id = phases[0].id.toString();
      decisions.push({
        field: "phase_id",
        action: "inferred",
        reason: `Only phase available: "${phases[0].title}"`,
        inferred_value: scope.phase_id,
      });
    } else {
      decisions.push({
        field: "phase_id",
        action: "skipped",
        reason: "No active phases found",
        inferred_value: null,
      });
    }
  } else if (!scope.phase_id && phases.length === 0) {
    decisions.push({
      field: "phase_id",
      action: "skipped",
      reason: "No phases available",
      inferred_value: null,
    });
  }

  return { scope, decisions, gaps };
}

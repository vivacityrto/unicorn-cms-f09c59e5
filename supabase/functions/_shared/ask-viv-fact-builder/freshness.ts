/**
 * Data Freshness Module
 * 
 * Calculates data freshness based on last activity timestamps.
 * Used to surface data age warnings and gate confidence levels.
 */

import type { DerivedFact } from "./types.ts";

// ============= Constants =============

export const FRESH_DAYS = 7;
export const STALE_DAYS = 14;
export const FRESHNESS_VERSION = "v1";

// ============= Types =============

export type FreshnessStatus = "fresh" | "aging" | "stale";

export interface FreshnessResult {
  last_activity_at: string | null;
  days_since_activity: number | null;
  status: FreshnessStatus;
  derived_at: string;
  source_table: string | null;
  source_id: string | null;
}

export interface FreshnessAuditEntry {
  days_since_activity: number | null;
  status: FreshnessStatus;
  confidence_downgraded: boolean;
  version: string;
}

export interface ActivityTimestamp {
  timestamp: string;
  source_table: string;
  source_id: string;
  label: string;
}

// ============= Activity Detection =============

/**
 * Collect all activity timestamps from retrieved data.
 * Priority order:
 * 1. Phase activity (task update, phase status change)
 * 2. Evidence upload or status change
 * 3. Consult log created or updated
 * 4. Package update
 * 5. Client/Tenant update
 */
export function collectActivityTimestamps(data: {
  phases: { id: number; title: string; updated_at?: string | null }[];
  tasks: { id: string; task_name: string; updated_at?: string | null }[];
  evidence: { id: number; title: string; updated_at?: string | null }[];
  consults: { id: string; date: string }[];
  packages: { id: number; name: string; updated_at?: string | null }[];
  tenant: { id: number; name: string; updated_at?: string | null } | null;
}): ActivityTimestamp[] {
  const timestamps: ActivityTimestamp[] = [];

  // Phase activity (highest priority)
  for (const phase of data.phases) {
    if (phase.updated_at) {
      timestamps.push({
        timestamp: phase.updated_at,
        source_table: "documents_stages",
        source_id: phase.id.toString(),
        label: `Phase "${phase.title}" updated`,
      });
    }
  }

  // Task activity
  for (const task of data.tasks) {
    if (task.updated_at) {
      timestamps.push({
        timestamp: task.updated_at,
        source_table: "tasks",
        source_id: task.id,
        label: `Task "${task.task_name}" updated`,
      });
    }
  }

  // Evidence activity
  for (const doc of data.evidence) {
    if (doc.updated_at) {
      timestamps.push({
        timestamp: doc.updated_at,
        source_table: "documents",
        source_id: doc.id.toString(),
        label: `Document "${doc.title}" updated`,
      });
    }
  }

  // Consult activity
  for (const consult of data.consults) {
    timestamps.push({
      timestamp: consult.date,
      source_table: "consult_logs",
      source_id: consult.id,
      label: "Consult log entry",
    });
  }

  // Package activity
  for (const pkg of data.packages) {
    if (pkg.updated_at) {
      timestamps.push({
        timestamp: pkg.updated_at,
        source_table: "packages",
        source_id: pkg.id.toString(),
        label: `Package "${pkg.name}" updated`,
      });
    }
  }

  // Tenant activity (lowest priority)
  if (data.tenant?.updated_at) {
    timestamps.push({
      timestamp: data.tenant.updated_at,
      source_table: "tenants",
      source_id: data.tenant.id.toString(),
      label: `Client "${data.tenant.name}" updated`,
    });
  }

  return timestamps;
}

/**
 * Find the most recent activity timestamp.
 */
export function findMostRecentActivity(
  timestamps: ActivityTimestamp[]
): ActivityTimestamp | null {
  if (timestamps.length === 0) return null;

  const sorted = [...timestamps].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return sorted[0];
}

// ============= Freshness Calculation =============

/**
 * Calculate days since a given timestamp.
 */
export function calculateDaysSince(
  timestamp: string,
  nowIso: string
): number {
  const then = new Date(timestamp);
  const now = new Date(nowIso);
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Determine freshness status from days since activity.
 */
export function determineFreshnessStatus(daysSince: number): FreshnessStatus {
  if (daysSince <= FRESH_DAYS) return "fresh";
  if (daysSince <= STALE_DAYS) return "aging";
  return "stale";
}

/**
 * Calculate complete freshness result from activity data.
 */
export function calculateFreshness(
  timestamps: ActivityTimestamp[],
  nowIso: string
): FreshnessResult {
  const mostRecent = findMostRecentActivity(timestamps);

  if (!mostRecent) {
    return {
      last_activity_at: null,
      days_since_activity: null,
      status: "stale",
      derived_at: nowIso,
      source_table: null,
      source_id: null,
    };
  }

  const daysSince = calculateDaysSince(mostRecent.timestamp, nowIso);
  const status = determineFreshnessStatus(daysSince);

  return {
    last_activity_at: mostRecent.timestamp,
    days_since_activity: daysSince,
    status,
    derived_at: nowIso,
    source_table: mostRecent.source_table,
    source_id: mostRecent.source_id,
  };
}

// ============= Fact Derivation =============

/**
 * Derive freshness fact for Fact Builder.
 */
export function deriveFreshnessFact(
  freshness: FreshnessResult,
  mostRecentActivity: ActivityTimestamp | null,
  nowIso: string
): DerivedFact {
  const reason = mostRecentActivity
    ? `Last activity was ${mostRecentActivity.label} on ${formatDate(mostRecentActivity.timestamp)}`
    : "No recent activity found";

  return {
    key: "data_freshness",
    value: {
      days_since_activity: freshness.days_since_activity,
      status: freshness.status,
    },
    reason,
    source_table: freshness.source_table ?? "none",
    source_ids: freshness.source_id ? [freshness.source_id] : [],
    derived_at: nowIso,
  };
}

/**
 * Format date for display.
 */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().split("T")[0];
  } catch {
    return iso;
  }
}

// ============= Confidence Gating =============

export type ConfidenceLevel = "High" | "Medium" | "Low";

/**
 * Apply confidence gating based on freshness.
 * Returns the effective confidence and whether it was downgraded.
 */
export function applyConfidenceGating(args: {
  modelConfidence: ConfidenceLevel;
  freshnessStatus: FreshnessStatus;
  hasGaps: boolean;
  hasBlockers: boolean;
}): { confidence: ConfidenceLevel; downgraded: boolean; reason: string | null } {
  const { modelConfidence, freshnessStatus, hasGaps, hasBlockers } = args;

  // Stale data: cannot be High
  if (freshnessStatus === "stale") {
    if (modelConfidence === "High") {
      return {
        confidence: "Medium",
        downgraded: true,
        reason: "Confidence downgraded from High to Medium due to stale data",
      };
    }
    return { confidence: modelConfidence, downgraded: false, reason: null };
  }

  // Aging data: High only if no gaps and no blockers
  if (freshnessStatus === "aging") {
    if (modelConfidence === "High" && (hasGaps || hasBlockers)) {
      return {
        confidence: "Medium",
        downgraded: true,
        reason: "Confidence downgraded from High to Medium due to aging data with gaps or blockers",
      };
    }
    return { confidence: modelConfidence, downgraded: false, reason: null };
  }

  // Fresh data: no restriction
  return { confidence: modelConfidence, downgraded: false, reason: null };
}

// ============= Audit Entry =============

/**
 * Build freshness audit entry for logging.
 */
export function buildFreshnessAuditEntry(
  freshness: FreshnessResult,
  confidenceDowngraded: boolean
): FreshnessAuditEntry {
  return {
    days_since_activity: freshness.days_since_activity,
    status: freshness.status,
    confidence_downgraded: confidenceDowngraded,
    version: FRESHNESS_VERSION,
  };
}

// ============= Gap Addition =============

/**
 * Get gap message for stale data if applicable.
 */
export function getFreshnessGap(freshness: FreshnessResult): string | null {
  if (freshness.last_activity_at === null) {
    return "No activity history available.";
  }
  return null;
}

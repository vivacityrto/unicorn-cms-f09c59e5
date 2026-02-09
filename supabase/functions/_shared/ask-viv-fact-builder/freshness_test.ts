/**
 * Freshness Module Tests
 */

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  FRESH_DAYS,
  STALE_DAYS,
  collectActivityTimestamps,
  findMostRecentActivity,
  calculateDaysSince,
  determineFreshnessStatus,
  calculateFreshness,
  deriveFreshnessFact,
  applyConfidenceGating,
  buildFreshnessAuditEntry,
  getFreshnessGap,
} from "./freshness.ts";

// ============= Constants Tests =============

Deno.test("Constants - FRESH_DAYS is 7", () => {
  assertEquals(FRESH_DAYS, 7);
});

Deno.test("Constants - STALE_DAYS is 14", () => {
  assertEquals(STALE_DAYS, 14);
});

// ============= collectActivityTimestamps Tests =============

Deno.test("collectActivityTimestamps - collects from all sources", () => {
  const data = {
    phases: [{ id: 1, title: "Phase 1", updated_at: "2026-02-05T10:00:00Z" }],
    tasks: [{ id: "t1", task_name: "Task 1", updated_at: "2026-02-04T10:00:00Z" }],
    evidence: [{ id: 1, title: "Doc 1", updated_at: "2026-02-03T10:00:00Z" }],
    consults: [{ id: "c1", date: "2026-02-02" }],
    packages: [{ id: 1, name: "Package 1", updated_at: "2026-02-01T10:00:00Z" }],
    tenant: { id: 1, name: "Tenant 1", updated_at: "2026-01-31T10:00:00Z" },
  };

  const result = collectActivityTimestamps(data);
  assertEquals(result.length, 6);
});

Deno.test("collectActivityTimestamps - handles empty data", () => {
  const data = {
    phases: [],
    tasks: [],
    evidence: [],
    consults: [],
    packages: [],
    tenant: null,
  };

  const result = collectActivityTimestamps(data);
  assertEquals(result.length, 0);
});

Deno.test("collectActivityTimestamps - skips null updated_at", () => {
  const data = {
    phases: [{ id: 1, title: "Phase 1", updated_at: null }],
    tasks: [],
    evidence: [],
    consults: [],
    packages: [],
    tenant: null,
  };

  const result = collectActivityTimestamps(data);
  assertEquals(result.length, 0);
});

// ============= findMostRecentActivity Tests =============

Deno.test("findMostRecentActivity - returns most recent", () => {
  const timestamps = [
    { timestamp: "2026-02-01T10:00:00Z", source_table: "tasks", source_id: "1", label: "Task" },
    { timestamp: "2026-02-05T10:00:00Z", source_table: "phases", source_id: "2", label: "Phase" },
    { timestamp: "2026-02-03T10:00:00Z", source_table: "documents", source_id: "3", label: "Doc" },
  ];

  const result = findMostRecentActivity(timestamps);
  assertEquals(result?.source_table, "phases");
  assertEquals(result?.timestamp, "2026-02-05T10:00:00Z");
});

Deno.test("findMostRecentActivity - returns null for empty array", () => {
  const result = findMostRecentActivity([]);
  assertEquals(result, null);
});

// ============= calculateDaysSince Tests =============

Deno.test("calculateDaysSince - 0 days for same day", () => {
  const result = calculateDaysSince("2026-02-09T10:00:00Z", "2026-02-09T12:00:00Z");
  assertEquals(result, 0);
});

Deno.test("calculateDaysSince - 7 days", () => {
  const result = calculateDaysSince("2026-02-02T10:00:00Z", "2026-02-09T10:00:00Z");
  assertEquals(result, 7);
});

Deno.test("calculateDaysSince - 14 days", () => {
  const result = calculateDaysSince("2026-01-26T10:00:00Z", "2026-02-09T10:00:00Z");
  assertEquals(result, 14);
});

// ============= determineFreshnessStatus Tests =============

Deno.test("determineFreshnessStatus - 0 days is fresh", () => {
  assertEquals(determineFreshnessStatus(0), "fresh");
});

Deno.test("determineFreshnessStatus - 7 days is fresh", () => {
  assertEquals(determineFreshnessStatus(7), "fresh");
});

Deno.test("determineFreshnessStatus - 8 days is aging", () => {
  assertEquals(determineFreshnessStatus(8), "aging");
});

Deno.test("determineFreshnessStatus - 14 days is aging", () => {
  assertEquals(determineFreshnessStatus(14), "aging");
});

Deno.test("determineFreshnessStatus - 15 days is stale", () => {
  assertEquals(determineFreshnessStatus(15), "stale");
});

Deno.test("determineFreshnessStatus - 30 days is stale", () => {
  assertEquals(determineFreshnessStatus(30), "stale");
});

// ============= calculateFreshness Tests =============

Deno.test("calculateFreshness - with activity 3 days ago", () => {
  const timestamps = [
    { timestamp: "2026-02-06T10:00:00Z", source_table: "tasks", source_id: "1", label: "Task" },
  ];
  const now = "2026-02-09T10:00:00Z";

  const result = calculateFreshness(timestamps, now);
  assertEquals(result.status, "fresh");
  assertEquals(result.days_since_activity, 3);
});

Deno.test("calculateFreshness - with activity 10 days ago", () => {
  const timestamps = [
    { timestamp: "2026-01-30T10:00:00Z", source_table: "phases", source_id: "1", label: "Phase" },
  ];
  const now = "2026-02-09T10:00:00Z";

  const result = calculateFreshness(timestamps, now);
  assertEquals(result.status, "aging");
  assertEquals(result.days_since_activity, 10);
});

Deno.test("calculateFreshness - with activity 18 days ago", () => {
  const timestamps = [
    { timestamp: "2026-01-22T10:00:00Z", source_table: "consult_logs", source_id: "1", label: "Consult" },
  ];
  const now = "2026-02-09T10:00:00Z";

  const result = calculateFreshness(timestamps, now);
  assertEquals(result.status, "stale");
  assertEquals(result.days_since_activity, 18);
});

Deno.test("calculateFreshness - no activity returns stale", () => {
  const now = "2026-02-09T10:00:00Z";
  const result = calculateFreshness([], now);
  assertEquals(result.status, "stale");
  assertEquals(result.days_since_activity, null);
  assertEquals(result.last_activity_at, null);
});

// ============= deriveFreshnessFact Tests =============

Deno.test("deriveFreshnessFact - creates valid fact", () => {
  const freshness = {
    last_activity_at: "2026-02-06T10:00:00Z",
    days_since_activity: 3,
    status: "fresh" as const,
    derived_at: "2026-02-09T10:00:00Z",
    source_table: "tasks",
    source_id: "123",
  };
  const activity = {
    timestamp: "2026-02-06T10:00:00Z",
    source_table: "tasks",
    source_id: "123",
    label: "Task updated",
  };

  const result = deriveFreshnessFact(freshness, activity, "2026-02-09T10:00:00Z");
  assertEquals(result.key, "data_freshness");
  assertEquals((result.value as any).status, "fresh");
  assertEquals((result.value as any).days_since_activity, 3);
  assertEquals(result.source_table, "tasks");
});

Deno.test("deriveFreshnessFact - handles no activity", () => {
  const freshness = {
    last_activity_at: null,
    days_since_activity: null,
    status: "stale" as const,
    derived_at: "2026-02-09T10:00:00Z",
    source_table: null,
    source_id: null,
  };

  const result = deriveFreshnessFact(freshness, null, "2026-02-09T10:00:00Z");
  assertEquals(result.key, "data_freshness");
  assertEquals(result.reason, "No recent activity found");
  assertEquals(result.source_ids.length, 0);
});

// ============= applyConfidenceGating Tests =============

Deno.test("applyConfidenceGating - fresh data, High confidence unchanged", () => {
  const result = applyConfidenceGating({
    modelConfidence: "High",
    freshnessStatus: "fresh",
    hasGaps: false,
    hasBlockers: false,
  });
  assertEquals(result.confidence, "High");
  assertEquals(result.downgraded, false);
});

Deno.test("applyConfidenceGating - fresh data with gaps, High unchanged", () => {
  const result = applyConfidenceGating({
    modelConfidence: "High",
    freshnessStatus: "fresh",
    hasGaps: true,
    hasBlockers: false,
  });
  assertEquals(result.confidence, "High");
  assertEquals(result.downgraded, false);
});

Deno.test("applyConfidenceGating - aging data, High allowed if no gaps/blockers", () => {
  const result = applyConfidenceGating({
    modelConfidence: "High",
    freshnessStatus: "aging",
    hasGaps: false,
    hasBlockers: false,
  });
  assertEquals(result.confidence, "High");
  assertEquals(result.downgraded, false);
});

Deno.test("applyConfidenceGating - aging data with gaps, High downgraded", () => {
  const result = applyConfidenceGating({
    modelConfidence: "High",
    freshnessStatus: "aging",
    hasGaps: true,
    hasBlockers: false,
  });
  assertEquals(result.confidence, "Medium");
  assertEquals(result.downgraded, true);
});

Deno.test("applyConfidenceGating - aging data with blockers, High downgraded", () => {
  const result = applyConfidenceGating({
    modelConfidence: "High",
    freshnessStatus: "aging",
    hasGaps: false,
    hasBlockers: true,
  });
  assertEquals(result.confidence, "Medium");
  assertEquals(result.downgraded, true);
});

Deno.test("applyConfidenceGating - stale data, High downgraded to Medium", () => {
  const result = applyConfidenceGating({
    modelConfidence: "High",
    freshnessStatus: "stale",
    hasGaps: false,
    hasBlockers: false,
  });
  assertEquals(result.confidence, "Medium");
  assertEquals(result.downgraded, true);
});

Deno.test("applyConfidenceGating - stale data, Medium unchanged", () => {
  const result = applyConfidenceGating({
    modelConfidence: "Medium",
    freshnessStatus: "stale",
    hasGaps: false,
    hasBlockers: false,
  });
  assertEquals(result.confidence, "Medium");
  assertEquals(result.downgraded, false);
});

Deno.test("applyConfidenceGating - stale data, Low unchanged", () => {
  const result = applyConfidenceGating({
    modelConfidence: "Low",
    freshnessStatus: "stale",
    hasGaps: true,
    hasBlockers: true,
  });
  assertEquals(result.confidence, "Low");
  assertEquals(result.downgraded, false);
});

// ============= buildFreshnessAuditEntry Tests =============

Deno.test("buildFreshnessAuditEntry - includes all fields", () => {
  const freshness = {
    last_activity_at: "2026-01-22T10:00:00Z",
    days_since_activity: 18,
    status: "stale" as const,
    derived_at: "2026-02-09T10:00:00Z",
    source_table: "consult_logs",
    source_id: "123",
  };

  const result = buildFreshnessAuditEntry(freshness, true);
  assertEquals(result.days_since_activity, 18);
  assertEquals(result.status, "stale");
  assertEquals(result.confidence_downgraded, true);
  assertEquals(result.version, "v1");
});

// ============= getFreshnessGap Tests =============

Deno.test("getFreshnessGap - returns gap when no activity", () => {
  const freshness = {
    last_activity_at: null,
    days_since_activity: null,
    status: "stale" as const,
    derived_at: "2026-02-09T10:00:00Z",
    source_table: null,
    source_id: null,
  };

  const result = getFreshnessGap(freshness);
  assertEquals(result, "No activity history available.");
});

Deno.test("getFreshnessGap - returns null when activity exists", () => {
  const freshness = {
    last_activity_at: "2026-02-06T10:00:00Z",
    days_since_activity: 3,
    status: "fresh" as const,
    derived_at: "2026-02-09T10:00:00Z",
    source_table: "tasks",
    source_id: "123",
  };

  const result = getFreshnessGap(freshness);
  assertEquals(result, null);
});

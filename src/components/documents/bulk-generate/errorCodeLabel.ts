/**
 * Human labels for bulk_document_job_items.last_error_code + outcome payloads.
 *
 * Codes emitted by supabase/functions/bulk-generate-documents-worker/index.ts:
 *   - no_template            (skipped)
 *   - no_published_version   (skipped)
 *   - unsupported_format     (skipped)
 *   - stage_repair_failed    (failed)
 *   - deliver_failed         (failed; also deliver_{status})
 *   - auth_expired           (failed)
 *   - JOB_CANCELLED          (cancelled — from cancel_bulk_document_job)
 */

const LABELS: Record<string, string> = {
  no_template: "No template configured",
  no_published_version: "Template has no published version",
  unsupported_format: "Unsupported template format",
  stage_repair_failed: "Stage repair failed",
  deliver_failed: "Delivery to SharePoint failed",
  auth_expired: "Microsoft sign-in expired — reconnect required",
  JOB_CANCELLED: "Job cancelled",
  excluded_on_retry: "Excluded on retry",
};

/** Convert a snake_case or SCREAMING_SNAKE code to a readable phrase. */
function humaniseCode(code: string): string {
  return code
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function errorCodeLabel(code: string | null | undefined): string {
  if (!code) return "";
  // deliver_{status} — worker emits deliver_401, deliver_500, etc.
  if (code.startsWith("deliver_") && code !== "deliver_failed") {
    const status = code.slice("deliver_".length);
    return `Delivery to SharePoint failed (HTTP ${status})`;
  }
  return LABELS[code] ?? humaniseCode(code);
}

/** Human label for bulk_document_jobs.error_summary.stalled_reason. */
export function stalledReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "Stalled";
  switch (reason) {
    case "jwt_near_expiry":
      return "Stalled — session token expired mid-run";
    case "system_account_auth_failed":
      return "Stalled — system account authentication failed, needs staff attention";
    default:
      return `Stalled — ${reason}`;
  }
}

/**
 * Summary line for state='generated' items.
 *
 * The worker records the deliver-governance-document response body as
 * `outcome`. Successful deliveries populate:
 *
 *   outcome.delivery.tailoring_completeness_pct    (0-100)
 *   outcome.delivery.missing_merge_fields          (string[])
 *   outcome.warnings.missing_fields                (string[])
 *
 * A skipped delivery (e.g. `{ skipped: true }`) is also written to outcome.
 */
type MaybeOutcome = {
  delivery?: {
    tailoring_completeness_pct?: number | null;
    missing_merge_fields?: unknown;
  } | null;
  warnings?: {
    missing_fields?: unknown;
    invalid_fields?: unknown;
  } | null;
  skipped?: boolean;
  note?: string;
} | null | undefined;

export function outcomeSummary(outcome: unknown): {
  label: string;
  detail?: string;
} {
  const o = (outcome ?? null) as MaybeOutcome;
  if (!o || typeof o !== "object") return { label: "Generated" };

  if (o.skipped === true) return { label: "Generated (delivery skipped)" };

  const pct = o.delivery?.tailoring_completeness_pct;
  const missingRaw =
    (Array.isArray(o.delivery?.missing_merge_fields)
      ? (o.delivery?.missing_merge_fields as unknown[])
      : Array.isArray(o.warnings?.missing_fields)
        ? (o.warnings?.missing_fields as unknown[])
        : []) ?? [];
  const missing = missingRaw
    .map((m) => (typeof m === "string" ? m : ""))
    .filter(Boolean);

  if (typeof pct === "number") {
    if (pct >= 100 && missing.length === 0) return { label: "Generated" };
    const detail =
      missing.length > 0
        ? `missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? `, +${missing.length - 3} more` : ""}`
        : undefined;
    return { label: `Generated — ${pct}% complete`, detail };
  }

  if (missing.length > 0) {
    return {
      label: "Generated",
      detail: `missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? `, +${missing.length - 3} more` : ""}`,
    };
  }

  return { label: "Generated" };
}

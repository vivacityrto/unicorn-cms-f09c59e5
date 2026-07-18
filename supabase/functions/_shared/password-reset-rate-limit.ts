/**
 * Per-email / per-IP rate limiting for self-service password-reset endpoints.
 *
 * Mirrors invite-user's audit-table window (5 attempts / email / hour), and
 * adds a looser per-IP cap so randomized-email probes are still throttled.
 * Attempts are recorded in audit_eos_events (action: password_reset_attempt)
 * so send-self-password-reset (and any historical orphan that recorded under
 * the same action) share the same budget.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const GENERIC_RESET_MESSAGE =
  "If an account exists, a reset email has been sent.";

/** Same ceiling as invite-user's per-email window. */
export const PASSWORD_RESET_EMAIL_LIMIT = 5;
/** Broader IP ceiling for unauthenticated probes across many emails. */
export const PASSWORD_RESET_IP_LIMIT = 20;
export const PASSWORD_RESET_WINDOW_MS = 60 * 60 * 1000;
export const PASSWORD_RESET_ATTEMPT_ACTION = "password_reset_attempt";

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

type RateLimitResult =
  | { limited: false }
  | { limited: true; reason: "email" | "ip" };

/**
 * Returns { limited: true } when the email or IP has exceeded the window.
 * Fail-open on lookup errors so a transient audit outage does not block resets.
 */
export async function checkPasswordResetRateLimit(
  supabase: SupabaseClient,
  email: string,
  ip: string,
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - PASSWORD_RESET_WINDOW_MS).toISOString();

  const { count: emailCount, error: emailErr } = await supabase
    .from("audit_eos_events")
    .select("*", { count: "exact", head: true })
    .eq("action", PASSWORD_RESET_ATTEMPT_ACTION)
    .filter("details->>email", "eq", email)
    .gte("created_at", since);

  if (emailErr) {
    console.error("password-reset rate-limit email lookup failed:", emailErr);
  } else if ((emailCount ?? 0) >= PASSWORD_RESET_EMAIL_LIMIT) {
    return { limited: true, reason: "email" };
  }

  if (ip && ip !== "unknown") {
    const { count: ipCount, error: ipErr } = await supabase
      .from("audit_eos_events")
      .select("*", { count: "exact", head: true })
      .eq("action", PASSWORD_RESET_ATTEMPT_ACTION)
      .filter("details->>ip", "eq", ip)
      .gte("created_at", since);

    if (ipErr) {
      console.error("password-reset rate-limit IP lookup failed:", ipErr);
    } else if ((ipCount ?? 0) >= PASSWORD_RESET_IP_LIMIT) {
      return { limited: true, reason: "ip" };
    }
  }

  return { limited: false };
}

/** Record an attempt so subsequent requests share the rate-limit budget. */
export async function recordPasswordResetAttempt(
  supabase: SupabaseClient,
  opts: {
    email: string;
    ip: string;
    endpoint: string;
    tenantId?: number | null;
    userId?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("audit_eos_events").insert({
    tenant_id: opts.tenantId || 1,
    user_id: opts.userId || null,
    entity: "user",
    entity_id: opts.userId || null,
    action: PASSWORD_RESET_ATTEMPT_ACTION,
    details: {
      email: opts.email,
      ip: opts.ip,
      endpoint: opts.endpoint,
    },
  });

  if (error) {
    console.error("password-reset attempt audit insert failed:", error);
  }
}

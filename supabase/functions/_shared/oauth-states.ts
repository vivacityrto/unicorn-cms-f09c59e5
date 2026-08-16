/**
 * Single-use oauth_states consumption for outlook-auth and xero-auth.
 *
 * Rows expire after 10 minutes (expires_at) and may be exchanged once
 * (consumed_at). The consume update is atomic so a replay cannot race
 * a first exchange.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface OAuthStateRecord {
  state: string;
  data: Record<string, unknown>;
  expires_at: string;
  consumed_at: string | null;
}

export type ConsumeOAuthStateResult =
  | { ok: true; record: OAuthStateRecord }
  | { ok: false; status: number; error: string };

export async function consumeOAuthState(
  supabaseAdmin: SupabaseClient,
  state: string,
  callerId: string,
): Promise<ConsumeOAuthStateResult> {
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("oauth_states")
    .select("state, data, expires_at, consumed_at")
    .eq("state", state)
    .maybeSingle();

  if (lookupError) {
    console.error("[oauth-states] State lookup failed:", lookupError);
    return { ok: false, status: 500, error: "Failed to verify OAuth state" };
  }

  if (!existing) {
    return {
      ok: false,
      status: 400,
      error: "Invalid or expired state. Please try connecting again.",
    };
  }

  if (existing.consumed_at) {
    return {
      ok: false,
      status: 400,
      error: "Authorization code already used. Please try connecting again.",
    };
  }

  if (new Date(existing.expires_at) < new Date()) {
    return {
      ok: false,
      status: 400,
      error: "OAuth session expired. Please try connecting again.",
    };
  }

  const stateData = (existing.data ?? {}) as Record<string, unknown>;
  const callerMatch = assertStateCaller(callerId, stateData.user_id);
  if (!callerMatch.ok) {
    return callerMatch;
  }

  const consumedAt = new Date().toISOString();
  const { data: consumed, error: consumeError } = await supabaseAdmin
    .from("oauth_states")
    .update({ consumed_at: consumedAt })
    .eq("state", state)
    .is("consumed_at", null)
    .gt("expires_at", consumedAt)
    .select("state, data, expires_at, consumed_at")
    .maybeSingle();

  if (consumeError) {
    console.error("[oauth-states] Failed to mark state consumed:", consumeError);
    return { ok: false, status: 500, error: "Failed to verify OAuth state" };
  }

  if (!consumed) {
    return {
      ok: false,
      status: 400,
      error: "Authorization code already used. Please try connecting again.",
    };
  }

  return { ok: true, record: consumed as OAuthStateRecord };
}

export function assertStateCaller(
  callerId: string,
  stateUserId: unknown,
): { ok: true } | { ok: false; status: number; error: string } {
  if (typeof stateUserId !== "string" || stateUserId.length === 0) {
    return { ok: false, status: 400, error: "Invalid OAuth state." };
  }
  if (callerId !== stateUserId) {
    return {
      ok: false,
      status: 403,
      error: "OAuth state does not belong to the signed-in user.",
    };
  }
  return { ok: true };
}

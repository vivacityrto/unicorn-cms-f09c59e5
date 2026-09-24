import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emitTimelineEvent } from "./emit-timeline-event.ts";

const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID")!;
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;

// Refresh once the access token is within this window of expiring.
const REFRESH_SKEW_MS = 5 * 60 * 1000;
// If another caller (the 30-min cron, or a concurrent request) updated the
// row this recently, re-read it instead of racing a second refresh against
// Microsoft — Microsoft rotates (single-uses) refresh tokens, so the loser
// of that race gets an unrecoverable invalid_grant and the user has to fully
// reconnect for no real reason.
const RECENT_REFRESH_WINDOW_MS = 10 * 1000;

export interface MicrosoftOAuthTokenRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  scope?: string | null;
  tenant_id?: number | null;
  updated_at?: string | null;
}

/**
 * Returns a valid Microsoft access token for `userId`, refreshing it first
 * if it's expiring soon. Consolidates what used to be two near-identical
 * copies of this logic (sync-outlook-calendar, capture-outlook-email) into
 * one place that:
 *   - writes oauth_tokens.last_error and emits the microsoft_sync_failed
 *     timeline event on a real refresh failure, so a dying connection is
 *     diagnosable instead of just showing generic "Expired" forever, and
 *   - avoids the concurrent-refresh race described above.
 *
 * Pass `preloadedToken` when the caller already SELECTed the row (with `*`,
 * so `updated_at`/`tenant_id` are present) to skip a redundant read.
 */
export async function getValidMicrosoftAccessToken(
  serviceClient: SupabaseClient,
  userId: string,
  preloadedToken?: MicrosoftOAuthTokenRow,
): Promise<string> {
  let token = preloadedToken;
  if (!token) {
    const { data, error } = await serviceClient
      .from("oauth_tokens")
      .select("access_token, refresh_token, expires_at, scope, tenant_id, updated_at")
      .eq("user_id", userId)
      .eq("provider", "microsoft")
      .single();
    if (error || !data) {
      throw new Error("Microsoft account not connected");
    }
    token = data as MicrosoftOAuthTokenRow;
  }

  const expiresAt = new Date(token.expires_at).getTime();
  if (expiresAt - Date.now() > REFRESH_SKEW_MS) {
    return token.access_token;
  }

  if (token.updated_at && Date.now() - new Date(token.updated_at).getTime() < RECENT_REFRESH_WINDOW_MS) {
    const { data: fresh } = await serviceClient
      .from("oauth_tokens")
      .select("access_token, expires_at")
      .eq("user_id", userId)
      .eq("provider", "microsoft")
      .single();
    if (fresh && new Date(fresh.expires_at).getTime() - Date.now() > REFRESH_SKEW_MS) {
      return fresh.access_token;
    }
  }

  if (!token.refresh_token) {
    throw new Error("Microsoft token expired. Please reconnect your Outlook account.");
  }

  const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
      scope: token.scope || "openid profile email offline_access Mail.Read Calendars.ReadWrite",
    }),
  });

  if (!tokenResponse.ok) {
    const rawError = await tokenResponse.text();
    let errorDetail = rawError;
    try {
      const parsed = JSON.parse(rawError);
      errorDetail = parsed.error_description || parsed.error || rawError;
    } catch {
      // keep raw text
    }
    errorDetail = errorDetail.slice(0, 500);
    console.error("[outlook-token-refresh] Refresh failed:", errorDetail);

    await serviceClient.from("oauth_tokens").update({
      last_error: errorDetail,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("provider", "microsoft");

    if (token.tenant_id != null) {
      await emitTimelineEvent(serviceClient, {
        tenant_id: token.tenant_id,
        client_id: String(token.tenant_id),
        event_type: "microsoft_sync_failed",
        title: "Microsoft token refresh failed — reconnect required",
        body: errorDetail,
        source: "microsoft",
        visibility: "internal",
        entity_type: "user",
        entity_id: userId,
        metadata: { error: errorDetail },
        created_by: userId,
        dedupe_key: `ms_sync_failed:${userId}:${new Date().toISOString().split("T")[0]}`,
      });
    }

    throw new Error("Microsoft token expired. Please reconnect your Outlook account.");
  }

  const tokens = await tokenResponse.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: updateError } = await serviceClient.from("oauth_tokens").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || token.refresh_token,
    expires_at: newExpiresAt,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("provider", "microsoft");

  if (updateError) {
    console.error("[outlook-token-refresh] Failed to persist refreshed token:", updateError);
  }

  return tokens.access_token as string;
}

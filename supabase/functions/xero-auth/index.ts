import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Trimmed defensively - a trailing newline/space from copy-pasting into
// Supabase's secrets UI silently breaks Basic Auth encoding with no
// visible symptom anywhere except Xero's invalid_client rejection.
const XERO_CLIENT_ID = (Deno.env.get("XERO_CLIENT_ID") ?? "").trim();
const XERO_CLIENT_SECRET = (Deno.env.get("XERO_CLIENT_SECRET") ?? "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// This is one shared connection to Vivacity's own Xero organisation
// (invoice/contact lookups across all client tenants), not a per-client
// integration - hence the Vivacity system tenant id, not a client tenant_id.
const VIVACITY_SYSTEM_TENANT_ID = 6372;

// Xero's OAuth server rejects offline_access (as invalid_scope) unless
// openid/profile/email are also requested - offline_access only makes
// sense alongside an OIDC identity token in strict OIDC semantics.
// Note: accounting.transactions[.read] is NOT a current Xero scope -
// invoices live under accounting.invoices[.read] specifically (confirmed
// against this app's actual enabled scope list in the Xero Developer
// Portal, which has no accounting.transactions entry at all).
const XERO_SCOPES = "openid profile email offline_access accounting.invoices.read accounting.contacts.read";

function json(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let action: string | null = null;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
    action = (body.action as string) ?? null;
  } catch {
    const url = new URL(req.url);
    action = url.searchParams.get("action");
  }

  const authHeader = req.headers.get("Authorization");

  // Connecting/disconnecting Xero touches one shared org-level credential,
  // so it's restricted to the same roles that already carry
  // administration:access in useRBAC.tsx (Super Admin, Integrator) -
  // not the "any authenticated user manages their own connection" rule
  // that outlook-auth uses.
  const ADMIN_ACCESS_ROLES = ["Super Admin", "Integrator"];
  const getAdminCaller = async () => {
    if (!authHeader) return null;
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    const { data: profile } = await supabaseAdmin
      .from("users")
      .select("unicorn_role, is_vivacity_internal")
      .eq("user_uuid", user.id)
      .maybeSingle();
    if (!ADMIN_ACCESS_ROLES.includes(profile?.unicorn_role ?? "") || !profile?.is_vivacity_internal) {
      return null;
    }
    return user;
  };

  const getVivacityStaffCaller = async () => {
    if (!authHeader) return null;
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    const { data: profile } = await supabaseAdmin
      .from("users")
      .select("is_vivacity_internal")
      .eq("user_uuid", user.id)
      .maybeSingle();
    if (!profile?.is_vivacity_internal) return null;
    return user;
  };

  try {
    // Action: Get auth URL to redirect the caller to Xero's consent screen
    if (action === "get-auth-url") {
      const caller = await getAdminCaller();
      if (!caller) {
        return json(req, 403, { error: "Only Vivacity Super Admins or Integrators can connect Xero." });
      }

      const redirectUri = body.redirect_uri as string;
      if (!redirectUri) {
        return json(req, 400, { error: "redirect_uri is required" });
      }

      const state = crypto.randomUUID();
      const { error: stateError } = await supabaseAdmin.from("oauth_states").upsert({
        state,
        data: { user_id: caller.id, redirect_uri: redirectUri, provider: "xero" },
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      if (stateError) {
        console.error("[xero-auth] Failed to store state:", stateError);
        return json(req, 500, { error: "Failed to initialise OAuth" });
      }

      const authUrl = new URL("https://login.xero.com/identity/connect/authorize");
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", XERO_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", XERO_SCOPES);
      authUrl.searchParams.set("state", state);

      return json(req, 200, { auth_url: authUrl.toString(), state });
    }

    // Action: Exchange the authorization code for tokens
    if (action === "exchange-code") {
      const code = body.code as string;
      const redirectUri = body.redirect_uri as string;
      const state = body.state as string;

      if (!code || !state) {
        return json(req, 400, { error: "code and state are required" });
      }

      const { data: stateRecord, error: stateError } = await supabaseAdmin
        .from("oauth_states")
        .select("*")
        .eq("state", state)
        .single();

      if (stateError || !stateRecord) {
        return json(req, 400, { error: "Invalid or expired state. Please try connecting again." });
      }

      if (new Date(stateRecord.expires_at) < new Date()) {
        await supabaseAdmin.from("oauth_states").delete().eq("state", state);
        return json(req, 400, { error: "OAuth session expired. Please try connecting again." });
      }

      const stateData = stateRecord.data as { user_id: string; redirect_uri: string };
      const canonicalRedirectUri = stateData.redirect_uri;

      const basicAuth = btoa(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`);
      const tokenResponse = await fetch("https://identity.xero.com/connect/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: canonicalRedirectUri,
        }),
      });

      const tokenText = await tokenResponse.text();

      if (!tokenResponse.ok) {
        console.error("[xero-auth] Token exchange failed:", tokenResponse.status, tokenText);
        // Surface Xero's actual response verbatim rather than a fallback
        // string - a silently-swallowed JSON.parse failure or a response
        // shaped differently than expected was hiding the real reason.
        let errorMessage = `Token exchange failed (HTTP ${tokenResponse.status}): ${tokenText.slice(0, 500)}`;
        try {
          const parsed = JSON.parse(tokenText);
          if (parsed.error_description || parsed.error) {
            errorMessage = `Token exchange failed: ${parsed.error_description || parsed.error}`;
            if (parsed.error === "invalid_client") {
              // Lengths only, never the values - just enough to tell a
              // whitespace/truncation/wrong-secret problem apart from a
              // config mismatch on Xero's side.
              errorMessage += ` (configured client_id length: ${XERO_CLIENT_ID.length}, client_secret length: ${XERO_CLIENT_SECRET.length})`;
            }
          }
        } catch {
          // tokenText wasn't JSON - the raw-text fallback above already covers it
        }
        return json(req, 400, { error: errorMessage });
      }

      const tokens = JSON.parse(tokenText);
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // The token isn't scoped to one org by itself - /connections tells us
      // which Xero organisation(s) it was actually granted access to, and
      // tenantId is required on the Xero-tenant-id header for every
      // subsequent Accounting API call.
      let tenantId: string | null = null;
      let tenantName: string | null = null;
      try {
        const connectionsResp = await fetch("https://api.xero.com/connections", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (connectionsResp.ok) {
          const connections = await connectionsResp.json();
          if (Array.isArray(connections) && connections.length > 0) {
            tenantId = connections[0].tenantId ?? null;
            tenantName = connections[0].tenantName ?? null;
          }
        } else {
          console.warn("[xero-auth] /connections lookup failed:", connectionsResp.status);
        }
      } catch (e) {
        console.warn("[xero-auth] Failed to fetch connections:", e);
      }

      const { error: upsertError } = await supabaseAdmin.from("oauth_tokens").upsert({
        user_id: stateData.user_id,
        tenant_id: VIVACITY_SYSTEM_TENANT_ID,
        provider: "xero",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt.toISOString(),
        scope: tokens.scope,
        account_email: tenantName,
        provider_account_id: tenantId,
        last_synced_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider" });

      if (upsertError) {
        console.error("[xero-auth] Failed to store tokens:", upsertError);
        return json(req, 500, { error: "Failed to store tokens" });
      }

      await supabaseAdmin.from("oauth_states").delete().eq("state", state);

      return json(req, 200, { success: true, organisation_name: tenantName });
    }

    // Action: Check connection status (any Vivacity staff can view)
    if (action === "status") {
      const caller = await getVivacityStaffCaller();
      if (!caller) {
        return json(req, 403, { error: "Vivacity staff only" });
      }

      const { data: tokenRow } = await supabaseAdmin
        .from("oauth_tokens")
        .select("expires_at, updated_at, account_email, provider_account_id, last_synced_at, last_error")
        .eq("provider", "xero")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isExpired = tokenRow ? new Date(tokenRow.expires_at) < new Date() : false;

      return json(req, 200, {
        connected: !!tokenRow,
        organisation_name: tokenRow?.account_email ?? null,
        expires_at: tokenRow?.expires_at ?? null,
        last_synced_at: tokenRow?.last_synced_at ?? null,
        last_error: tokenRow?.last_error ?? null,
        is_expired: isExpired,
      });
    }

    // Action: Disconnect
    if (action === "disconnect") {
      const caller = await getAdminCaller();
      if (!caller) {
        return json(req, 403, { error: "Only Vivacity Super Admins or Integrators can disconnect Xero." });
      }

      await supabaseAdmin.from("oauth_tokens").delete().eq("provider", "xero");

      return json(req, 200, { success: true });
    }

    return json(req, 400, { error: "Invalid action" });
  } catch (error) {
    console.error("[xero-auth] Unhandled error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(req, 500, { error: message });
  }
});

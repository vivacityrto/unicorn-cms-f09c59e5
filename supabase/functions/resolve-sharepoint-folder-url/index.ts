import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { graphGet } from "../_shared/graph-app-client.ts";
import { requireCaller, FeatureKeys } from "../_shared/requireCaller.ts";
import { corsHeaders } from "../_shared/cors.ts";


const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestedTenantId = body?.tenant_id as number | undefined;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const caller = await requireCaller(req, supabaseAdmin, {
      featureKey: FeatureKeys.staffSharepoint,
      headers: corsHeaders(req),
      unauthorizedMessage: "Unauthorized",
      forbiddenMessage: "Unauthorized",
      orAllow: async ({ userId }) => {
        const { data } = await supabaseAdmin
          .from("users")
          .select("tenant_id")
          .eq("user_uuid", userId)
          .maybeSingle();
        return data?.tenant_id != null;
      },
    });
    if (!caller.ok) return caller.response;
    const user = caller.user;

    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("tenant_id")
      .eq("user_uuid", user.id)
      .single();

    // Staff (check_permission) may override tenant_id; others stay on their own.
    const isStaff = caller.via === "permission";

    let tenantId: number | undefined;
    if (isStaff && requestedTenantId) {
      tenantId = requestedTenantId;
    } else if (userData?.tenant_id) {
      tenantId = userData.tenant_id;
    }

    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: "No tenant found for user" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("tenant_sharepoint_settings")
      .select("drive_id, shared_folder_item_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (settingsError) {
      return new Response(
        JSON.stringify({ error: settingsError.message }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const settingValues = settings as { drive_id?: string | null; shared_folder_item_id?: string | null } | null;
    const driveId = settingValues?.drive_id;
    const itemId = settingValues?.shared_folder_item_id;

    if (!driveId || !itemId) {
      return new Response(
        JSON.stringify({ error: "Shared folder not configured" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const graphResp = await graphGet<{ webUrl?: string }>(
      `/drives/${driveId}/items/${itemId}?$select=webUrl`,
    );

    if (!graphResp.ok || !graphResp.data?.webUrl) {
      return new Response(
        JSON.stringify({ error: `Graph request failed: ${graphResp.status}` }),
        { status: graphResp.status || 502, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const webUrl = graphResp.data.webUrl;

    await supabaseAdmin
      .from("tenant_sharepoint_settings")
      .update({ shared_folder_url: webUrl, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId);

    return new Response(
      JSON.stringify({ url: webUrl }),
      { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[resolve-sharepoint-folder-url] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { graphGet } from "../_shared/graph-app-client.ts";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VIVACITY_STAFF_ROLES = [
  "Super Admin", "Team Leader", "Team Member",
  "Integrator", "BGT", "CSC", "CET",
];
const isVivacityStaffRole = (role?: string | null) =>
  !!role && VIVACITY_STAFF_ROLES.includes(role);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestedTenantId = body?.tenant_id as number | undefined;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("tenant_id, unicorn_role, global_role")
      .eq("user_uuid", user.id)
      .single();

    const isSuperAdmin =
      isVivacityStaffRole(userData?.unicorn_role) || userData?.global_role === "SuperAdmin";

    let tenantId: number | undefined;
    if (isSuperAdmin && requestedTenantId) {
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

    const driveId = (settings as any)?.drive_id as string | null | undefined;
    const itemId = (settings as any)?.shared_folder_item_id as string | null | undefined;

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

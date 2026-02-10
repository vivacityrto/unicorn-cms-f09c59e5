import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID")!;
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Encode a sharing URL into the Graph API shareId format.
 * See: https://learn.microsoft.com/en-us/graph/api/shares-get
 */
function encodeShareUrl(url: string): string {
  const base64 = btoa(url);
  // URL-safe base64: replace + → -, / → _, trim trailing =
  const urlSafe = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `u!${urlSafe}`;
}

async function refreshToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  token: { access_token: string; refresh_token: string; expires_at: string; scope?: string }
): Promise<string> {
  const expiresAt = new Date(token.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return token.access_token;
  }

  const tokenResponse = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        refresh_token: token.refresh_token,
        grant_type: "refresh_token",
        scope: token.scope || "openid profile email offline_access Files.Read.All",
      }),
    }
  );

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("[validate-sp] Token refresh failed:", errorText);
    throw new Error("Failed to refresh Microsoft token — user may need to reconnect");
  }

  const tokens = await tokenResponse.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await supabaseAdmin
    .from("oauth_tokens")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || token.refresh_token,
      expires_at: newExpiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "microsoft");

  return tokens.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { tenant_id, root_folder_url } = body as {
      tenant_id: number;
      root_folder_url: string;
    };

    if (!tenant_id || !root_folder_url) {
      return new Response(
        JSON.stringify({ error: "tenant_id and root_folder_url are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller is Vivacity team
    const { data: callerUser } = await supabaseAdmin
      .from("users")
      .select("unicorn_role, is_vivacity_internal")
      .eq("user_uuid", user.id)
      .single();

    if (!callerUser?.is_vivacity_internal) {
      return new Response(
        JSON.stringify({ error: "Forbidden — Vivacity staff only" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get caller's Microsoft token
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from("oauth_tokens")
      .select("access_token, refresh_token, expires_at, scope")
      .eq("user_id", user.id)
      .eq("provider", "microsoft")
      .single();

    if (tokenError || !tokenData) {
      // Store failure
      await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
        validation_status: "invalid",
        validation_error: "No Microsoft account connected. Please connect your Microsoft account first.",
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "No Microsoft account connected. Please connect your Microsoft account first.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Refresh token if needed
    let accessToken: string;
    try {
      accessToken = await refreshToken(supabaseAdmin, user.id, tokenData);
    } catch (e) {
      await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
        validation_status: "invalid",
        validation_error: "Microsoft token expired. Please reconnect your Microsoft account.",
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Microsoft token expired. Please reconnect your Microsoft account.",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve the URL to a driveItem via Graph sharing API
    const shareId = encodeShareUrl(root_folder_url.trim());
    console.log("[validate-sp] Resolving shareId:", shareId.substring(0, 30) + "...");

    const graphUrl = `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem?$select=id,name,folder,file,parentReference,webUrl`;
    const graphRes = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!graphRes.ok) {
      const errorBody = await graphRes.text();
      console.error("[validate-sp] Graph resolution failed:", graphRes.status, errorBody);

      let errorMessage = "Could not resolve this URL. ";
      if (graphRes.status === 404) {
        errorMessage += 'Make sure the URL is a valid SharePoint sharing link. Use "Copy link" from SharePoint.';
      } else if (graphRes.status === 403) {
        errorMessage += "You do not have access to this resource. Check your Microsoft permissions.";
      } else {
        errorMessage += `Microsoft returned status ${graphRes.status}.`;
      }

      await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
        validation_status: "invalid",
        validation_error: errorMessage,
      });

      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const driveItem = await graphRes.json();

    // Must be a folder
    if (!driveItem.folder) {
      const errorMessage = `"${driveItem.name}" is a file, not a folder. Please provide a folder link.`;
      await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
        validation_status: "invalid",
        validation_error: errorMessage,
      });
      return new Response(
        JSON.stringify({ success: false, error: errorMessage, is_folder: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const driveId = driveItem.parentReference?.driveId;
    const rootItemId = driveItem.id;
    const rootName = driveItem.name;
    const webUrl = driveItem.webUrl;

    if (!driveId) {
      const errorMessage = "Could not determine the drive ID for this folder.";
      await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
        validation_status: "invalid",
        validation_error: errorMessage,
      });
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[validate-sp] Resolved:", { driveId, rootItemId, rootName, webUrl });

    // Upsert settings — valid
    await upsertSettings(supabaseAdmin, tenant_id, root_folder_url, user.id, {
      validation_status: "valid",
      drive_id: driveId,
      root_item_id: rootItemId,
      root_name: rootName,
      validation_error: null,
      last_validated_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        drive_id: driveId,
        root_item_id: rootItemId,
        root_name: rootName,
        web_url: webUrl,
        is_folder: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[validate-sp] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function upsertSettings(
  supabaseAdmin: ReturnType<typeof createClient>,
  tenantId: number,
  rootFolderUrl: string,
  userId: string,
  fields: Record<string, unknown>
) {
  // Check if row exists
  const { data: existing } = await supabaseAdmin
    .from("tenant_sharepoint_settings")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("tenant_sharepoint_settings")
      .update({
        root_folder_url: rootFolderUrl,
        updated_by: userId,
        updated_at: new Date().toISOString(),
        ...fields,
      })
      .eq("tenant_id", tenantId);
  } else {
    await supabaseAdmin
      .from("tenant_sharepoint_settings")
      .insert({
        tenant_id: tenantId,
        root_folder_url: rootFolderUrl,
        created_by: userId,
        ...fields,
      });
  }
}

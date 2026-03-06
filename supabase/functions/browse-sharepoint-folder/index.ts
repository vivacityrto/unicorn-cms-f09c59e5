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
    console.error("[browse-sp] Token refresh failed:", errorText);
    throw new Error("Failed to refresh Microsoft token");
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

/**
 * Walk parentReference chain upward to verify item is within the root subtree.
 */
async function verifyWithinRoot(
  accessToken: string,
  driveId: string,
  itemId: string,
  rootItemId: string
): Promise<boolean> {
  let currentId = itemId;
  const maxDepth = 20; // safety limit

  for (let i = 0; i < maxDepth; i++) {
    if (currentId === rootItemId) return true;

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${currentId}?$select=id,parentReference`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      await res.text(); // consume body
      return false;
    }

    const item = await res.json();
    const parentId = item.parentReference?.id;

    if (!parentId) return false;
    if (parentId === rootItemId) return true;

    currentId = parentId;
  }

  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action as string;

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

    // Get tenant_id from user
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("tenant_id")
      .eq("user_uuid", user.id)
      .single();

    if (!userData?.tenant_id) {
      return new Response(
        JSON.stringify({ error: "No tenant found for user" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantId = userData.tenant_id;

    // Get SharePoint settings for tenant
    const { data: spSettings } = await supabaseAdmin
      .from("tenant_sharepoint_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (!spSettings || !spSettings.is_enabled || spSettings.validation_status !== "valid") {
      return new Response(
        JSON.stringify({ error: "SharePoint folder not configured or disabled for this tenant" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's Microsoft token
    const { data: tokenData } = await supabaseAdmin
      .from("oauth_tokens")
      .select("access_token, refresh_token, expires_at, scope")
      .eq("user_id", user.id)
      .eq("provider", "microsoft")
      .single();

    if (!tokenData) {
      return new Response(
        JSON.stringify({ error: "Microsoft account not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken: string;
    try {
      accessToken = await refreshToken(supabaseAdmin, user.id, tokenData);
    } catch {
      return new Response(
        JSON.stringify({ error: "Microsoft token expired. Please reconnect." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { drive_id, root_item_id } = spSettings;

    // ===================== LIST FOLDER CONTENTS =====================
    if (action === "list") {
      // Determine the effective root: use shared_folder_item_id if requested and configured
      const useSharedRoot = body.use_shared_folder === true && spSettings.shared_folder_item_id;
      const effectiveRootId = useSharedRoot ? spSettings.shared_folder_item_id : root_item_id;
      
      // folder_id defaults to effective root
      const folderId = (body.folder_id as string) || effectiveRootId;

      // If browsing a subfolder, verify it's within root (always validate against the actual root)
      if (folderId !== root_item_id) {
        const withinRoot = await verifyWithinRoot(accessToken, drive_id, folderId, root_item_id);
        if (!withinRoot) {
          return new Response(
            JSON.stringify({ error: "Access denied — folder is outside the configured root" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const graphUrl = `https://graph.microsoft.com/v1.0/drives/${drive_id}/items/${folderId}/children?$select=id,name,size,lastModifiedDateTime,folder,file,webUrl&$top=200`;
      const res = await fetch(graphUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("[browse-sp] List failed:", res.status, errorText);
        return new Response(
          JSON.stringify({ error: "Failed to list folder contents" }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();
      const items = (data.value || []).map((item: Record<string, unknown>) => ({
        id: item.id,
        name: item.name,
        size: item.size,
        last_modified: item.lastModifiedDateTime,
        is_folder: !!item.folder,
        mime_type: (item.file as Record<string, unknown>)?.mimeType || null,
        web_url: item.webUrl,
        child_count: (item.folder as Record<string, unknown>)?.childCount || 0,
      }));

      // Audit browse
      await supabaseAdmin.from("sharepoint_access_log").insert({
        user_id: user.id,
        tenant_id: tenantId,
        action: "browse",
        drive_id,
        item_id: folderId,
        file_name: null,
      });

      return new Response(
        JSON.stringify({
          items,
          folder_id: folderId,
          is_root: folderId === effectiveRootId,
          root_name: useSharedRoot ? (spSettings.shared_folder_name || spSettings.root_name) : spSettings.root_name,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===================== DOWNLOAD FILE =====================
    if (action === "download") {
      const itemId = body.item_id as string;
      if (!itemId) {
        return new Response(
          JSON.stringify({ error: "item_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify within root (server-side enforcement)
      const withinRoot = await verifyWithinRoot(accessToken, drive_id, itemId, root_item_id);
      if (!withinRoot) {
        return new Response(
          JSON.stringify({ error: "Access denied — file is outside the configured root folder" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get item metadata for name
      const metaRes = await fetch(
        `https://graph.microsoft.com/v1.0/drives/${drive_id}/items/${itemId}?$select=id,name,file`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!metaRes.ok) {
        const errorText = await metaRes.text();
        console.error("[browse-sp] Meta fetch failed:", metaRes.status, errorText);
        return new Response(
          JSON.stringify({ error: "File not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const meta = await metaRes.json();

      if (!meta.file) {
        return new Response(
          JSON.stringify({ error: "Cannot download a folder" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get download URL (Graph returns a 302 redirect)
      const downloadRes = await fetch(
        `https://graph.microsoft.com/v1.0/drives/${drive_id}/items/${itemId}/content`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          redirect: "manual",
        }
      );

      const downloadUrl = downloadRes.headers.get("Location");

      if (!downloadUrl) {
        // If no redirect, the body IS the content
        const content = await downloadRes.arrayBuffer();
        // Audit
        await supabaseAdmin.from("sharepoint_access_log").insert({
          user_id: user.id,
          tenant_id: tenantId,
          action: "download",
          drive_id,
          item_id: itemId,
          file_name: meta.name,
        });

        return new Response(content, {
          headers: {
            ...corsHeaders,
            "Content-Type": meta.file.mimeType || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${meta.name}"`,
          },
        });
      }

      // Audit
      await supabaseAdmin.from("sharepoint_access_log").insert({
        user_id: user.id,
        tenant_id: tenantId,
        action: "download",
        drive_id,
        item_id: itemId,
        file_name: meta.name,
      });

      // Return the pre-authenticated download URL for the client to fetch directly
      return new Response(
        JSON.stringify({
          download_url: downloadUrl,
          file_name: meta.name,
          mime_type: meta.file.mimeType,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "list" or "download".' }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[browse-sp] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

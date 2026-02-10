import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emitTimelineEvent } from "../_shared/emit-timeline-event.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID")!;
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;
const MICROSOFT_TENANT_ID = Deno.env.get("MICROSOFT_TENANT_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── SharePoint base configuration ──
// These define where client folders are created.
// Site ID and Drive ID should be set via app_settings or env vars in production.
const SP_BASE_PATH = "/Unicorn Clients";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/**
 * Sanitise a folder name for SharePoint.
 * Removes illegal characters: ~ " # % & * : < > ? / \ { | }
 */
function sanitiseFolderName(name: string): string {
  return name
    .replace(/[~"#%&*:<>?/\\{|}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 120);
}

/**
 * Get an application-only (client_credentials) token from Azure AD.
 * This does NOT depend on any user being connected.
 */
async function getAppToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("[provision-sp] Token request failed:", resp.status, errText);
    throw new Error(`Failed to obtain app token: ${resp.status}`);
  }

  const data = await resp.json();
  return data.access_token;
}

/**
 * Resolve the site ID and drive ID from a SharePoint site URL or known config.
 * For now, uses app_settings or falls back to discovering from the root site.
 */
async function resolveSiteAndDrive(
  supabaseAdmin: ReturnType<typeof createClient>,
  accessToken: string,
): Promise<{ siteId: string; driveId: string }> {
  // Check if we have config stored in app_settings metadata
  const { data: appSettings } = await supabaseAdmin
    .from("app_settings")
    .select("*")
    .limit(1)
    .single();

  // Try to get site/drive from existing tenant_sharepoint_settings with success status
  const { data: existingConfig } = await supabaseAdmin
    .from("tenant_sharepoint_settings")
    .select("site_id, drive_id")
    .eq("provisioning_status", "success")
    .not("site_id", "is", null)
    .not("drive_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (existingConfig?.site_id && existingConfig?.drive_id) {
    return { siteId: existingConfig.site_id, driveId: existingConfig.drive_id };
  }

  // Discover from the root site's default document library
  // First get the root site
  const siteResp = await fetch(`${GRAPH_BASE}/sites/root`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!siteResp.ok) {
    const errText = await siteResp.text();
    console.error("[provision-sp] Could not resolve root site:", siteResp.status, errText);
    throw new Error("Could not resolve SharePoint root site. Check app permissions.");
  }

  const site = await siteResp.json();
  const siteId = site.id;

  // Get the default drive (Documents library)
  const driveResp = await fetch(`${GRAPH_BASE}/sites/${siteId}/drive`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!driveResp.ok) {
    const errText = await driveResp.text();
    console.error("[provision-sp] Could not resolve default drive:", driveResp.status, errText);
    throw new Error("Could not resolve SharePoint document library. Check app permissions.");
  }

  const drive = await driveResp.json();
  return { siteId, driveId: drive.id };
}

/**
 * Ensure the base folder exists (e.g., /Unicorn Clients).
 * Creates it if missing.
 */
async function ensureBaseFolder(
  accessToken: string,
  driveId: string,
  basePath: string,
): Promise<void> {
  // Check if it exists
  const encodedPath = encodeURIComponent(basePath.replace(/^\//, ""));
  const checkUrl = `${GRAPH_BASE}/drives/${driveId}/root:/${encodedPath}`;

  const checkResp = await fetch(checkUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (checkResp.ok) {
    await checkResp.text(); // consume body
    return; // Already exists
  }

  // Consume the error body
  await checkResp.text();

  // Create it under root
  const folderName = basePath.replace(/^\//, "").split("/")[0];
  const createUrl = `${GRAPH_BASE}/drives/${driveId}/root/children`;

  const createResp = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });

  if (!createResp.ok && createResp.status !== 409) {
    const errText = await createResp.text();
    console.error("[provision-sp] Failed to create base folder:", createResp.status, errText);
    throw new Error(`Failed to create base folder "${folderName}"`);
  }

  // Consume response body
  if (createResp.status === 409) {
    await createResp.text(); // Already exists (race condition)
  } else {
    await createResp.json();
  }
}

/**
 * Create the tenant folder under the base path.
 * Returns { itemId, webUrl, folderName }.
 */
async function createTenantFolder(
  accessToken: string,
  driveId: string,
  basePath: string,
  folderName: string,
): Promise<{ itemId: string; webUrl: string }> {
  const encodedBasePath = basePath.replace(/^\//, "");
  const createUrl = `${GRAPH_BASE}/drives/${driveId}/root:/${encodeURIComponent(encodedBasePath)}:/children`;

  const createResp = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });

  if (createResp.status === 409) {
    // Folder already exists — fetch it
    await createResp.text();
    const getUrl = `${GRAPH_BASE}/drives/${driveId}/root:/${encodeURIComponent(encodedBasePath)}/${encodeURIComponent(folderName)}`;
    const getResp = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!getResp.ok) {
      const errText = await getResp.text();
      throw new Error(`Folder exists but could not be retrieved: ${getResp.status}`);
    }

    const existing = await getResp.json();
    return { itemId: existing.id, webUrl: existing.webUrl };
  }

  if (!createResp.ok) {
    const errText = await createResp.text();
    console.error("[provision-sp] Failed to create tenant folder:", createResp.status, errText);
    throw new Error(`Failed to create folder "${folderName}": ${createResp.status}`);
  }

  const item = await createResp.json();
  return { itemId: item.id, webUrl: item.webUrl };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const { tenant_id } = body as { tenant_id: number };

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Auth — optional (can be called from system during onboarding or by Vivacity user)
    let callerUserId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(
        authHeader.replace("Bearer ", ""),
      );
      if (user) {
        // Verify Vivacity team
        const { data: callerUser } = await supabaseAdmin
          .from("users")
          .select("is_vivacity_internal")
          .eq("user_uuid", user.id)
          .single();

        if (!callerUser?.is_vivacity_internal) {
          return new Response(
            JSON.stringify({ success: false, error: "Forbidden — Vivacity staff only" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        callerUserId = user.id;
      }
    }

    // Load tenant
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id, name, slug")
      .eq("id", tenant_id)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ success: false, error: `Tenant ${tenant_id} not found` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check idempotency
    const { data: existingSettings } = await supabaseAdmin
      .from("tenant_sharepoint_settings")
      .select("provisioning_status, root_item_id")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (existingSettings?.provisioning_status === "success" && existingSettings?.root_item_id) {
      return new Response(
        JSON.stringify({
          success: true,
          already_provisioned: true,
          message: "SharePoint folder already provisioned",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Mark as pending
    await upsertSettings(supabaseAdmin, tenant_id, callerUserId, {
      provisioning_status: "pending",
      provisioning_error: null,
    });

    // Get app-only token
    const accessToken = await getAppToken();

    // Resolve site and drive
    const { siteId, driveId } = await resolveSiteAndDrive(supabaseAdmin, accessToken);

    // Ensure base folder exists
    await ensureBaseFolder(accessToken, driveId, SP_BASE_PATH);

    // Build folder name: "{TenantName} ({TenantId})"
    const rawFolderName = `${tenant.name} (${tenant.id})`;
    const folderName = sanitiseFolderName(rawFolderName);
    const folderPath = `${SP_BASE_PATH}/${folderName}`;

    console.log("[provision-sp] Creating folder:", { folderName, folderPath, siteId, driveId });

    // Create folder
    const { itemId, webUrl } = await createTenantFolder(
      accessToken,
      driveId,
      SP_BASE_PATH,
      folderName,
    );

    console.log("[provision-sp] Folder created:", { itemId, webUrl });

    // Save to tenant_sharepoint_settings
    await upsertSettings(supabaseAdmin, tenant_id, callerUserId, {
      site_id: siteId,
      drive_id: driveId,
      base_path: SP_BASE_PATH,
      folder_name: folderName,
      folder_path: folderPath,
      root_folder_url: webUrl,
      root_item_id: itemId,
      root_name: folderName,
      validation_status: "valid",
      validated_at: new Date().toISOString(),
      last_validated_at: new Date().toISOString(),
      provisioning_status: "success",
      provisioning_error: null,
    });

    // Emit timeline event
    await emitTimelineEvent(supabaseAdmin, {
      tenant_id: tenant_id,
      client_id: String(tenant_id),
      event_type: "sharepoint_root_configured",
      title: `SharePoint folder auto-provisioned: ${folderName}`,
      source: "microsoft",
      visibility: "internal",
      entity_type: "tenant_sharepoint_settings",
      metadata: {
        folder_name: folderName,
        folder_path: folderPath,
        drive_id: driveId,
        item_id: itemId,
        auto_provisioned: true,
      },
      created_by: callerUserId,
      dedupe_key: `sp_provision:${tenant_id}`,
    });

    // Audit log
    await supabaseAdmin.from("audit_events").insert({
      entity: "tenant_sharepoint_settings",
      entity_id: String(tenant_id),
      action: "sharepoint_folder_provisioned",
      user_id: callerUserId,
      details: {
        folder_name: folderName,
        folder_path: folderPath,
        web_url: webUrl,
        site_id: siteId,
        drive_id: driveId,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        folder_name: folderName,
        folder_path: folderPath,
        web_url: webUrl,
        item_id: itemId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[provision-sp] Error:", error);

    // Try to mark as failed
    try {
      const body = await req.clone().json().catch(() => null);
      if (body?.tenant_id) {
        await upsertSettings(supabaseAdmin, body.tenant_id, null, {
          provisioning_status: "failed",
          provisioning_error: error instanceof Error ? error.message : "Unknown error",
        });

        // Emit failure timeline event
        await emitTimelineEvent(supabaseAdmin, {
          tenant_id: body.tenant_id,
          client_id: String(body.tenant_id),
          event_type: "sharepoint_root_invalid",
          title: "SharePoint folder provisioning failed",
          source: "microsoft",
          visibility: "internal",
          entity_type: "tenant_sharepoint_settings",
          metadata: {
            error: error instanceof Error ? error.message : "Unknown error",
            auto_provisioned: true,
          },
          dedupe_key: `sp_provision_fail:${body.tenant_id}:${new Date().toISOString().split("T")[0]}`,
        });
      }
    } catch {
      // Best effort
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function upsertSettings(
  supabaseAdmin: ReturnType<typeof createClient>,
  tenantId: number,
  userId: string | null,
  fields: Record<string, unknown>,
) {
  const { data: existing } = await supabaseAdmin
    .from("tenant_sharepoint_settings")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("tenant_sharepoint_settings")
      .update({
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
        created_by: userId || "00000000-0000-0000-0000-000000000000",
        ...fields,
      });
  }
}

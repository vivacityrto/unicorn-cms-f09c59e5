import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emitTimelineEvent } from "../_shared/emit-timeline-event.ts";
import {
  getAppToken,
  graphGet,
  graphPost,
  ensureFolder as sharedEnsureFolder,
  sanitiseFolderName,
  buildClientFolderName,
  type DriveItem,
} from "../_shared/graph-app-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SP_BASE_PATH = "/Unicorn Clients";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";  // kept for direct fetch calls below

// ── Helpers ──

// sanitiseFolderName is now imported from ../_shared/graph-app-client.ts

// getAppToken is now imported from ../_shared/graph-app-client.ts

async function resolveSiteAndDrive(
  supabaseAdmin: ReturnType<typeof createClient>,
  accessToken: string,
): Promise<{ siteId: string; driveId: string }> {
  // 1. Try from sharepoint_sites registry (authoritative source)
  const { data: spSite } = await supabaseAdmin
    .from("sharepoint_sites")
    .select("graph_site_id, drive_id")
    .eq("purpose", "client_files")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (spSite?.graph_site_id && spSite?.drive_id) {
    return { siteId: spSite.graph_site_id, driveId: spSite.drive_id };
  }

  // 2. Try from existing successful tenant settings
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

  // 3. Discover from root site via Graph API (requires Sites.Read.All)
  const siteResp = await fetch(`${GRAPH_BASE}/sites/root`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!siteResp.ok) {
    await siteResp.text();
    throw new Error(
      "Could not resolve SharePoint site. Ensure sharepoint_sites has a 'client_files' row with graph_site_id and drive_id populated, or grant Sites.Read.All to the Azure app."
    );
  }
  const site = await siteResp.json();

  const driveResp = await fetch(`${GRAPH_BASE}/sites/${site.id}/drive`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!driveResp.ok) {
    await driveResp.text();
    throw new Error("Could not resolve SharePoint document library.");
  }
  const drive = await driveResp.json();
  return { siteId: site.id, driveId: drive.id };
}

async function ensureFolder(
  _accessToken: string,
  driveId: string,
  parentPath: string,
  folderName: string,
): Promise<{ itemId: string; webUrl: string }> {
  // Delegate to shared module (token is managed internally)
  return sharedEnsureFolder(driveId, parentPath, folderName);
}

/**
 * Copy a single file from a source drive item to a destination folder.
 * Uses Graph's async copy API.
 */
async function copyFileToFolder(
  accessToken: string,
  sourceDriveId: string,
  sourceItemId: string,
  destDriveId: string,
  destFolderItemId: string,
  fileName: string,
): Promise<boolean> {
  const copyUrl = `${GRAPH_BASE}/drives/${sourceDriveId}/items/${sourceItemId}/copy`;
  const resp = await fetch(copyUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parentReference: {
        driveId: destDriveId,
        id: destFolderItemId,
      },
      name: fileName,
    }),
  });

  if (resp.status === 202 || resp.ok) {
    // 202 = async copy started, 200 = completed immediately
    try { await resp.text(); } catch { /* ignore */ }
    return true;
  }

  const errText = await resp.text();
  console.error(`[provision-sp] Copy failed for ${fileName}:`, resp.status, errText);
  return false;
}

/**
 * List children of a folder to get items to copy.
 */
async function listFolderChildren(
  accessToken: string,
  driveId: string,
  itemId: string,
): Promise<Array<{ id: string; name: string; isFolder: boolean }>> {
  const url = `${GRAPH_BASE}/drives/${driveId}/items/${itemId}/children?$select=id,name,folder,file`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    await resp.text();
    return [];
  }
  const data = await resp.json();
  return (data.value || []).map((item: { id: string; name: string; folder?: unknown }) => ({
    id: item.id,
    name: item.name,
    isFolder: !!item.folder,
  }));
}

// ── Seed Logic ──

interface SeedRule {
  source_shared_id: string;
  target_subfolder: string;
  mode: "link" | "copy";
}

interface SharedSource {
  id: string;
  label: string;
  site_id: string | null;
  drive_id: string | null;
  item_id: string | null;
  web_url: string;
  content_mode: string;
}

async function applySeedRules(
  supabaseAdmin: ReturnType<typeof createClient>,
  accessToken: string,
  tenantId: number,
  driveId: string,
  tenantFolderItemId: string,
  tenantFolderPath: string,
  seedRules: SeedRule[],
  callerUserId: string | null,
): Promise<{ linksCreated: number; filesCopied: number; errors: string[] }> {
  const result = { linksCreated: 0, filesCopied: 0, errors: [] as string[] };

  if (!seedRules || seedRules.length === 0) return result;

  // Load shared sources
  const sourceIds = seedRules.map((r) => r.source_shared_id);
  const { data: sources } = await supabaseAdmin
    .from("sharepoint_shared_sources")
    .select("*")
    .in("id", sourceIds)
    .eq("active", true);

  const sourceMap = new Map<string, SharedSource>();
  (sources || []).forEach((s: SharedSource) => sourceMap.set(s.id, s));

  for (const rule of seedRules) {
    const source = sourceMap.get(rule.source_shared_id);
    if (!source) {
      result.errors.push(`Source ${rule.source_shared_id} not found or inactive`);
      continue;
    }

    const effectiveMode = rule.mode || source.content_mode || "link";

    if (effectiveMode === "link") {
      // Create a reference link row
      // Check if already exists
      const { data: existing } = await supabaseAdmin
        .from("tenant_sharepoint_reference_links")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("source_shared_id", source.id)
        .maybeSingle();

      if (!existing) {
        await supabaseAdmin.from("tenant_sharepoint_reference_links").insert({
          tenant_id: tenantId,
          label: source.label,
          web_url: source.web_url,
          source_shared_id: source.id,
          visibility: "client",
          sort_order: result.linksCreated,
        });
        result.linksCreated++;
      }
    } else if (effectiveMode === "copy") {
      // Copy files from source folder into target subfolder
      if (!source.drive_id || !source.item_id) {
        result.errors.push(`Source "${source.label}" missing drive_id or item_id for copy`);
        continue;
      }

      // Ensure target subfolder exists
      const targetSubfolder = rule.target_subfolder || "00-Shared from Vivacity";
      let targetFolderItemId: string;
      try {
        const subPath = `${tenantFolderPath}`;
        const sub = await ensureFolder(accessToken, driveId, subPath, targetSubfolder);
        targetFolderItemId = sub.itemId;
      } catch (e) {
        result.errors.push(`Failed to create target subfolder "${targetSubfolder}": ${e}`);
        continue;
      }

      // List source children and copy each file
      const children = await listFolderChildren(accessToken, source.drive_id, source.item_id);
      for (const child of children) {
        if (child.isFolder) continue; // Only copy files, not nested folders
        const success = await copyFileToFolder(
          accessToken,
          source.drive_id,
          child.id,
          driveId,
          targetFolderItemId,
          child.name,
        );
        if (success) {
          result.filesCopied++;
        } else {
          result.errors.push(`Failed to copy file "${child.name}"`);
        }
      }

      // Also create a reference link for tracking
      const { data: existingLink } = await supabaseAdmin
        .from("tenant_sharepoint_reference_links")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("source_shared_id", source.id)
        .maybeSingle();

      if (!existingLink) {
        await supabaseAdmin.from("tenant_sharepoint_reference_links").insert({
          tenant_id: tenantId,
          label: `${source.label} (copied)`,
          web_url: source.web_url,
          source_shared_id: source.id,
          visibility: "internal",
          sort_order: result.linksCreated,
        });
      }
    }
  }

  return result;
}

// ── Main Handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let tenantIdForError: number | null = null;

  try {
    const body = await req.json();
    const { tenant_id } = body as { tenant_id: number };
    tenantIdForError = tenant_id;

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Auth — optional
    let callerUserId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(
        authHeader.replace("Bearer ", ""),
      );
      if (user) {
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
      .select("id, name, slug, legal_name, rto_id, status")
      .eq("id", tenant_id)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ success: false, error: `Tenant ${tenant_id} not found` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Active tenant guard
    if (tenant.status !== 'active') {
      return new Response(
        JSON.stringify({ success: false, error: `Tenant is not active (status: ${tenant.status}). Folder provisioning is only allowed for active tenants.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
    await ensureFolder(accessToken, driveId, "/", SP_BASE_PATH.replace(/^\//, ""));

    // Build folder name
    const folderName = buildClientFolderName(tenant.rto_id, tenant.legal_name, tenant.name);
    const folderPath = `${SP_BASE_PATH}/${folderName}`;

    console.log("[provision-sp] Creating folder:", { folderName, folderPath, siteId, driveId });

    // Create tenant root folder
    const { itemId, webUrl } = await ensureFolder(accessToken, driveId, SP_BASE_PATH, folderName);
    console.log("[provision-sp] Folder created:", { itemId, webUrl });

    // ── Load active template ──
    const { data: template } = await supabaseAdmin
      .from("sharepoint_folder_templates")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let subfoldersCreated = 0;
    const subfolders: string[] = template?.base_subfolders as string[] || [];

    // ── Create subfolders ──
    for (const subName of subfolders) {
      try {
        await ensureFolder(accessToken, driveId, folderPath, subName);
        subfoldersCreated++;
        console.log("[provision-sp] Subfolder created:", subName);
      } catch (e) {
        console.error("[provision-sp] Subfolder error:", subName, e);
      }
    }

    // ── Apply seed rules ──
    let seedResult = { linksCreated: 0, filesCopied: 0, errors: [] as string[] };
    const seedRules = (template?.seed_rules as SeedRule[]) || [];

    // Check if seed has already run (idempotency)
    const templateVersion = template?.id ? `${template.id}` : "v1";
    const { data: existingSeedRun } = await supabaseAdmin
      .from("tenant_sharepoint_seed_runs")
      .select("id, status")
      .eq("tenant_id", tenant_id)
      .eq("template_version", templateVersion)
      .maybeSingle();

    if (!existingSeedRun || existingSeedRun.status === "failed") {
      if (seedRules.length > 0) {
        // Create/update seed run record
        if (existingSeedRun) {
          await supabaseAdmin
            .from("tenant_sharepoint_seed_runs")
            .update({ status: "running", started_at: new Date().toISOString() })
            .eq("id", existingSeedRun.id);
        } else {
          await supabaseAdmin.from("tenant_sharepoint_seed_runs").insert({
            tenant_id: tenant_id,
            template_id: template?.id || null,
            template_version: templateVersion,
            status: "running",
            created_by: callerUserId,
          });
        }

        seedResult = await applySeedRules(
          supabaseAdmin,
          accessToken,
          tenant_id,
          driveId,
          itemId,
          folderPath,
          seedRules,
          callerUserId,
        );

        // Update seed run
        await supabaseAdmin
          .from("tenant_sharepoint_seed_runs")
          .update({
            status: seedResult.errors.length > 0 ? "failed" : "success",
            subfolders_created: subfoldersCreated,
            files_copied: seedResult.filesCopied,
            links_created: seedResult.linksCreated,
            errors: seedResult.errors,
            completed_at: new Date().toISOString(),
          })
          .eq("tenant_id", tenant_id)
          .eq("template_version", templateVersion);
      }
    }

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
      last_validated_at: new Date().toISOString(),
      provisioning_status: "success",
      provisioning_error: null,
      template_id: template?.id || null,
    });

    // Emit timeline events
    await emitTimelineEvent(supabaseAdmin, {
      tenant_id,
      client_id: String(tenant_id),
      event_type: "sharepoint_root_configured",
      title: `SharePoint folder provisioned: ${folderName}`,
      source: "microsoft",
      visibility: "internal",
      entity_type: "tenant_sharepoint_settings",
      metadata: {
        folder_name: folderName,
        folder_path: folderPath,
        subfolders_created: subfoldersCreated,
        seed_links: seedResult.linksCreated,
        seed_copies: seedResult.filesCopied,
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
        web_url: webUrl,
        subfolders_created: subfoldersCreated,
        seed_links: seedResult.linksCreated,
        seed_copies: seedResult.filesCopied,
        seed_errors: seedResult.errors,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        folder_name: folderName,
        folder_path: folderPath,
        web_url: webUrl,
        item_id: itemId,
        subfolders_created: subfoldersCreated,
        seed_links: seedResult.linksCreated,
        seed_copies: seedResult.filesCopied,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[provision-sp] Error:", error);

    if (tenantIdForError) {
      try {
        await upsertSettings(supabaseAdmin, tenantIdForError, null, {
          provisioning_status: "failed",
          provisioning_error: error instanceof Error ? error.message : "Unknown error",
        });

        await emitTimelineEvent(supabaseAdmin, {
          tenant_id: tenantIdForError,
          client_id: String(tenantIdForError),
          event_type: "sharepoint_root_invalid",
          title: "SharePoint folder provisioning failed",
          source: "microsoft",
          visibility: "internal",
          entity_type: "tenant_sharepoint_settings",
          metadata: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
          dedupe_key: `sp_provision_fail:${tenantIdForError}:${new Date().toISOString().split("T")[0]}`,
        });
      } catch {
        // Best effort
      }
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

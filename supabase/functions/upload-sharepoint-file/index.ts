import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getAppToken,
  graphUploadSmall,
  graphUploadSession,
  type DriveItem,
} from "../_shared/graph-app-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SIMPLE_UPLOAD_LIMIT = 4_194_304; // 4 MB
const MAX_UPLOAD_SIZE = 52_428_800; // 50 MB

/**
 * Walk parentReference chain upward to verify item is within the root subtree.
 * Mirrors browse-sharepoint-folder/verifyWithinRoot.
 */
async function verifyWithinRoot(
  accessToken: string,
  driveId: string,
  itemId: string,
  rootItemId: string,
): Promise<boolean> {
  let currentId = itemId;
  const maxDepth = 20;

  for (let i = 0; i < maxDepth; i++) {
    if (currentId === rootItemId) return true;

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${currentId}?$select=id,parentReference`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) {
      await res.text();
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

function sanitiseFileName(name: string): string {
  const cleaned = name.replace(/[\\/]/g, "_").trim();
  return cleaned || `upload-${Date.now()}`;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(401, { error: "Unauthorized" });

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) return jsonResponse(401, { error: "Unauthorized" });

    // Parse multipart body
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (e) {
      console.error("[upload-sp] Failed to parse form data:", e);
      return jsonResponse(400, { error: "Invalid multipart/form-data body" });
    }

    const file = formData.get("file");
    const tenantIdRaw = formData.get("tenant_id");
    const parentFolderIdRaw = formData.get("parent_folder_id");
    const useSharedFolderRaw = formData.get("use_shared_folder");

    if (!(file instanceof File) || file.size === 0) {
      return jsonResponse(400, { error: "Missing or empty 'file' field" });
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      return jsonResponse(400, { error: "File too large. Maximum 50 MB." });
    }

    // Resolve tenant (SuperAdmins may override)
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("tenant_id, unicorn_role, global_role")
      .eq("user_uuid", user.id)
      .single();

    const isSuperAdmin =
      userData?.global_role === "SuperAdmin" ||
      userData?.unicorn_role === "Super Admin";

    const requestedTenantId = tenantIdRaw ? Number(tenantIdRaw) : undefined;
    let tenantId: number | undefined;
    if (isSuperAdmin && requestedTenantId) {
      tenantId = requestedTenantId;
    } else if (userData?.tenant_id) {
      tenantId = userData.tenant_id as number;
      if (requestedTenantId && requestedTenantId !== tenantId) {
        console.warn(
          `[upload-sp] Non-SuperAdmin attempted tenant override: ${requestedTenantId}`,
        );
      }
    }

    if (!tenantId) {
      return jsonResponse(400, { error: "No tenant found for user" });
    }

    // SharePoint settings
    const { data: settings } = await supabaseAdmin
      .from("tenant_sharepoint_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (!settings || !settings.is_enabled || settings.validation_status !== "valid") {
      return jsonResponse(400, {
        error: "SharePoint folder not configured or disabled for this tenant",
      });
    }

    const drive_id: string = settings.drive_id;
    const root_item_id: string | null = settings.root_item_id ?? null;
    const shared_folder_item_id: string | null = settings.shared_folder_item_id ?? null;

    const useSharedRoot =
      useSharedFolderRaw === "true" && !!shared_folder_item_id;
    const effectiveRootId: string | null = useSharedRoot
      ? shared_folder_item_id
      : root_item_id;

    const explicitParent =
      typeof parentFolderIdRaw === "string" ? parentFolderIdRaw.trim() : "";
    const parentFolderId = explicitParent || effectiveRootId;

    if (!parentFolderId || !effectiveRootId) {
      return jsonResponse(400, {
        error: "No upload destination configured for this tenant",
      });
    }

    // App-level token (write via Sites.Selected)
    let accessToken: string;
    try {
      accessToken = await getAppToken();
    } catch (e) {
      console.error("[upload-sp] App token fetch failed:", e);
      return jsonResponse(500, { error: "Failed to acquire SharePoint token" });
    }

    // Boundary enforcement
    if (explicitParent && explicitParent !== effectiveRootId) {
      const ok = await verifyWithinRoot(
        accessToken,
        drive_id,
        explicitParent,
        effectiveRootId,
      );
      if (!ok) {
        console.warn(
          `[upload-sp] Boundary breach attempt: tenant=${tenantId} item=${explicitParent} root=${effectiveRootId}`,
        );
        return jsonResponse(403, {
          error: "Target folder is outside the permitted tenant root",
        });
      }
    }

    // Upload
    const fileName = sanitiseFileName(file.name);
    const buffer = await file.arrayBuffer();

    let uploaded: DriveItem;
    try {
      if (file.size < SIMPLE_UPLOAD_LIMIT) {
        uploaded = await graphUploadSmall(drive_id, parentFolderId, fileName, buffer);
      } else {
        uploaded = await graphUploadSession(
          drive_id,
          parentFolderId,
          fileName,
          new Uint8Array(buffer),
        );
      }
    } catch (e) {
      console.error("[upload-sp] Graph upload failed:", e);
      const msg = e instanceof Error ? e.message : "Upload failed";
      return jsonResponse(502, { error: `SharePoint upload failed: ${msg}` });
    }

    // Audit (non-fatal)
    try {
      const { error: auditError } = await supabaseAdmin
        .from("sharepoint_access_log")
        .insert({
          user_id: user.id,
          tenant_id: tenantId,
          action: "upload",
          drive_id,
          item_id: uploaded.id,
          file_name: fileName,
        });
      if (auditError) {
        console.error("[upload-sp] Audit insert failed:", auditError);
      }
    } catch (e) {
      console.error("[upload-sp] Audit insert threw:", e);
    }

    return jsonResponse(200, {
      success: true,
      item_id: uploaded.id,
      file_name: fileName,
      web_url: uploaded.webUrl,
    });
  } catch (e) {
    console.error("[upload-sp] Unhandled error:", e);
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return jsonResponse(500, { error: msg });
  }
});

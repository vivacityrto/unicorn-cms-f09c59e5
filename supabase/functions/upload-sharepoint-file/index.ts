import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getAppToken,
  graphUploadSmall,
  graphUploadSession,
  type DriveItem,
} from "../_shared/graph-app-client.ts";
import { requireCaller, FeatureKeys, checkPermission } from "../_shared/requireCaller.ts";
import { corsHeaders } from "../_shared/cors.ts";


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

/**
 * Find or create the "- Uploads" subfolder directly under the given root item.
 * Throws on any Graph error; caller maps to a 502 response.
 */
async function findOrCreateUploadsFolder(
  accessToken: string,
  driveId: string,
  rootItemId: string,
): Promise<string> {
  const FOLDER_NAME = "- Uploads";
  const filter = encodeURIComponent(`name eq '${FOLDER_NAME}'`);
  const findRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${rootItemId}/children?$select=id,name,folder&$filter=${filter}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!findRes.ok) {
    const text = await findRes.text();
    throw new Error(`Graph find failed (${findRes.status}): ${text}`);
  }

  const findJson = await findRes.json();
  const existing = Array.isArray(findJson.value)
    ? findJson.value.find((it: any) => it?.folder)
    : null;
  if (existing?.id) return existing.id as string;

  const createRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${rootItemId}/children`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: FOLDER_NAME,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    },
  );

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Graph create failed (${createRes.status}): ${text}`);
  }

  const created = await createRes.json();
  if (!created?.id) throw new Error("Graph create returned no id");
  return created.id as string;
}

function jsonResponse(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
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

    // Parse multipart body
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (e) {
      console.error("[upload-sp] Failed to parse form data:", e);
      return jsonResponse(req, 400, { error: "Invalid multipart/form-data body" });
    }

    const file = formData.get("file");
    const tenantIdRaw = formData.get("tenant_id");
    const parentFolderIdRaw = formData.get("parent_folder_id");
    const useSharedFolderRaw = formData.get("use_shared_folder");

    if (!(file instanceof File) || file.size === 0) {
      return jsonResponse(req, 400, { error: "Missing or empty 'file' field" });
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      return jsonResponse(req, 400, { error: "File too large. Maximum 50 MB." });
    }

    // Resolve tenant (SuperAdmins may override)
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("tenant_id")
      .eq("user_uuid", user.id)
      .single();

    const isSuperAdmin = await checkPermission(
      supabaseAdmin,
      user.id,
      FeatureKeys.adminSystemConfig,
    );

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
      return jsonResponse(req, 400, { error: "No tenant found for user" });
    }

    // SharePoint settings
    const { data: settings } = await supabaseAdmin
      .from("tenant_sharepoint_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (!settings || !settings.is_enabled || settings.validation_status !== "valid") {
      return jsonResponse(req, 400, {
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
    let parentFolderId = explicitParent || effectiveRootId;

    if (!parentFolderId || !effectiveRootId) {
      return jsonResponse(req, 400, {
        error: "No upload destination configured for this tenant",
      });
    }

    // App-level token (write via Sites.Selected)
    let accessToken: string;
    try {
      accessToken = await getAppToken();
    } catch (e) {
      console.error("[upload-sp] App token fetch failed:", e);
      return jsonResponse(req, 500, { error: "Failed to acquire SharePoint token" });
    }

    // Shared-root uploads always land in the "- Uploads" subfolder
    if (useSharedRoot) {
      try {
        parentFolderId = await findOrCreateUploadsFolder(
          accessToken,
          drive_id,
          effectiveRootId,
        );
      } catch (e) {
        console.error("[upload-sp] Uploads folder resolve failed:", e);
        return jsonResponse(req, 502, { error: "Failed to resolve uploads folder" });
      }
    }

    // Boundary enforcement (skip when shared root — uploads folder is by construction inside it)
    if (!useSharedRoot && explicitParent && explicitParent !== effectiveRootId) {
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
        return jsonResponse(req, 403, {
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
      return jsonResponse(req, 502, { error: `SharePoint upload failed: ${msg}` });
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

    return jsonResponse(req, 200, {
      success: true,
      item_id: uploaded.id,
      file_name: fileName,
      web_url: uploaded.webUrl,
    });
  } catch (e) {
    console.error("[upload-sp] Unhandled error:", e);
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return jsonResponse(req, 500, { error: msg });
  }
});

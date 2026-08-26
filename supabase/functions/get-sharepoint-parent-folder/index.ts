import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";
import { graphGet, resolveDriveItemFromSharingUrl } from "../_shared/graph-app-client.ts";
import { hasTenantAccessSafe } from "../_shared/auth-helpers.ts";

const BodySchema = z.object({
  file_url: z.string().url(),
  tenant_id: z.number().int().positive(),
});

/** Sharing links must point at a SharePoint/OneDrive-for-business host, never an arbitrary URL. */
function isAllowedSharePointHost(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.endsWith(".sharepoint.com");
  } catch {
    return false;
  }
}

function json(req: Request, body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(req, { error: "Unauthorized" }, 401);
  }
  const token = authHeader.replace("Bearer ", "");

  // Parse body
  let payload: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return json(req, { error: "Invalid request body", details: parsed.error.flatten().fieldErrors }, 400);
    }
    payload = parsed.data;
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }

  const { file_url, tenant_id } = payload;

  if (!isAllowedSharePointHost(file_url)) {
    return json(req, { error: "file_url must be a sharepoint.com URL" }, 400);
  }

  // Service-role client: validates the caller's JWT, checks tenant
  // membership, and reads the tenant's configured SharePoint drive so the
  // resolved item can be bound back to the requesting tenant below.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) {
    return json(req, { error: "Unauthorized" }, 401);
  }

  const tenantAccess = await hasTenantAccessSafe(admin, user.id, tenant_id);
  if (tenantAccess.lookupFailed) {
    return json(req, { error: "Failed to verify tenant access" }, 500);
  }
  if (!tenantAccess.allowed) {
    return json(req, { error: "Forbidden: no access to this tenant" }, 403);
  }

  const { data: spSettings, error: spSettingsError } = await admin
    .from("tenant_sharepoint_settings")
    .select("drive_id")
    .eq("tenant_id", tenant_id)
    .maybeSingle();
  if (spSettingsError || !spSettings?.drive_id) {
    return json(req, { error: "SharePoint is not configured for this tenant" }, 400);
  }

  // Resolve sharing URL → driveId/itemId
  let resolved: { driveId: string; itemId: string };
  try {
    resolved = await resolveDriveItemFromSharingUrl(file_url);
  } catch (err) {
    console.warn("[get-sharepoint-parent-folder] resolve failed:", err);
    return json(req,
      { error: "Unable to resolve SharePoint file. URL may be invalid or the app lacks access." },
      422,
    );
  }

  // Bind the resolved item back to the requesting tenant's own SharePoint
  // drive — without this, any authenticated user could pass an arbitrary
  // sharing URL from a different tenant (or a different SharePoint site
  // entirely) and get parent-folder metadata back via the app's Graph
  // credentials, regardless of which tenant that file actually belongs to.
  if (resolved.driveId !== spSettings.drive_id) {
    return json(req, { error: "File does not belong to the requested tenant's SharePoint site" }, 403);
  }

  // Step 1: fetch the item to get its parentReference.id
  // (`/items/{id}/parent` is not a valid Graph v1.0 navigation property on DriveItem.)
  const itemResp = await graphGet<{ parentReference?: { id?: string } }>(
    `/drives/${resolved.driveId}/items/${resolved.itemId}?$select=parentReference`,
  );
  if (!itemResp.ok) {
    console.warn("[get-sharepoint-parent-folder] item fetch failed:", itemResp.status);
    return json(req, 
      { error: `Failed to fetch drive item (Graph ${itemResp.status})` },
      itemResp.status >= 400 && itemResp.status < 600 ? itemResp.status : 502,
    );
  }
  const parentId = itemResp.data?.parentReference?.id;
  if (!parentId) {
    return json(req, { error: "Drive item has no parent reference" }, 502);
  }

  // Step 2: fetch the parent folder's details
  const parentResp = await graphGet<{ id?: string; name?: string; webUrl?: string }>(
    `/drives/${resolved.driveId}/items/${parentId}?$select=id,name,webUrl`,
  );

  if (!parentResp.ok) {
    console.warn("[get-sharepoint-parent-folder] parent fetch failed:", parentResp.status);
    return json(req, 
      { error: `Failed to fetch parent folder (Graph ${parentResp.status})` },
      parentResp.status >= 400 && parentResp.status < 600 ? parentResp.status : 502,
    );
  }

  const folderUrl = parentResp.data?.webUrl;
  if (!folderUrl) {
    return json(req, { error: "Parent folder has no webUrl" }, 502);
  }

  return json(req, { folder_url: folderUrl }, 200);
});

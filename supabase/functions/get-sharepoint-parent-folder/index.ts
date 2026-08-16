import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";
import { graphGet, resolveDriveItemFromSharingUrl } from "../_shared/graph-app-client.ts";

const BodySchema = z.object({
  file_url: z.string().url(),
  tenant_id: z.number().int().positive().optional(),
});

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

  const { file_url } = payload;

  // Minimal client solely to validate the caller's JWT via auth.getUser.
  // No DB queries are made; tenant isolation is enforced by the upstream RLS
  // that gates which file_url values the caller can ever obtain.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return json(req, { error: "Unauthorized" }, 401);
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

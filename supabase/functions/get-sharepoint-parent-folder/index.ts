import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/cors.ts";
import { graphGet, resolveDriveItemFromSharingUrl } from "../_shared/graph-app-client.ts";

const BodySchema = z.object({
  file_url: z.string().url(),
  tenant_id: z.number().int().positive(),
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.replace("Bearer ", "");

  // Parse body
  let payload: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: "Invalid request body", details: parsed.error.flatten().fieldErrors }, 400);
    }
    payload = parsed.data;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { file_url, tenant_id } = payload;

  // Service-role client; tenant isolation enforced by explicit tenant_id filter below
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }


  // Tenant gate via RLS: caller can only read their own tenant's row
  const { data: spRow, error: spErr } = await supabase
    .from("tenant_sharepoint_settings")
    .select("tenant_id")
    .eq("tenant_id", tenant_id)
    .maybeSingle();

  if (spErr) {
    console.error("[get-sharepoint-parent-folder] tenant_sharepoint_settings error:", spErr);
    return json({ error: "Failed to verify tenant SharePoint configuration" }, 500);
  }
  if (!spRow) {
    return json({ error: "SharePoint not configured for this tenant" }, 404);
  }

  // Resolve sharing URL → driveId/itemId
  let resolved: { driveId: string; itemId: string };
  try {
    resolved = await resolveDriveItemFromSharingUrl(file_url);
  } catch (err) {
    console.warn("[get-sharepoint-parent-folder] resolve failed:", err);
    return json(
      { error: "Unable to resolve SharePoint file. URL may be invalid or the app lacks access." },
      422,
    );
  }

  // Fetch parent folder
  const parentResp = await graphGet<{ id?: string; name?: string; webUrl?: string }>(
    `/drives/${resolved.driveId}/items/${resolved.itemId}/parent?$select=id,name,webUrl`,
  );

  if (!parentResp.ok) {
    console.warn("[get-sharepoint-parent-folder] parent fetch failed:", parentResp.status);
    return json(
      { error: `Failed to fetch parent folder (Graph ${parentResp.status})` },
      parentResp.status >= 400 && parentResp.status < 600 ? parentResp.status : 502,
    );
  }

  const folderUrl = parentResp.data?.webUrl;
  if (!folderUrl) {
    return json({ error: "Parent folder has no webUrl" }, 502);
  }

  return json({ folder_url: folderUrl }, 200);
});

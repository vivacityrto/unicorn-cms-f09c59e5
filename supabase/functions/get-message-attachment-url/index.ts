import { createClient } from "npm:@supabase/supabase-js@2";
import { requireCaller, FeatureKeys, allowTenantMember } from "../_shared/requireCaller.ts";
import { corsHeaders } from "../_shared/cors.ts";


const BUCKET = "message-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

// Broadcast attachments are uploaded once and shared by every recipient tenant,
// so they live under `broadcast/{campaign_id}/...` rather than `{tenant_id}/...`.
// The first path segment is therefore not a tenant id; access is granted when
// the caller belongs to a tenant that actually received a message carrying
// this exact storage_path.
const BROADCAST_SEGMENT = "broadcast";

async function allowBroadcastRecipient(
  svc: ReturnType<typeof createClient>,
  userId: string,
  storagePath: string,
): Promise<boolean> {
  const { data: attRows } = await svc
    .from("tenant_message_attachments")
    .select("message_id")
    .eq("storage_path", storagePath);
  const messageIds = (attRows ?? []).map((r) => r.message_id as string);
  if (messageIds.length === 0) return false;

  const { data: msgRows } = await svc
    .from("tenant_messages")
    .select("tenant_id")
    .in("id", messageIds);
  const tenantIds = [...new Set((msgRows ?? []).map((r) => r.tenant_id as number))];
  if (tenantIds.length === 0) return false;

  const { data: memberRows } = await svc
    .from("tenant_users")
    .select("id")
    .eq("user_id", userId)
    .in("tenant_id", tenantIds)
    .limit(1);
  return (memberRows ?? []).length > 0;
}

function json(req: Request, status: number, body: unknown): Response {
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
    return json(req, 405, { error: "Method not allowed" });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: { storage_path?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: "Expected JSON body" });
  }
  const storage_path = body?.storage_path;
  if (typeof storage_path !== "string" || !storage_path.trim()) {
    return json(req, 400, { error: "storage_path is required" });
  }

  const tenantSegment = storage_path.split("/")[0];
  if (!tenantSegment) {
    return json(req, 400, { error: "Invalid storage_path" });
  }

  const tenantIdNum = Number(tenantSegment);
  const caller = await requireCaller(req, admin, {
    featureKey: FeatureKeys.staffDocumentsGenerate,
    headers: corsHeaders(req),
    unauthorizedMessage: "Missing Authorization header",
    forbiddenMessage: "Not authorised to access this attachment",
    orAllow: async ({ userId, admin: svc }) => {
      if (tenantSegment === BROADCAST_SEGMENT) {
        return allowBroadcastRecipient(svc, userId, storage_path);
      }
      if (Number.isFinite(tenantIdNum)) {
        return allowTenantMember(svc, userId, tenantIdNum);
      }
      return false;
    },
  });
  if (!caller.ok) return caller.response;

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storage_path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return json(req, 500, {
      error: error?.message || "Failed to create signed URL",
    });
  }

  return json(req, 200, { signedUrl: data.signedUrl });
});

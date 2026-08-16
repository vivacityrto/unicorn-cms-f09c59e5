import { createClient } from "npm:@supabase/supabase-js@2";
import { requireCaller, FeatureKeys, allowTenantMember } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "message-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

function json(status: number, body: unknown) {
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
    return json(405, { error: "Method not allowed" });
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
    return json(400, { error: "Expected JSON body" });
  }
  const storage_path = body?.storage_path;
  if (typeof storage_path !== "string" || !storage_path.trim()) {
    return json(400, { error: "storage_path is required" });
  }

  const tenantSegment = storage_path.split("/")[0];
  if (!tenantSegment) {
    return json(400, { error: "Invalid storage_path" });
  }

  const tenantIdNum = Number(tenantSegment);
  const caller = await requireCaller(req, admin, {
    featureKey: FeatureKeys.staffDocumentsGenerate,
    headers: corsHeaders,
    unauthorizedMessage: "Missing Authorization header",
    forbiddenMessage: "Not authorised to access this attachment",
    orAllow: async ({ userId, admin: svc }) => {
      if (Number.isFinite(tenantIdNum)) {
        return allowTenantMember(svc, userId, tenantIdNum);
      }
      const { data: memberRow } = await svc
        .from("tenant_users")
        .select("user_id")
        .eq("user_id", userId)
        .eq("tenant_id", tenantSegment)
        .maybeSingle();
      return !!memberRow;
    },
  });
  if (!caller.ok) return caller.response;

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storage_path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return json(500, {
      error: error?.message || "Failed to create signed URL",
    });
  }

  return json(200, { signedUrl: data.signedUrl });
});

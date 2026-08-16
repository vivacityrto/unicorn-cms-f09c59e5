import { createClient } from "npm:@supabase/supabase-js@2";
import { requireCaller, FeatureKeys, allowTenantMember } from "../_shared/requireCaller.ts";
import { corsHeaders } from "../_shared/cors.ts";


const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const BUCKET = "message-attachments";

function sanitiseFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, "");
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");
  const trimmed = cleaned.replace(/^_+|_+$/g, "");
  const finalName = trimmed.length ? trimmed : `file_${Date.now()}`;
  return finalName.length > 150 ? finalName.slice(-150) : finalName;
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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(req, 400, { error: "Expected multipart/form-data" });
  }

  const file = form.get("file");
  const tenant_id = String(form.get("tenant_id") ?? "");
  const conversation_id = String(form.get("conversation_id") ?? "");
  const message_id = String(form.get("message_id") ?? "");

  if (!(file instanceof File)) return json(req, 400, { error: "file is required" });
  if (!tenant_id) return json(req, 400, { error: "tenant_id is required" });
  if (!conversation_id) return json(req, 400, { error: "conversation_id is required" });
  if (!message_id) return json(req, 400, { error: "message_id is required" });

  if (file.size > MAX_BYTES) {
    return json(req, 400, { error: `"${file.name}" exceeds 10 MB limit.` });
  }
  if (!file.type || !ALLOWED_MIME.has(file.type)) {
    return json(req, 400, {
      error: `"${file.name}" is not an allowed file type.`,
    });
  }

  const tenantIdNum = Number(tenant_id);
  const caller = await requireCaller(req, admin, {
    featureKey: FeatureKeys.staffDocumentsGenerate,
    headers: corsHeaders(req),
    unauthorizedMessage: "Missing Authorization header",
    forbiddenMessage: "Not authorised to upload for this tenant",
    orAllow: async ({ userId, admin: svc }) => {
      if (Number.isFinite(tenantIdNum)) {
        return allowTenantMember(svc, userId, tenantIdNum);
      }
      const { data: memberRow } = await svc
        .from("tenant_users")
        .select("user_id")
        .eq("user_id", userId)
        .eq("tenant_id", tenant_id)
        .maybeSingle();
      return !!memberRow;
    },
  });
  if (!caller.ok) return caller.response;

  const safeName = sanitiseFilename(file.name);
  const storage_path = `${tenant_id}/${conversation_id}/${message_id}/${safeName}`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storage_path, file, { contentType: file.type, upsert: false });
  if (upErr) {
    return json(req, 500, { error: `Storage upload failed: ${upErr.message}` });
  }

  const { data: row, error: insErr } = await admin
    .from("tenant_message_attachments")
    .insert({
      message_id,
      storage_path,
      filename: file.name,
      mime_type: file.type,
      file_size: file.size,
    })
    .select("*")
    .single();

  if (insErr) {
    await admin.storage.from(BUCKET).remove([storage_path]).catch(() => {});
    return json(req, 500, { error: `DB insert failed: ${insErr.message}` });
  }

  return json(req, 200, {
    id: row?.id,
    created_at: row?.created_at,
    message_id,
    storage_path,
    filename: file.name,
    mime_type: file.type,
    file_size: file.size,
  });
});

import { createClient } from "npm:@supabase/supabase-js@2";
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

function json(req: Request, status: number, body: unknown) {
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

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(req, 401, { error: "Missing Authorization header" });
  }
  const token = authHeader.slice(7).trim();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData?.user) {
    return json(req, 401, { error: "Invalid auth token" });
  }
  const uid = userData.user.id;

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

  // Authorisation: Vivacity internal staff OR tenant member
  const { data: staffRow } = await admin
    .from("users")
    .select("is_vivacity_internal, archived, disabled")
    .eq("user_uuid", uid)
    .maybeSingle();

  const isStaff = !!staffRow
    && staffRow.is_vivacity_internal === true
    && staffRow.archived !== true
    && staffRow.disabled !== true;

  let authorised = isStaff;
  if (!authorised) {
    const tenantIdNum = Number(tenant_id);
    const { data: memberRow } = await admin
      .from("tenant_users")
      .select("user_id")
      .eq("user_id", uid)
      .eq("tenant_id", Number.isFinite(tenantIdNum) ? tenantIdNum : tenant_id)
      .maybeSingle();
    authorised = !!memberRow;
  }
  if (!authorised) {
    return json(req, 403, { error: "Not authorised to upload for this tenant" });
  }

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

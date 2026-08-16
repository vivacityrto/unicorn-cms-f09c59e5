import { createClient } from "npm:@supabase/supabase-js@2";
import { requireCaller, FeatureKeys, allowTenantMember } from "../_shared/requireCaller.ts";
import { corsHeaders } from "../_shared/cors.ts";


const MAX_BYTES = 50 * 1024 * 1024;
const BUCKET = "portal-documents";
const STAFF_ONLY_DIRECTIONS = new Set(["vivacity_to_client", "internal"]);
const ALLOWED_DIRECTIONS = new Set([
  "vivacity_to_client",
  "internal",
  "client_to_vivacity",
]);

function sanitiseFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, "");
  const normalised = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/_+/g, "_")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  const finalName = normalised.length ? normalised : `file_${Date.now()}`;
  return finalName.length > 150 ? finalName.slice(-150) : finalName;
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function optionalString(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function optionalNumber(form: FormData, key: string): number | null {
  const s = optionalString(form, key);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { error: "Method not allowed" });
  }

  try {
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
    if (!(file instanceof File)) {
      return json(req, 400, { error: "file is required" });
    }

    const tenantIdNum = optionalNumber(form, "tenant_id");
    if (tenantIdNum === null) {
      return json(req, 400, { error: "tenant_id is required" });
    }

    const direction = optionalString(form, "direction");
    if (!direction || !ALLOWED_DIRECTIONS.has(direction)) {
      return json(req, 400, { error: "direction is required and must be valid" });
    }

    const isClientVisible =
      (optionalString(form, "is_client_visible") ?? "false").toLowerCase() ===
        "true";

    const categoryId = optionalString(form, "category_id");

    let tags: string[] | null = null;
    const tagsRaw = optionalString(form, "tags");
    if (tagsRaw) {
      try {
        const parsed = JSON.parse(tagsRaw);
        if (Array.isArray(parsed)) {
          tags = parsed.map((t) => String(t));
        }
      } catch {
        return json(req, 400, { error: "tags must be a JSON string array" });
      }
    }

    const linkedPackageId = optionalNumber(form, "linked_package_id");
    const linkedStageId = optionalNumber(form, "linked_stage_id");
    const linkedTaskId = optionalString(form, "linked_task_id");
    const evidenceRequestItemId = optionalString(
      form,
      "evidence_request_item_id",
    );

    if (file.size > MAX_BYTES) {
      return json(req, 413, { error: `"${file.name}" exceeds 50 MB limit.` });
    }

    const caller = await requireCaller(req, admin, {
      featureKey: FeatureKeys.staffDocumentsGenerate,
      headers: corsHeaders(req),
      unauthorizedMessage: "Missing Authorization header",
      forbiddenMessage: STAFF_ONLY_DIRECTIONS.has(direction)
        ? "Only Vivacity staff can upload documents in this direction"
        : "Not authorised to upload for this tenant",
      orAllow: async ({ userId, admin: svc }) => {
        if (STAFF_ONLY_DIRECTIONS.has(direction)) return false;
        return allowTenantMember(svc, userId, tenantIdNum);
      },
    });
    if (!caller.ok) return caller.response;
    const uid = caller.user.id;

    const safeName = sanitiseFilename(file.name);
    const storage_path =
      `${tenantIdNum}/${direction}/${Date.now()}_${safeName}`;

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(storage_path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) {
      return json(req, 500, { error: `Storage upload failed: ${upErr.message}` });
    }

    const { data: inserted, error: insErr } = await admin
      .from("portal_documents")
      .insert({
        tenant_id: tenantIdNum,
        storage_path,
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size,
        direction,
        is_client_visible: isClientVisible,
        status: isClientVisible ? "shared" : "draft",
        source: "manual_upload",
        uploaded_by: uid,
        category_id: categoryId,
        tags,
        linked_package_id: linkedPackageId,
        linked_stage_id: linkedStageId,
        linked_task_id: linkedTaskId,
        evidence_request_item_id: evidenceRequestItemId,
      })
      .select()
      .single();

    if (insErr || !inserted) {
      await admin.storage.from(BUCKET).remove([storage_path]).catch(() => {});
      return json(req, 500, {
        error: `DB insert failed: ${insErr?.message ?? "unknown error"}`,
      });
    }

    // Best-effort audit insert — never fail the request
    const { error: auditErr } = await admin
      .from("portal_document_audit")
      .insert({
        tenant_id: tenantIdNum,
        document_id: inserted.id,
        document_type: "portal_document",
        action: "uploaded",
        actor_user_id: uid,
        actor_role: null,
        reason: null,
        metadata: {},
      });
    if (auditErr) {
      console.error("portal_document_audit insert failed", auditErr);
    }

    return json(req, 200, inserted);
  } catch (e) {
    console.error("upload-portal-document unexpected error", e);
    return json(req, 500, {
      error: e instanceof Error ? e.message : "Unexpected error",
    });
  }
});

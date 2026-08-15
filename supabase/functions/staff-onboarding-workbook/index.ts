import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { corsHeaders } from "../_shared/cors.ts";

const BUCKET = "internal-onboarding";
const MAX_BYTES = 25 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonErr(req, 401, "UNAUTHORIZED", "No authorization header");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return jsonErr(req, 401, "UNAUTHORIZED", "Invalid token");
    }

    // Match storage RLS: admin.team_users.manage (full) — HR/Admin only.
    const { data: allowed } = await supabase.rpc("check_permission", {
      p_user_id: user.id,
      p_feature_key: "admin.team_users.manage",
      p_min_level: "full",
    });
    if (!allowed) return jsonErr(req, 403, "FORBIDDEN", "HR/Admin only");

    const contentType = req.headers.get("content-type") ?? "";
    const body = contentType.includes("multipart/form-data")
      ? await readFormBody(req)
      : await readJsonBody(req);

    const action = body.action;
    const runId = Number(body.runId);

    if (!action) return jsonErr(req, 400, "MISSING_ACTION", "Action is required");
    if (!Number.isInteger(runId) || runId <= 0) return jsonErr(req, 400, "INVALID_RUN", "Valid run id is required");

    const { data: run, error: runError } = await supabase
      .from("staff_provisioning_runs")
      .select("id, workbook_file_path")
      .eq("id", runId)
      .single();

    if (runError || !run) return jsonErr(req, 404, "RUN_NOT_FOUND", "Provisioning run not found");

    if (action === "upload") {
      await ensureBucket(supabase);

      const file = body.file;
      if (!(file instanceof File)) return jsonErr(req, 400, "MISSING_FILE", "Workbook PDF is required");
      if (file.type !== "application/pdf") return jsonErr(req, 400, "INVALID_FILE", "Workbook must be a PDF file");
      if (file.size > MAX_BYTES) return jsonErr(req, 400, "FILE_TOO_LARGE", "Workbook PDF must be 25 MB or smaller");

      const path = `workbooks/run-${runId}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: "application/pdf", upsert: false });

      if (uploadError) return jsonErr(req, 400, "UPLOAD_FAILED", uploadError.message);

      const { error: updateError } = await supabase
        .from("staff_provisioning_runs")
        .update({ workbook_file_path: path })
        .eq("id", runId);

      if (updateError) return jsonErr(req, 400, "UPDATE_FAILED", updateError.message);

      if (run.workbook_file_path && run.workbook_file_path !== path) {
        await supabase.storage.from(BUCKET).remove([run.workbook_file_path]);
      }

      return jsonOk(req, { path });
    }

    if (action === "signed-url") {
      const requestedPath = String(body.path ?? "");
      if (!requestedPath || requestedPath !== run.workbook_file_path) {
        return jsonErr(req, 403, "PATH_NOT_ALLOWED", "Workbook path is not attached to this run");
      }

      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(requestedPath, SIGNED_URL_TTL_SECONDS);

      if (error) return jsonErr(req, 400, "SIGNED_URL_FAILED", error.message);
      return jsonOk(req, { signedUrl: data.signedUrl });
    }

    if (action === "remove") {
      const requestedPath = String(body.path ?? "");
      if (!requestedPath || requestedPath !== run.workbook_file_path) {
        return jsonErr(req, 403, "PATH_NOT_ALLOWED", "Workbook path is not attached to this run");
      }

      await supabase.storage.from(BUCKET).remove([requestedPath]);
      const { error: updateError } = await supabase
        .from("staff_provisioning_runs")
        .update({ workbook_file_path: null })
        .eq("id", runId);

      if (updateError) return jsonErr(req, 400, "UPDATE_FAILED", updateError.message);
      return jsonOk(req, { removed: true });
    }

    return jsonErr(req, 400, "UNKNOWN_ACTION", "Unsupported workbook action");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("staff-onboarding-workbook failed", e);
    return jsonErr(req, 500, "UNHANDLED", message);
  }
});

async function ensureBucket(supabase: ReturnType<typeof createClient>) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  if (buckets?.some((bucket) => bucket.id === BUCKET || bucket.name === BUCKET)) return;

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: ["application/pdf"],
  });

  if (error && !error.message.toLowerCase().includes("already exists")) throw error;
}

async function readFormBody(req: Request) {
  const form = await req.formData();
  return {
    action: String(form.get("action") ?? ""),
    runId: String(form.get("runId") ?? ""),
    file: form.get("file"),
  };
}

async function readJsonBody(req: Request) {
  return await req.json() as { action?: string; runId?: number | string; path?: string };
}

function jsonOk(req: Request, body: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    headers: { "content-type": "application/json", ...corsHeaders(req) },
    status: 200,
  });
}

function jsonErr(req: Request, status: number, code: string, detail: string) {
  return new Response(JSON.stringify({ ok: false, code, detail }), {
    headers: { "content-type": "application/json", ...corsHeaders(req) },
    status,
  });
}
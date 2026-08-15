import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireCaller, FeatureKeys } from "../_shared/requireCaller.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const svc = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const caller = await requireCaller(req, svc, {
      featureKey: FeatureKeys.staffEmailSend,
      headers: corsHeaders,
      unauthorizedMessage: "Missing Authorization header",
      forbiddenMessage: "Insufficient permissions",
    });
    if (!caller.ok) return caller.response;

    const body = await req.json().catch(() => null);
    const emailId: string | undefined = body?.email_id;
    if (!emailId || typeof emailId !== "string") {
      return json(400, { error: "email_id required" });
    }

    // 1. Load attachments to purge from storage
    const { data: attachments } = await svc
      .from("email_message_attachments")
      .select("storage_path")
      .eq("email_message_id", emailId);

    const paths = (attachments || [])
      .map((a: { storage_path: string | null }) => a.storage_path)
      .filter((p): p is string => !!p);

    if (paths.length > 0) {
      const { error: storageErr } = await svc.storage
        .from("email-attachments")
        .remove(paths);
      if (storageErr) console.warn("Storage remove failed:", storageErr.message);
    }

    // 2. Delete attachment rows
    const { error: attErr } = await svc
      .from("email_message_attachments")
      .delete()
      .eq("email_message_id", emailId);
    if (attErr) return json(500, { error: `Attachment delete failed: ${attErr.message}` });

    // 3. Delete converted notes
    const { error: noteErr } = await svc
      .from("notes")
      .delete()
      .eq("source_email_id", emailId);
    if (noteErr) return json(500, { error: `Notes delete failed: ${noteErr.message}` });

    // 4. Delete the email
    const { error: emailErr } = await svc
      .from("email_messages")
      .delete()
      .eq("id", emailId);
    if (emailErr) return json(500, { error: `Email delete failed: ${emailErr.message}` });

    return json(200, { ok: true, email_id: emailId });
  } catch (err) {
    console.error("unlink-email error:", err);
    return json(500, { error: (err as Error).message || "Internal error" });
  }
});

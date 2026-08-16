/**
 * unlink-email
 *
 * Soft-unlinks a captured Outlook email (email_messages). Default path sets
 * unlinked_at / unlinked_by and leaves attachments, notes, and storage
 * objects in place. Hard delete (rows + storage) is Super Admin only and
 * requires hard_delete: true in the body.
 *
 * Auth:
 *   1. JWT via ANON-key client
 *   2. check_permission(caller.id, 'clients.emails.manage', 'full')
 *   3. Fetch the email with the same ANON+JWT client so
 *      email_messages_restrict_staff_only (and the unlinked_at SELECT
 *      filter) apply. No row → 404.
 *
 * An audit row is written to client_audit_log BEFORE the mutation so a
 * mid-way failure is still recorded.
 *
 * verify_jwt: false — gateway JWT accepts the public anon key; auth is
 * in-function.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EMAIL_MANAGE_FEATURE = "clients.emails.manage";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(req, 401, { error: "Missing Authorization header" });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(req, 401, { error: "Unauthorized" });
    const caller = userData.user;

    const { data: allowed, error: permErr } = await userClient.rpc(
      "check_permission",
      {
        p_user_id: caller.id,
        p_feature_key: EMAIL_MANAGE_FEATURE,
        p_min_level: "full",
      },
    );
    if (permErr) {
      console.error("unlink-email check_permission failed:", permErr.message);
      return json(req, 500, { error: "Permission check failed" });
    }
    if (!allowed) return json(req, 403, { error: "Insufficient permissions" });

    const body = await req.json().catch(() => null);
    const emailId: string | undefined = body?.email_id;
    const wantHardDelete = body?.hard_delete === true;
    if (!emailId || typeof emailId !== "string" || !UUID_RE.test(emailId)) {
      return json(req, 400, { error: "email_id required" });
    }

    // Ownership / tenant scoping: ANON+JWT so RLS applies
    // (email_messages_restrict_staff_only + unlinked_at IS NULL).
    const { data: email, error: emailFetchErr } = await userClient
      .from("email_messages")
      .select("id, tenant_id, subject, user_uuid, client_id, package_id, task_id")
      .eq("id", emailId)
      .maybeSingle();
    if (emailFetchErr) {
      console.error("unlink-email email fetch failed:", emailFetchErr.message);
      return json(req, 500, { error: "Failed to load email" });
    }
    if (!email) return json(req, 404, { error: "Email not found" });

    const svc = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: isSuperAdmin } = await svc.rpc("is_super_admin_safe", {
      p_user_id: caller.id,
    });
    if (wantHardDelete && !isSuperAdmin) {
      return json(req, 403, { error: "Hard delete is restricted to Super Admin" });
    }
    const mode = wantHardDelete && isSuperAdmin ? "hard_delete" : "soft_unlink";

    const { data: attachments } = await svc
      .from("email_message_attachments")
      .select("id, storage_path")
      .eq("email_message_id", emailId);
    const attachmentRows = attachments ?? [];
    const storagePaths = attachmentRows
      .map((a: { storage_path: string | null }) => a.storage_path)
      .filter((p): p is string => !!p);

    const { data: notes } = await svc
      .from("notes")
      .select("id")
      .eq("source_email_id", emailId);
    const noteIds = (notes ?? []).map((n: { id: string }) => n.id);

    const { error: logErr } = await svc.from("client_audit_log").insert({
      tenant_id: email.tenant_id,
      actor_user_id: caller.id,
      action: mode === "hard_delete" ? "email.hard_deleted" : "email.unlinked",
      entity_type: "email_messages",
      entity_id: emailId,
      details: {
        mode,
        email_id: emailId,
        tenant_id: email.tenant_id,
        subject: email.subject,
        owner_user_uuid: email.user_uuid,
        client_id: email.client_id,
        package_id: email.package_id,
        task_id: email.task_id,
        attachment_ids: attachmentRows.map((a: { id: string }) => a.id),
        storage_paths: storagePaths,
        note_ids: noteIds,
        attachments_retained: mode === "soft_unlink" ? attachmentRows.length : 0,
        notes_retained: mode === "soft_unlink" ? noteIds.length : 0,
        attachments_deleted: mode === "hard_delete" ? attachmentRows.length : 0,
        notes_deleted: mode === "hard_delete" ? noteIds.length : 0,
        timestamp: new Date().toISOString(),
      },
    });
    if (logErr) {
      console.error("unlink-email audit_log insert failed:", logErr.message);
      return json(req, 500, {
        error: "Failed to record audit log; unlink aborted",
      });
    }

    if (mode === "soft_unlink") {
      const { error: unlinkErr } = await svc
        .from("email_messages")
        .update({
          unlinked_at: new Date().toISOString(),
          unlinked_by: caller.id,
        })
        .eq("id", emailId)
        .is("unlinked_at", null);
      if (unlinkErr) {
        return json(req, 500, { error: `Unlink failed: ${unlinkErr.message}` });
      }
      return json(req, 200, { ok: true, mode, email_id: emailId });
    }

    if (storagePaths.length > 0) {
      const { error: storageErr } = await svc.storage
        .from("email-attachments")
        .remove(storagePaths);
      if (storageErr) console.warn("Storage remove failed:", storageErr.message);
    }

    const { error: attErr } = await svc
      .from("email_message_attachments")
      .delete()
      .eq("email_message_id", emailId);
    if (attErr) return json(req, 500, { error: `Attachment delete failed: ${attErr.message}` });

    const { error: noteErr } = await svc
      .from("notes")
      .delete()
      .eq("source_email_id", emailId);
    if (noteErr) return json(req, 500, { error: `Notes delete failed: ${noteErr.message}` });

    const { error: emailErr } = await svc
      .from("email_messages")
      .delete()
      .eq("id", emailId);
    if (emailErr) return json(req, 500, { error: `Email delete failed: ${emailErr.message}` });

    return json(req, 200, { ok: true, mode, email_id: emailId });
  } catch (err) {
    console.error("unlink-email error:", err);
    return json(req, 500, { error: (err as Error).message || "Internal error" });
  }
});

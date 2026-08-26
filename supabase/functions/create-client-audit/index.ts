import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasTenantAccessSafe } from "../_shared/auth-helpers.ts";
import { FeatureKeys, requireCaller } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json().catch(() => ({}));
    const {
      audit_type,
      subject_tenant_id,
      title,
      is_rto,
      is_cricos,
      conducted_at,
      lead_auditor_id,
      assisted_by_id,
      training_products,
      doc_number,
      snapshot_rto_name,
      snapshot_rto_number,
      snapshot_cricos_code,
      snapshot_site_address,
      snapshot_ceo,
      snapshot_phone,
      snapshot_email,
      snapshot_website,
      snapshot_other_contacts,
      snapshot_overseas_student_count,
      snapshot_education_agents,
      snapshot_prisms_users,
      snapshot_dha_contact,
      template_id,
      linked_stage_instance_id,
    } = body ?? {};

    if (!audit_type || !subject_tenant_id || !title) {
      return jsonResponse({ error: "Missing required fields: audit_type, subject_tenant_id, title" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const caller = await requireCaller(req, admin, {
      featureKey: FeatureKeys.staffInternal,
      headers: corsHeaders,
      orAllow: async ({ userId, admin: client }) => (await hasTenantAccessSafe(client, userId, Number(subject_tenant_id))).allowed,
    });
    if (!caller.ok) return caller.response;
    const userId = caller.user.id;
    const isStaff = caller.via === "permission";

    if (linked_stage_instance_id) {
      const { data: stageInstance, error: stageError } = await admin
        .from("stage_instances")
        .select("packageinstance_id")
        .eq("id", linked_stage_instance_id)
        .maybeSingle();
      if (stageError || !stageInstance) {
        return jsonResponse({ error: "Linked stage instance not found" }, 403);
      }
      const { data: packageInstance, error: packageError } = await admin
        .from("package_instances")
        .select("id")
        .eq("id", stageInstance.packageinstance_id)
        .eq("tenant_id", subject_tenant_id)
        .maybeSingle();
      if (packageError || !packageInstance) {
        return jsonResponse({ error: "Linked stage instance does not belong to this tenant" }, 403);
      }
    }

    // Insert audit (service role bypasses RLS — authorisation verified above)
    // subject_tenant_id = the RTO being audited (from wizard)
    const { data: inserted, error: insertErr } = await admin
      .from("client_audits")
      .insert({
        audit_type,
        subject_tenant_id,
        title,
        status: "draft",
        is_rto: is_rto ?? null,
        is_cricos: is_cricos ?? null,
        conducted_at: conducted_at || null,
        lead_auditor_id: lead_auditor_id || null,
        assisted_by_id: assisted_by_id || null,
        training_products: training_products || [],
        doc_number: doc_number || null,
        snapshot_rto_name: snapshot_rto_name || null,
        snapshot_rto_number: snapshot_rto_number || null,
        snapshot_cricos_code: snapshot_cricos_code || null,
        snapshot_site_address: snapshot_site_address || null,
        snapshot_ceo: snapshot_ceo || null,
        snapshot_phone: snapshot_phone || null,
        snapshot_email: snapshot_email || null,
        snapshot_website: snapshot_website || null,
        snapshot_other_contacts: snapshot_other_contacts || null,
        snapshot_overseas_student_count: snapshot_overseas_student_count ?? null,
        snapshot_education_agents: snapshot_education_agents || null,
        snapshot_prisms_users: snapshot_prisms_users || null,
        snapshot_dha_contact: snapshot_dha_contact || null,
        template_id: template_id || null,
        linked_stage_instance_id: linked_stage_instance_id || null,
        ai_analysis_status: "none",
        created_by: userId,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("client_audits insert error", insertErr);
      return jsonResponse({ error: insertErr.message }, 500);
    }

    const newAuditId = inserted?.id;
    if (!newAuditId) {
      console.error("client_audits insert returned no id", inserted);
      return jsonResponse({ error: "Audit insert succeeded but no id returned" }, 500);
    }

    // Back-link stage_instances if provided (non-critical)
    if (linked_stage_instance_id) {
      const { error: linkErr } = await admin
        .from("stage_instances")
        .update({ linked_audit_id: newAuditId })
        .eq("id", linked_stage_instance_id);
      if (linkErr) console.error("stage_instances back-link error", linkErr);
    }

    // Timeline event (non-critical).
    // Fixed: this insert previously violated three check constraints every
    // single time (event_type 'audit_created' wasn't allow-listed, source
    // 'internal' isn't a valid value, and client_id — NOT NULL — was never
    // supplied), so no audit-creation event has ever actually been recorded.
    // 'audit_created' was added to the allow-list in the companion migration.
    const { error: timelineErr } = await admin
      .from("client_timeline_events")
      .insert({
        tenant_id: subject_tenant_id,
        client_id: String(subject_tenant_id),
        event_type: "audit_created",
        title: `Audit started: ${title}`,
        entity_type: "client_audit",
        entity_id: newAuditId,
        source: "system",
        visibility: "internal",
        created_by: userId,
      });
    if (timelineErr) console.error("timeline insert error", timelineErr);

    // A8 (Unicorn 2.0 Feature Status report, §4): fire off audit intelligence
    // pack generation in the background for staff-created audits. This is
    // the table + function that already existed but sat at 0 rows because
    // nothing was calling it — best-effort, never blocks audit creation.
    if (isStaff) {
      const packPromise = fetch(`${SUPABASE_URL}/functions/v1/research-audit-intelligence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.get("Authorization") ?? "",
        },
        body: JSON.stringify({
          tenant_id: subject_tenant_id,
          audit_type,
          cricos_flag: is_cricos ?? false,
          tenant_name: snapshot_rto_name || null,
        }),
      }).catch((e) => console.error("research-audit-intelligence trigger failed", e));

      // deno-lint-ignore no-explicit-any
      const edgeRuntime = (globalThis as any).EdgeRuntime;
      if (edgeRuntime && typeof edgeRuntime.waitUntil === "function") {
        edgeRuntime.waitUntil(packPromise);
      }
    }

    return jsonResponse({ id: newAuditId });
  } catch (e) {
    console.error("create-client-audit unexpected error", e);
    return jsonResponse({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }
    const userId = userData.user.id;

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

    // Authorization: Vivacity staff (unicorn_role set) OR member of subject tenant
    const { data: userRow, error: userRowErr } = await admin
      .from("users")
      .select("user_uuid, unicorn_role")
      .eq("user_uuid", userId)
      .maybeSingle();

    if (userRowErr) {
      console.error("users lookup error", userRowErr);
      return jsonResponse({ error: "Identity lookup failed" }, 500);
    }

    const isStaff = !!userRow?.unicorn_role;
    let isMember = false;

    if (!isStaff) {
      const { data: membership } = await admin
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", subject_tenant_id)
        .eq("user_id", userId)
        .maybeSingle();
      isMember = !!membership;
    }

    if (!isStaff && !isMember) {
      return jsonResponse({ error: "Forbidden: not a member of this tenant" }, 403);
    }

    // Insert audit (service role bypasses RLS — authorisation verified above)
    // tenant_id = OWNER (auditor's home tenant) → satisfies billing_gate RLS
    // subject_tenant_id = the RTO being audited (from wizard)
    const { data: inserted, error: insertErr } = await admin
      .from("client_audits")
      .insert({
        tenant_id: ownerTenantId,
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

    // Timeline event (non-critical)
    const { error: timelineErr } = await admin
      .from("client_timeline_events")
      .insert({
        tenant_id: subject_tenant_id,
        event_type: "audit_created",
        title: `Audit started: ${title}`,
        entity_type: "client_audit",
        entity_id: newAuditId,
        source: "internal",
      });
    if (timelineErr) console.error("timeline insert error", timelineErr);

    return jsonResponse({ id: newAuditId });
  } catch (e) {
    console.error("create-client-audit unexpected error", e);
    return jsonResponse({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { FeatureKeys, requireCaller } from "../_shared/requireCaller.ts";

const response = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", ...corsHeaders(req) },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return response(req, { error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const caller = await requireCaller(req, supabase, {
    featureKey: FeatureKeys.staffInternal,
    errorStyle: "error",
    forbiddenMessage: "Vivacity staff access required",
  });
  if (!caller.ok) return caller.response;

  try {
    const body = await req.json() as Record<string, unknown>;
    const auditType = typeof body.audit_type === "string" ? body.audit_type : null;
    const tenantId = typeof body.subject_tenant_id === "number" ? body.subject_tenant_id : null;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const conductedAt = typeof body.conducted_at === "string" ? new Date(body.conducted_at) : null;
    if (!auditType || !tenantId || !title) {
      return response(req, { error: "Missing required fields: audit_type, subject_tenant_id, title" }, 400);
    }
    if (!conductedAt || Number.isNaN(conductedAt.getTime()) || conductedAt.getTime() > Date.now()) {
      return response(req, { error: "conducted_at must be a valid non-future date" }, 422);
    }

    const optionalString = (key: string) => typeof body[key] === "string" ? body[key] : null;
    const payload = {
      audit_type: auditType,
      subject_tenant_id: tenantId,
      title,
      status: "complete",
      is_retrospective: true,
      conducted_at: conductedAt.toISOString(),
      closed_at: new Date().toISOString(),
      is_rto: typeof body.is_rto === "boolean" ? body.is_rto : null,
      is_cricos: typeof body.is_cricos === "boolean" ? body.is_cricos : null,
      lead_auditor_id: optionalString("lead_auditor_id"),
      assisted_by_id: optionalString("assisted_by_id"),
      training_products: Array.isArray(body.training_products) ? body.training_products : [],
      doc_number: optionalString("doc_number"),
      snapshot_rto_name: optionalString("snapshot_rto_name"),
      snapshot_rto_number: optionalString("snapshot_rto_number"),
      snapshot_cricos_code: optionalString("snapshot_cricos_code"),
      snapshot_site_address: optionalString("snapshot_site_address"),
      snapshot_ceo: optionalString("snapshot_ceo"),
      snapshot_phone: optionalString("snapshot_phone"),
      snapshot_email: optionalString("snapshot_email"),
      snapshot_website: optionalString("snapshot_website"),
      snapshot_other_contacts: optionalString("snapshot_other_contacts"),
      snapshot_overseas_student_count: typeof body.snapshot_overseas_student_count === "number" ? body.snapshot_overseas_student_count : null,
      snapshot_education_agents: optionalString("snapshot_education_agents"),
      snapshot_prisms_users: optionalString("snapshot_prisms_users"),
      snapshot_dha_contact: optionalString("snapshot_dha_contact"),
      template_id: optionalString("template_id"),
      risk_rating: optionalString("risk_rating"),
      risk_rationale: optionalString("risk_rationale"),
      score_total: typeof body.score_total === "number" ? body.score_total : null,
      score_max: typeof body.score_max === "number" ? body.score_max : null,
      score_pct: typeof body.score_pct === "number" ? body.score_pct : null,
      executive_summary: optionalString("executive_summary"),
      overall_finding: optionalString("overall_finding"),
      ai_analysis_status: "none",
      created_by: caller.user.id,
    };
    const { data: audit, error } = await supabase.from("client_audits").insert(payload).select("id").single();
    if (error || !audit) return response(req, { error: "Failed to record completed audit" }, 500);

    const { error: timelineError } = await supabase.from("client_timeline_events").insert({
      tenant_id: tenantId, client_id: String(tenantId), event_type: "audit_created",
      title: `Audit recorded (retrospective): ${title}`, entity_type: "client_audit",
      entity_id: String(audit.id), source: "system", visibility: "internal",
      created_by: caller.user.id, metadata: { is_retrospective: true },
    });
    if (timelineError) console.error("Timeline insert failed", timelineError.message);
    return response(req, { id: audit.id, is_retrospective: true });
  } catch (error) {
    console.error("record-completed-audit error", error);
    return response(req, { error: "Failed to record completed audit" }, 500);
  }
});

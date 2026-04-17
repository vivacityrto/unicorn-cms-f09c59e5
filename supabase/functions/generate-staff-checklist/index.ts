/**
 * generate-staff-checklist
 * ------------------------
 * Given a provisioning_run_id and the resolved (role, location) rule,
 * creates lifecycle_checklist_instances for every staff_onboarding template
 * step, attaching it to the run.
 *
 * Steps that map 1:1 to a Graph-automated action are pre-marked completed
 * by the caller (provision-m365-user). Software & calendar steps remain
 * open for manual tick-off.
 *
 * Body: { run_id: number, role_code: string, location_code: string }
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { ok: false, error: "Missing Authorization" });

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { run_id, role_code, location_code, requested_by } = await req.json();

    if (!run_id || !role_code || !location_code) {
      return json(400, { ok: false, error: "run_id, role_code and location_code are required" });
    }

    // Load all active staff_onboarding templates
    const { data: templates, error: tErr } = await admin
      .from("lifecycle_checklist_templates")
      .select("id, category, step_title, sort_order")
      .eq("lifecycle_type", "staff_onboarding")
      .eq("is_active", true)
      .order("sort_order");

    if (tErr) throw tErr;

    const rows = (templates ?? []).map((t: any) => ({
      template_id: t.id,
      lifecycle_type: "staff_onboarding",
      provisioning_run_id: run_id,
      assigned_to: requested_by ?? null,
      completed: false,
    }));

    if (rows.length > 0) {
      const { error: insErr } = await admin
        .from("lifecycle_checklist_instances")
        .insert(rows);
      if (insErr) throw insErr;
    }

    return json(200, { ok: true, created: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-staff-checklist]", msg);
    return json(500, { ok: false, error: msg });
  }
});

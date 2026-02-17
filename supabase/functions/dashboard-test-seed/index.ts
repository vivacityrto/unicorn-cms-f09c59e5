import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller is Super Admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("unicorn_role")
      .eq("user_uuid", user.id)
      .single();

    if (profile?.unicorn_role !== "Super Admin") {
      return new Response(JSON.stringify({ error: "Forbidden: Super Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action } = await req.json();

    if (action === "seed_test_states") {
      // Get first 3 active tenants to apply test states
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id, name")
        .eq("status", "active")
        .limit(3);

      if (!tenants || tenants.length < 3) {
        return new Response(
          JSON.stringify({ error: "Need at least 3 active tenants to seed test states" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const results: string[] = [];

      // ── Tenant A: critical stage + overdue tasks ──
      const tA = tenants[0];
      // Seed a high-severity risk event to drive risk_score up
      await supabase.from("risk_events").insert({
        tenant_id: tA.id,
        source_type: "test_seed",
        source_entity_id: `seed-A-${Date.now()}`,
        standard_clause: "1.1",
        risk_category: "compliance",
        severity: "high",
        theme_label: "Seed: critical stage + overdue tasks",
        detected_at: new Date().toISOString(),
        status: "open",
        notes: "Test seed Tenant A: simulates critical stage health with high-severity risk.",
      });
      // Seed a real-time risk alert so it appears in Priority Inbox
      await supabase.from("real_time_risk_alerts").insert({
        tenant_id: tA.id,
        severity: "critical",
        alert_summary: `[SEED] Critical stage health – ${tA.name}: overdue tasks detected`,
        source_type: "test_seed",
        resolved_flag: false,
        archived_flag: false,
      });
      results.push(`Tenant A (${tA.name}): seeded critical risk event + critical inbox alert`);

      // ── Tenant B: mandatory gaps 3 + inactivity 25 days ──
      const tB = tenants[1];
      // Seed an old note (25 days) to drive staleness
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 25);
      await supabase.from("notes").insert({
        tenant_id: tB.id,
        created_by: user.id,
        note_type: "test_seed",
        title: "Seed: Last activity 25d ago",
        note_details: "Test seed Tenant B: simulates 25-day inactivity with mandatory evidence gaps.",
        created_at: oldDate.toISOString(),
      });
      // Seed an inbox alert for gaps
      await supabase.from("real_time_risk_alerts").insert({
        tenant_id: tB.id,
        severity: "high",
        alert_summary: `[SEED] Evidence gaps – ${tB.name}: 3 mandatory categories missing`,
        source_type: "test_seed",
        resolved_flag: false,
        archived_flag: false,
      });
      results.push(`Tenant B (${tB.name}): seeded old note (25d) + gaps inbox alert`);

      // ── Tenant C: renewal in 20 days + retention high_risk ──
      const tC = tenants[2];
      const renewalDate = new Date();
      renewalDate.setDate(renewalDate.getDate() + 20);
      const { error: tcpError } = await supabase.from("tenant_commercial_profiles").upsert({
        tenant_id: tC.id,
        renewal_window_start: renewalDate.toISOString().split("T")[0],
        renewal_window_end: new Date(renewalDate.getTime() + 30 * 86400000).toISOString().split("T")[0],
      }, { onConflict: "tenant_id" });
      if (tcpError) results.push(`Tenant C renewal upsert error: ${tcpError.message}`);
      // Seed retention inbox alert
      await supabase.from("real_time_risk_alerts").insert({
        tenant_id: tC.id,
        severity: "high",
        alert_summary: `[SEED] Retention risk – ${tC.name}: renewal in 20 days, high_risk retention`,
        source_type: "test_seed",
        resolved_flag: false,
        archived_flag: false,
      });
      results.push(`Tenant C (${tC.name}): seeded renewal in 20d + retention inbox alert`);

      // Audit log
      await supabase.from("audit_dashboard_events").insert({
        actor_user_id: user.id,
        action: "test_seed_executed",
        metadata_json: { tenants_seeded: tenants.map((t: any) => ({ id: t.id, name: t.name })), results },
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: `Seeded 3 test tenants for acceptance testing`,
          tenants: {
            A: { id: tA.id, name: tA.name, scenario: "critical stage + overdue tasks" },
            B: { id: tB.id, name: tB.name, scenario: "mandatory gaps 3 + inactivity 25d" },
            C: { id: tC.id, name: tC.name, scenario: "renewal 20d + retention high_risk" },
          },
          results,
          expected_outcomes: {
            todays_focus: "All 3 should appear – A as critical, B/C as high",
            attention_ranking: "A should rank highest (risk+stage), then B (gaps+staleness), then C (renewal)",
            priority_inbox: "3 seeded alerts visible, snoozable per user",
          },
          note: "Refresh the dashboard to see updated scores. Use cleanup_test_seeds to remove.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "cleanup_test_seeds") {
      // Remove seeded risk events, alerts, and notes
      await supabase.from("risk_events").delete().eq("source_type", "test_seed");
      await supabase.from("real_time_risk_alerts").delete().eq("source_type", "test_seed");
      await supabase.from("notes").delete().eq("note_type", "test_seed");

      await supabase.from("audit_dashboard_events").insert({
        actor_user_id: user.id,
        action: "test_seed_cleanup",
        metadata_json: {},
      });

      return new Response(
        JSON.stringify({ success: true, message: "Cleaned up all test seed data (risk_events, alerts, notes)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "seed_test_states" or "cleanup_test_seeds".' }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

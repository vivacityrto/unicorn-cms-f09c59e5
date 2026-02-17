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
      // Get first 6 active tenants to apply test states
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id, name")
        .eq("status", "active")
        .limit(6);

      if (!tenants || tenants.length < 6) {
        return new Response(
          JSON.stringify({ error: "Need at least 6 active tenants to seed test states" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const results: string[] = [];

      // Tenant 0: Critical stage + high risk (should score ~70+)
      const t0 = tenants[0];
      // Create a risk event with high severity
      await supabase.from("risk_events").insert({
        tenant_id: t0.id,
        source_type: "test_seed",
        source_entity_id: "seed-001",
        standard_clause: "1.1",
        risk_category: "compliance",
        severity: "high",
        theme_label: "Seeded critical scenario",
        detected_at: new Date().toISOString(),
        status: "open",
        notes: "Test seed: high severity risk for attention score testing",
      });
      results.push(`${t0.name}: seeded high-severity risk event`);

      // Tenant 1: Evidence gaps (insert note to mark)
      const t1 = tenants[1];
      await supabase.from("notes").insert({
        tenant_id: t1.id,
        created_by: user.id,
        note_type: "test_seed",
        title: "Test Seed: Evidence gaps scenario",
        note_details: "This tenant was seeded for attention score testing with evidence gap scenarios.",
      });
      results.push(`${t1.name}: seeded note for evidence gap scenario`);

      // Tenant 2: Stale (no recent activity) - create old note
      const t2 = tenants[2];
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);
      await supabase.from("notes").insert({
        tenant_id: t2.id,
        created_by: user.id,
        note_type: "test_seed",
        title: "Test Seed: Staleness scenario",
        note_details: "Last meaningful activity was >30 days ago. This tenant should trigger staleness alerts.",
        created_at: oldDate.toISOString(),
      });
      results.push(`${t2.name}: seeded old note (35d ago) for staleness`);

      // Tenant 3: Renewal pressure
      const t3 = tenants[3];
      const renewalDate = new Date();
      renewalDate.setDate(renewalDate.getDate() + 20);
      const { error: tcpError } = await supabase.from("tenant_commercial_profiles").upsert({
        tenant_id: t3.id,
        renewal_window_start: renewalDate.toISOString().split("T")[0],
        renewal_window_end: new Date(renewalDate.getTime() + 30 * 86400000).toISOString().split("T")[0],
      }, { onConflict: "tenant_id" });
      if (tcpError) results.push(`${t3.name}: renewal upsert error: ${tcpError.message}`);
      else results.push(`${t3.name}: seeded renewal in 20 days`);

      // Tenant 4: Burn critical
      const t4 = tenants[4];
      await supabase.from("notes").insert({
        tenant_id: t4.id,
        created_by: user.id,
        note_type: "test_seed",
        title: "Test Seed: Burn risk scenario",
        note_details: "This tenant's hours are projected to exhaust soon. Check burn_risk_status in portfolio view.",
      });
      results.push(`${t4.name}: seeded burn risk note`);

      // Tenant 5: Combined moderate signals
      const t5 = tenants[5];
      await supabase.from("risk_events").insert({
        tenant_id: t5.id,
        source_type: "test_seed",
        source_entity_id: "seed-005",
        standard_clause: "2.2",
        risk_category: "governance",
        severity: "high",
        theme_label: "Seeded combined scenario",
        detected_at: new Date().toISOString(),
        status: "open",
        notes: "Test seed: combined moderate signals",
      });
      results.push(`${t5.name}: seeded combined signals`);

      // Log the seed action
      await supabase.from("audit_dashboard_events").insert({
        actor_user_id: user.id,
        action: "test_seed_executed",
        metadata_json: { tenants_seeded: tenants.map((t: any) => t.id), results },
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: `Seeded test states for ${tenants.length} tenants`,
          results,
          note: "Refresh the dashboard to see updated attention scores. Some scores depend on aggregated views which may take a moment to reflect."
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "cleanup_test_seeds") {
      // Remove seeded risk events
      await supabase.from("risk_events").delete().eq("source_type", "test_seed");
      // Remove seeded notes
      await supabase.from("notes").delete().eq("note_type", "test_seed");

      await supabase.from("audit_dashboard_events").insert({
        actor_user_id: user.id,
        action: "test_seed_cleanup",
        metadata_json: {},
      });

      return new Response(
        JSON.stringify({ success: true, message: "Cleaned up all test seed data" }),
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Generate Meeting Summary Edge Function
 * 
 * POST /generate-meeting-summary
 * 
 * Accepts transcript or notes text for a meeting.
 * Routes through ai-orchestrator for processing.
 * Stores result in meeting_summaries with ai_event_id link.
 * 
 * Phase 1: Returns stub summary (no LLM yet).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GenerateSummaryRequest {
  meeting_id: string;
  tenant_id: number;
  source: "transcript" | "notes";
  text: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body: GenerateSummaryRequest = await req.json();
    const { meeting_id, tenant_id, source, text } = body;

    // Validate inputs
    if (!meeting_id || !tenant_id || !source || !text?.trim()) {
      return new Response(
        JSON.stringify({ error: "meeting_id, tenant_id, source, and text are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["transcript", "notes"].includes(source)) {
      return new Response(
        JSON.stringify({ error: "source must be 'transcript' or 'notes'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify meeting exists
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, tenant_id")
      .eq("id", meeting_id)
      .single();

    if (meetingError || !meeting) {
      return new Response(
        JSON.stringify({ error: "Meeting not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call ai-orchestrator internally
    const orchestratorUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-orchestrator`;
    const orchestratorResponse = await fetch(orchestratorUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        tenant_id,
        actor_user_id: user.id,
        task_type: "meeting_summary",
        feature: "meeting_summaries",
        input: {
          meeting_id,
          transcript_text: source === "transcript" ? text : undefined,
          notes_text: source === "notes" ? text : undefined,
        },
      }),
    });

    const orchestratorResult = await orchestratorResponse.json();

    if (!orchestratorResponse.ok) {
      return new Response(
        JSON.stringify({ error: "AI orchestrator failed", detail: orchestratorResult }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const output = orchestratorResult.output;
    const aiEventId = orchestratorResult.request_id;

    // Find the ai_event by request_id to link
    const { data: aiEvent } = await supabase
      .from("ai_events")
      .select("ai_event_id")
      .eq("request_id", aiEventId)
      .single();

    // Store meeting summary
    const { data: summary, error: insertError } = await supabase
      .from("meeting_summaries")
      .insert({
        tenant_id,
        meeting_id,
        created_by_user_id: user.id,
        source,
        summary_text: output.summary || "[AI summary pending]",
        decisions: output.key_decisions?.map((d: string) => ({ text: d })) || [],
        action_items: output.action_items || [],
        risks_raised: [],
        confidence: orchestratorResult.confidence || null,
        ai_event_id: aiEvent?.ai_event_id || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert meeting summary:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save summary", detail: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        meeting_summary_id: summary.meeting_summary_id,
        summary,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("generate-meeting-summary error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

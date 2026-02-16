/**
 * copilot-chat – Unicorn 2.0
 *
 * Internal AI Advisory Copilot edge function.
 * Provides clause-aware, context-injected advisory responses.
 * Uses Lovable AI Gateway with Knowledge Graph context.
 *
 * Actions:
 *   - start_session: Create a new copilot session
 *   - send_message: Send a message and get AI response
 *   - get_session: Retrieve session with messages
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_MESSAGES_PER_SESSION = 20;

const SYSTEM_PROMPT = `You are an Internal Advisory Copilot for Vivacity Coaching & Consulting's Unicorn 2.0 compliance platform.

ROLE:
- You assist Vivacity internal team members with RTO compliance advisory work.
- You reference Standards for RTOs 2025 ONLY. Never reference Standards 2015.
- You use structured data from the Unicorn platform (risks, stages, evidence, templates, regulator updates).

RULES:
- NEVER declare compliance or non-compliance.
- NEVER predict audit outcomes.
- NEVER advance stages or create tasks automatically.
- NEVER edit documents or templates.
- Always use advisory language: "risk indicator", "review recommended", "evidence should be confirmed".
- Always cite data sources: "Based on Unicorn data", "Based on regulator update", "Based on internal analysis".
- When suggesting actions, present them as recommendations requiring user confirmation.

RESPONSE FORMAT:
- Be concise and actionable.
- Use markdown formatting.
- Include a "Suggested Actions" section when relevant.
- End every response with: "*This advisory response supports internal review only and does not determine compliance.*"`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth check
    const authHeader = req.headers.get("Authorization");
    const sb = createClient(supabaseUrl, serviceKey);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || serviceKey);

    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await anonClient.auth.getUser(token);
      userId = user?.id ?? null;
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify Vivacity internal
    const { data: userData } = await sb
      .from("users")
      .select("is_vivacity_internal, unicorn_role")
      .eq("user_uuid", userId)
      .single();

    if (!userData?.is_vivacity_internal) {
      return new Response(
        JSON.stringify({ error: "Copilot is restricted to Vivacity internal team" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action } = body;

    // === START SESSION ===
    if (action === "start_session") {
      const { tenant_id, stage_instance_id, template_id, context_mode } = body;

      const { data: session, error } = await sb
        .from("copilot_sessions")
        .insert({
          user_id: userId,
          tenant_id: tenant_id || null,
          stage_instance_id: stage_instance_id || null,
          template_id: template_id || null,
          context_mode: context_mode || "general",
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ session }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === SEND MESSAGE ===
    if (action === "send_message") {
      const { session_id, message } = body;

      // Verify session ownership
      const { data: session } = await sb
        .from("copilot_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("user_id", userId)
        .single();

      if (!session) {
        return new Response(
          JSON.stringify({ error: "Session not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check message limit
      if (session.message_count >= MAX_MESSAGES_PER_SESSION * 2) {
        return new Response(
          JSON.stringify({ error: "Session message limit reached. Please start a new session." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Save user message
      await sb.from("copilot_messages").insert({
        session_id,
        role: "user",
        message_content: message,
      });

      // Build context
      const contextParts: string[] = [];
      const citations: Array<{ source: string; type: string }> = [];

      // Tenant context
      if (session.tenant_id) {
        const { data: forecasts } = await sb
          .from("tenant_risk_forecasts")
          .select("composite_risk_index, forecast_risk_status, key_risk_drivers_json")
          .eq("tenant_id", session.tenant_id)
          .order("forecast_date", { ascending: false })
          .limit(1);

        if (forecasts?.[0]) {
          contextParts.push(`TENANT RISK FORECAST: Composite Index ${forecasts[0].composite_risk_index}, Status: ${forecasts[0].forecast_risk_status}. Key drivers: ${JSON.stringify(forecasts[0].key_risk_drivers_json)}`);
          citations.push({ source: "tenant_risk_forecast", type: "Unicorn data" });
        }

        // Knowledge graph nodes for tenant
        const { data: tenantNodes } = await sb
          .from("knowledge_edges")
          .select("from_node_id, to_node_id, relationship_type")
          .limit(20);

        if (tenantNodes?.length) {
          contextParts.push(`KNOWLEDGE GRAPH: ${tenantNodes.length} related edges found for context.`);
          citations.push({ source: "knowledge_graph", type: "Unicorn data" });
        }
      }

      // Stage context
      if (session.stage_instance_id) {
        contextParts.push(`STAGE CONTEXT: Stage instance ${session.stage_instance_id} is in focus.`);
        citations.push({ source: "stage_health", type: "Unicorn data" });
      }

      // Get conversation history
      const { data: history } = await sb
        .from("copilot_messages")
        .select("role, message_content")
        .eq("session_id", session_id)
        .order("created_at", { ascending: true })
        .limit(MAX_MESSAGES_PER_SESSION * 2);

      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
      ];

      if (contextParts.length > 0) {
        messages.push({
          role: "system",
          content: `CONTEXT DATA (from Unicorn platform):\n${contextParts.join("\n\n")}`,
        });
      }

      // Add conversation history
      for (const msg of (history ?? [])) {
        messages.push({
          role: msg.role === "copilot" ? "assistant" : msg.role,
          content: msg.message_content,
        });
      }

      // Call Lovable AI Gateway
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages,
          max_tokens: 2000,
          temperature: 0.3,
        }),
      });

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (aiResponse.status === 402) {
          return new Response(
            JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const errText = await aiResponse.text();
        console.error("AI gateway error:", aiResponse.status, errText);
        throw new Error("AI gateway error");
      }

      const aiData = await aiResponse.json();
      const responseContent = aiData.choices?.[0]?.message?.content || "I was unable to generate a response.";

      // Save copilot response
      await sb.from("copilot_messages").insert({
        session_id,
        role: "copilot",
        message_content: responseContent,
        citations_json: citations,
      });

      // Update message count
      await sb
        .from("copilot_sessions")
        .update({ message_count: (session.message_count || 0) + 2 })
        .eq("id", session_id);

      // Audit log
      await sb.from("audit_events").insert({
        action: "copilot_message_generated",
        entity: "copilot_session",
        entity_id: session_id,
        user_id: userId,
        details: { context_mode: session.context_mode, tenant_id: session.tenant_id },
      });

      return new Response(
        JSON.stringify({
          response: responseContent,
          citations,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === GET SESSION ===
    if (action === "get_session") {
      const { session_id } = body;

      const { data: session } = await sb
        .from("copilot_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("user_id", userId)
        .single();

      if (!session) {
        return new Response(
          JSON.stringify({ error: "Session not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: messages } = await sb
        .from("copilot_messages")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at", { ascending: true });

      return new Response(
        JSON.stringify({ session, messages }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use: start_session, send_message, get_session" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Copilot error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

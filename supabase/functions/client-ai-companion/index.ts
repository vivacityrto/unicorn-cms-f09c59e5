/**
 * client-ai-companion – Unicorn 2.0 Phase 17
 *
 * Phase-gated AI companion for client portal.
 * Provides preparation guidance only — never determines compliance.
 * Uses Lovable AI Gateway.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = "https://yxkgdalkbrriasiyyrwk.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const ESCALATION_TRIGGERS = [
  "are we compliant",
  "will we pass",
  "is this enough",
  "audit ready",
  "compliance status",
  "pass the audit",
  "will asqa",
];

const ESCALATION_RESPONSE =
  "I cannot determine compliance or audit outcomes. Vivacity will review and provide formal guidance. If you have specific questions about what to prepare, I'm happy to help with that.";

const FOOTER =
  "\n\n---\n*This guidance supports preparation only. Vivacity will review and confirm alignment with the Standards for RTOs 2025.*";

const MODE_CAPABILITIES: Record<string, { allowed: string; restricted: string }> = {
  orientation: {
    allowed:
      "You may: explain stage purposes, explain evidence category meanings, provide high-level clause summaries, provide checklist format guidance.",
    restricted:
      "You must NOT: review uploaded documents, comment on adequacy, suggest readiness, assess quality, or determine compliance.",
  },
  evidence_prep: {
    allowed:
      "You may: confirm required evidence categories, check if document types are present, provide structure suggestions, explain clause expectations.",
    restricted:
      "You must NOT: assess document quality, determine compliance, approve readiness, or provide audit predictions.",
  },
  active_build: {
    allowed:
      "You may: explain TAS components, explain LLND expectations, provide packaging explanations, clarify marketing claim risks.",
    restricted:
      "You must NOT: approve TAS, confirm assessment sufficiency, provide audit readiness statements, or determine compliance.",
  },
};

function buildSystemPrompt(mode: string, contextData: any): string {
  const caps = MODE_CAPABILITIES[mode] ?? MODE_CAPABILITIES.orientation;

  let context = "";
  if (contextData.stageName) context += `\nCurrent Stage: ${contextData.stageName}`;
  if (contextData.evidenceCategories?.length)
    context += `\nRequired Evidence Categories: ${contextData.evidenceCategories.join(", ")}`;
  if (contextData.clauses?.length)
    context += `\nRelated Standard Clauses (2025): ${contextData.clauses.join(", ")}`;
  if (contextData.checklistSummary)
    context += `\nStage Checklist: ${contextData.checklistSummary}`;

  return `You are a Guided AI Companion for an Australian Registered Training Organisation (RTO).
You help clients understand requirements and prepare evidence for compliance with the Standards for RTOs 2025.

MODE: ${mode}
${caps.allowed}
${caps.restricted}

RESPONSE RULES:
- Use educational, supportive tone.
- Always reference relevant Standard clause numbers when applicable.
- NEVER use these words: "compliant", "non-compliant", "approved", "audit ready".
- Use advisory phrasing: "You should ensure", "You may need to provide", "This typically includes", "Vivacity will review".
- If asked about compliance status, audit outcomes, or readiness, respond: "${ESCALATION_RESPONSE}"
- Only reference Standards for RTOs 2025. Never reference Standards 2015.
- Always end responses with this footer: "${FOOTER}"
${context ? `\nCONTEXT:${context}` : ""}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      session_id,
      tenant_id,
      stage_instance_id,
      mode,
      message,
      action,
    } = await req.json();

    // Extract auth token
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify user from token
    let userId: string | null = null;
    if (token && token !== SUPABASE_SERVICE_ROLE_KEY) {
      const anonClient = createClient(SUPABASE_URL, "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4a2dkYWxrYnJyaWFzaXl5cndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2MjQwMzEsImV4cCI6MjA2MzIwMDAzMX0.bBFTaO-6Afko1koQqx-PWdzl2mu5qmE0xWNTvneqyqY");
      const { data: { user } } = await anonClient.auth.getUser(token);
      userId = user?.id ?? null;
    }

    const sessionMode = mode ?? "orientation";

    // ─── Action: create session ───
    if (action === "create_session") {
      const { data: session, error } = await sb
        .from("client_ai_sessions")
        .insert({
          tenant_id,
          stage_instance_id: stage_instance_id ?? null,
          user_id: userId,
          mode: sessionMode,
        })
        .select("id")
        .single();
      if (error) throw error;

      return new Response(JSON.stringify({ session_id: session.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: generate checklist ───
    if (action === "generate_checklist") {
      const contextData = await getContextData(sb, tenant_id, stage_instance_id);

      const checklistPrompt = `Generate a preparation checklist for ${
        contextData.stageName ?? "this stage"
      }. Include: category breakdown, suggested document list, internal owner suggestions, and timeline suggestions. Do NOT include any readiness scoring.`;

      const aiResponse = await callAI(
        buildSystemPrompt(sessionMode, contextData),
        checklistPrompt
      );

      // Save to session
      if (session_id) {
        await sb.from("client_ai_messages").insert([
          { session_id, role: "user", message_content: "Generate Preparation Checklist" },
          { session_id, role: "assistant", message_content: aiResponse + FOOTER },
        ]);
        await sb
          .from("client_ai_sessions")
          .update({ message_count: 2 })
          .eq("id", session_id);
      }

      // Audit
      await sb.from("audit_events").insert({
        action: "client_ai_checklist_generated",
        entity: "client_ai_sessions",
        entity_id: session_id ?? "no-session",
        user_id: userId,
        details: { tenant_id, mode: sessionMode },
      });

      return new Response(JSON.stringify({ response: aiResponse + FOOTER }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: send message ───
    if (!session_id || !message) {
      return new Response(
        JSON.stringify({ error: "session_id and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check escalation triggers
    const lowerMsg = message.toLowerCase();
    const isEscalation = ESCALATION_TRIGGERS.some((t) => lowerMsg.includes(t));

    if (isEscalation) {
      // Save escalation
      await sb.from("client_ai_messages").insert([
        { session_id, role: "user", message_content: message },
        { session_id, role: "assistant", message_content: ESCALATION_RESPONSE + FOOTER },
      ]);

      await sb.from("audit_events").insert({
        action: "client_ai_escalation_triggered",
        entity: "client_ai_sessions",
        entity_id: session_id,
        user_id: userId,
        details: { tenant_id, trigger: lowerMsg },
      });

      return new Response(
        JSON.stringify({ response: ESCALATION_RESPONSE + FOOTER, escalation: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get session info
    const { data: sessionData } = await sb
      .from("client_ai_sessions")
      .select("mode, tenant_id, stage_instance_id, message_count")
      .eq("id", session_id)
      .single();

    const currentMode = sessionData?.mode ?? sessionMode;
    const msgCount = sessionData?.message_count ?? 0;

    // Max 30 messages per session
    if (msgCount >= 30) {
      return new Response(
        JSON.stringify({
          error: "Session message limit reached. Please start a new session.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get conversation history
    const { data: history } = await sb
      .from("client_ai_messages")
      .select("role, message_content")
      .eq("session_id", session_id)
      .order("created_at", { ascending: true })
      .limit(20);

    // Context injection
    const contextData = await getContextData(
      sb,
      sessionData?.tenant_id ?? tenant_id,
      sessionData?.stage_instance_id ?? stage_instance_id
    );

    const messages = [
      { role: "system", content: buildSystemPrompt(currentMode, contextData) },
      ...(history ?? []).map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.message_content,
      })),
      { role: "user", content: message },
    ];

    // Call Lovable AI
    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI service temporarily unavailable." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const aiContent =
      (aiData.choices?.[0]?.message?.content ?? "I'm unable to respond right now.") + FOOTER;

    // Save messages
    await sb.from("client_ai_messages").insert([
      { session_id, role: "user", message_content: message },
      { session_id, role: "assistant", message_content: aiContent },
    ]);

    // Update count
    await sb
      .from("client_ai_sessions")
      .update({ message_count: msgCount + 2 })
      .eq("id", session_id);

    return new Response(JSON.stringify({ response: aiContent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("client-ai-companion error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function callAI(systemPrompt: string, userMessage: string): Promise<string> {
  const response = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    }
  );

  if (!response.ok) {
    console.error("AI call failed:", response.status);
    return "I'm unable to generate a response right now. Please try again later.";
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "Unable to generate response.";
}

async function getContextData(
  sb: any,
  tenantId: number | null,
  stageInstanceId: number | null
): Promise<any> {
  const result: any = {
    stageName: null,
    evidenceCategories: [],
    clauses: [],
    checklistSummary: null,
  };

  if (stageInstanceId) {
    const { data: si } = await sb
      .from("stage_instances")
      .select("stage_id, status")
      .eq("id", stageInstanceId)
      .single();

    if (si?.stage_id) {
      const { data: stage } = await sb
        .from("stages")
        .select("name, description")
        .eq("id", si.stage_id)
        .single();

      if (stage) {
        result.stageName = stage.name;
        result.checklistSummary = stage.description;
      }
    }
  }

  // Get knowledge graph clauses linked to tenant
  if (tenantId) {
    const { data: edges } = await sb
      .from("knowledge_edges")
      .select("target_label")
      .eq("source_type", "tenant")
      .eq("source_id", String(tenantId))
      .eq("target_type", "standard_clause")
      .limit(10);

    if (edges?.length) {
      result.clauses = edges.map((e: any) => e.target_label).filter(Boolean);
    }
  }

  return result;
}

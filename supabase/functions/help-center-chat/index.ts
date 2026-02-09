import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { extractToken, verifyAuth } from "../_shared/auth-helpers.ts";
import { handleCors, jsonOk, jsonError, corsHeaders } from "../_shared/response-helpers.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const token = extractToken(req);
    if (!token) return jsonError(401, "UNAUTHORIZED", "No token provided");

    const supabase = createServiceClient();
    const { user, profile, error: authErr } = await verifyAuth(supabase, token);
    if (authErr || !user || !profile) return jsonError(401, "UNAUTHORIZED", authErr || "Auth failed");

    const { message, thread_id, tenant_id } = await req.json();
    if (!message || typeof message !== "string") return jsonError(400, "BAD_REQUEST", "Message is required");
    if (!tenant_id) return jsonError(400, "BAD_REQUEST", "tenant_id is required");

    let currentThreadId = thread_id;

    // Create thread if needed
    if (!currentThreadId) {
      const { data: newThread, error: threadErr } = await supabase
        .from("help_threads")
        .insert({
          tenant_id: Number(tenant_id),
          user_id: user.id,
          channel: "chatbot",
          status: "open",
        })
        .select("id")
        .single();

      if (threadErr) {
        console.error("Thread creation error:", threadErr);
        return jsonError(500, "INTERNAL_ERROR", "Failed to create thread");
      }
      currentThreadId = newThread.id;
    }

    // Save user message
    const { error: userMsgErr } = await supabase
      .from("help_messages")
      .insert({
        thread_id: currentThreadId,
        sender_id: user.id,
        role: "user",
        content: message,
      });

    if (userMsgErr) {
      console.error("User message save error:", userMsgErr);
      return jsonError(500, "INTERNAL_ERROR", "Failed to save message");
    }

    // Call Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonError(500, "INTERNAL_ERROR", "AI service not configured");
    }

    // Build conversation history for context
    const { data: historyMsgs } = await supabase
      .from("help_messages")
      .select("role, content")
      .eq("thread_id", currentThreadId)
      .order("created_at", { ascending: true })
      .limit(20);

    const conversationHistory = (historyMsgs || []).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a helpful compliance assistant for an Australian Registered Training Organisation (RTO). 
You help clients understand their compliance obligations under:
- Standards for RTOs 2025 (primary)
- Standards for RTOs 2015 (legacy)
- CRICOS National Code (where applicable)
- GTO compliance (where applicable)

Be concise, clear, and accurate. If you're unsure about something, say so and recommend contacting their consultant.
Keep answers under 200 words unless the question requires detail.
Never provide legal advice — recommend professional consultation for complex issues.`,
          },
          ...conversationHistory,
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return jsonError(429, "RATE_LIMITED", "Too many requests. Please try again shortly.");
      }
      if (status === 402) {
        return jsonError(402, "PAYMENT_REQUIRED", "AI service credits exhausted.");
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", status, errText);
      return jsonError(500, "INTERNAL_ERROR", "AI service error");
    }

    const aiData = await aiResponse.json();
    const assistantContent = aiData.choices?.[0]?.message?.content || "I'm sorry, I couldn't generate a response. Please try again.";

    // Save assistant message
    const { data: savedMsg, error: saveMsgErr } = await supabase
      .from("help_messages")
      .insert({
        thread_id: currentThreadId,
        sender_id: user.id, // logged under the user's context
        role: "assistant",
        content: assistantContent,
        metadata: { model: "google/gemini-3-flash-preview" },
      })
      .select("id, content, created_at")
      .single();

    if (saveMsgErr) {
      console.error("Assistant message save error:", saveMsgErr);
    }

    // Touch thread updated_at
    await supabase
      .from("help_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", currentThreadId);

    return jsonOk({
      thread_id: currentThreadId,
      assistant_message: savedMsg || { content: assistantContent, created_at: new Date().toISOString() },
    });
  } catch (err) {
    console.error("help-center-chat error:", err);
    return jsonError(500, "INTERNAL_ERROR", err instanceof Error ? err.message : "Unknown error");
  }
});

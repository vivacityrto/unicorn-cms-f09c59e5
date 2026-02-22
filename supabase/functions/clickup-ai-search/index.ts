import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    // Verify Vivacity staff
    const { data: staffCheck } = await supabase.rpc("is_vivacity_staff", { p_user: userId });
    if (!staffCheck) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tenant_id, question } = await req.json();
    if (!tenant_id || !question) {
      return new Response(JSON.stringify({ error: "Missing tenant_id or question" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tasks (capped at 200)
    const { data: tasks } = await supabase
      .from("clickup_tasks_api")
      .select("task_id, custom_id, name, status, date_created, time_estimate, time_spent, creator_username")
      .eq("tenant_id", tenant_id)
      .order("date_created", { ascending: false })
      .limit(200);

    // Fetch comments (capped at 500)
    const { data: comments } = await supabase
      .from("v_clickup_comments")
      .select("task_id, comment_text, comment_date, comment_by")
      .eq("tenant_id", tenant_id)
      .order("comment_date", { ascending: false })
      .limit(500);

    // Fetch tenant notes (capped at 200)
    const { data: notes } = await supabase
      .from("notes")
      .select("title, note_details, note_type, created_at, parent_type")
      .eq("tenant_id", tenant_id)
      .order("created_at", { ascending: false })
      .limit(200);

    const taskContext = (tasks || []).map((t: any) => ({
      id: t.custom_id || t.task_id,
      name: t.name,
      status: t.status,
      created: t.date_created ? new Date(t.date_created).toLocaleDateString("en-AU") : null,
      estimate_mins: t.time_estimate ? Math.floor(t.time_estimate / 60000) : null,
      spent_mins: t.time_spent ? Math.floor(t.time_spent / 60000) : null,
      creator: t.creator_username,
    }));

    const commentContext = (comments || []).map((c: any) => ({
      task_id: c.task_id,
      text: c.comment_text,
      date: c.comment_date,
      by: c.comment_by,
    }));

    const noteContext = (notes || []).map((n: any) => ({
      title: n.title,
      content: n.note_details,
      type: n.note_type,
      created: n.created_at,
      parent_type: n.parent_type,
    }));

    const systemPrompt = `You are an internal assistant for Vivacity Coaching & Consulting. You have been given ClickUp task data, ClickUp comments, and internal tenant notes for a specific client. Answer the user's question based only on this data. Use Australian date formats (dd/MM/yyyy). Be concise and factual. Format your response in markdown.

## Tasks (${taskContext.length} total)
${JSON.stringify(taskContext, null, 1)}

## ClickUp Comments (${commentContext.length} total)
${JSON.stringify(commentContext, null, 1)}

## Tenant Notes (${noteContext.length} total)
${JSON.stringify(noteContext, null, 1)}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        stream: true,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up in workspace settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", status, errText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(aiResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("clickup-ai-search error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

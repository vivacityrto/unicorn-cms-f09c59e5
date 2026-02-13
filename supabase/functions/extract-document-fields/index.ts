import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Extract Document Fields Edge Function
 * 
 * POST /extract-document-fields
 * 
 * Reads chunks for a doc_file, routes through ai-orchestrator
 * for doc_extract_tas or doc_extract_trainer_matrix,
 * and stores results in the appropriate extract table.
 * 
 * Phase 1: Returns stub extraction (no LLM yet).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExtractRequest {
  doc_file_id: string;
  tenant_id: number;
  doc_type: "tas" | "trainer_matrix";
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

    const body: ExtractRequest = await req.json();
    const { doc_file_id, tenant_id, doc_type } = body;

    // Validate inputs
    if (!doc_file_id || !tenant_id || !doc_type) {
      return new Response(
        JSON.stringify({ error: "doc_file_id, tenant_id, and doc_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["tas", "trainer_matrix"].includes(doc_type)) {
      return new Response(
        JSON.stringify({ error: "doc_type must be 'tas' or 'trainer_matrix'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify doc_file exists and belongs to tenant
    const { data: docFile, error: docError } = await supabase
      .from("doc_files")
      .select("doc_file_id, tenant_id, filename, doc_type")
      .eq("doc_file_id", doc_file_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (docError || !docFile) {
      return new Response(
        JSON.stringify({ error: "Document file not found or tenant mismatch" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch chunks for this document (ordered by chunk_index)
    const { data: chunks, error: chunkError } = await supabase
      .from("doc_chunks")
      .select("chunk_index, chunk_text, page_ref")
      .eq("doc_file_id", doc_file_id)
      .order("chunk_index", { ascending: true })
      .limit(20); // Top 20 chunks for context window

    if (chunkError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch document chunks" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({ error: "No chunks found for this document. Please run text extraction first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Concatenate chunk text for orchestrator input
    const extractedText = chunks.map(c => c.chunk_text).join("\n\n");

    // Map doc_type to orchestrator task_type
    const taskType = doc_type === "tas" ? "doc_extract_tas" : "doc_extract_trainer_matrix";

    // Call ai-orchestrator
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
        task_type: taskType,
        feature: "document_extraction",
        input: {
          doc_file_id,
          extracted_text: extractedText,
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
    const requestId = orchestratorResult.request_id;

    // Find the ai_event by request_id to link
    const { data: aiEvent } = await supabase
      .from("ai_events")
      .select("ai_event_id")
      .eq("request_id", requestId)
      .single();

    // Store extraction results in the appropriate table
    if (doc_type === "tas") {
      const units = (output.units || []).map((u: any) => u.unit_code || u.unit_title || "");

      const { data: extract, error: insertError } = await supabase
        .from("tas_extracts")
        .insert({
          tenant_id,
          doc_file_id,
          extracted_json: output,
          units: units.filter(Boolean),
          delivery_mode: null,
          aqf_level: null,
          duration_weeks: null,
          confidence: orchestratorResult.confidence || null,
          ai_event_id: aiEvent?.ai_event_id || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Failed to insert TAS extract:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to save extraction", detail: insertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          doc_type: "tas",
          extract_id: extract.tas_extract_id,
          extract,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // trainer_matrix
      const { data: extract, error: insertError } = await supabase
        .from("trainer_matrix_extracts")
        .insert({
          tenant_id,
          doc_file_id,
          extracted_json: output,
          trainers: output.trainers || [],
          trainer_unit_links: [],
          confidence: orchestratorResult.confidence || null,
          ai_event_id: aiEvent?.ai_event_id || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Failed to insert Trainer Matrix extract:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to save extraction", detail: insertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          doc_type: "trainer_matrix",
          extract_id: extract.trainer_matrix_extract_id,
          extract,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (err) {
    console.error("extract-document-fields error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

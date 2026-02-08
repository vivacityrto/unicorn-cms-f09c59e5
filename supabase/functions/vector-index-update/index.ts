/**
 * Vector Index Update Edge Function
 * 
 * Updates vector embeddings for specific records.
 * Requires SuperAdmin or system role.
 * 
 * POST /vector-index-update
 * Body: { tenant_id: number, source_type: string, record_id: string }
 */

import { createServiceClient } from "../_shared/supabase-client.ts";
import { extractToken, verifyAuth, checkSuperAdmin, checkVivacityTeam } from "../_shared/auth-helpers.ts";
import { jsonOk, jsonError } from "../_shared/response-helpers.ts";
import {
  buildClientSummary,
  buildPhaseSummary,
  buildTaskSummary,
  buildDocumentSummary,
  buildConsultSummary,
  chunkText,
  buildNamespaceKey,
} from "../_shared/vector-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": 
    "authorization, x-client-info, apikey, content-type, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestPayload {
  tenant_id: number;
  source_type: string;
  record_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError(405, "METHOD_NOT_ALLOWED", "Only POST requests are accepted");
  }

  try {
    // Authenticate
    const token = extractToken(req);
    if (!token) {
      return jsonError(401, "UNAUTHORIZED", "No authorization token provided");
    }

    const supabase = createServiceClient();
    const { user, profile, error: authError } = await verifyAuth(supabase, token);
    
    if (authError || !user || !profile) {
      return jsonError(401, "UNAUTHORIZED", authError || "Authentication failed");
    }

    // Only SuperAdmins and Vivacity Team can update indexes
    if (!checkSuperAdmin(profile) && !checkVivacityTeam(profile)) {
      return jsonError(403, "FORBIDDEN", "Elevated access required");
    }

    // Parse request
    let payload: RequestPayload;
    try {
      payload = await req.json();
    } catch {
      return jsonError(400, "BAD_REQUEST", "Invalid JSON body");
    }

    const { tenant_id, source_type, record_id } = payload;
    
    if (!tenant_id || !source_type || !record_id) {
      return jsonError(400, "BAD_REQUEST", "tenant_id, source_type, and record_id are required");
    }

    console.log(`Updating index for ${source_type}:${record_id} in tenant ${tenant_id}`);

    // Get embedding API key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonError(500, "CONFIG_ERROR", "Embedding API not configured");
    }

    // Fetch the record
    const record = await fetchRecord(supabase, tenant_id, source_type, record_id);
    
    if (!record) {
      // Record not found - remove existing embeddings
      const { count } = await supabase
        .from("vector_embeddings")
        .delete({ count: "exact" })
        .eq("tenant_id", tenant_id)
        .eq("source_type", source_type)
        .eq("record_id", record_id);

      // Log the removal
      await supabase.from("vector_index_logs").insert({
        tenant_id,
        action: "remove",
        source_type,
        record_id,
        records_affected: count || 0,
        performed_by: user.id,
        metadata: { reason: "record_not_found" },
      });

      return jsonOk({
        message: "Record not found, removed existing embeddings",
        removed: count || 0,
      });
    }

    // Delete existing embeddings for this record
    await supabase
      .from("vector_embeddings")
      .delete()
      .eq("tenant_id", tenant_id)
      .eq("source_type", source_type)
      .eq("record_id", record_id);

    // Chunk and embed the new content
    const chunks = chunkText(record.text, 500);
    let indexedCount = 0;

    for (const chunk of chunks) {
      const embedding = await generateEmbedding(chunk.text, LOVABLE_API_KEY);
      
      if (!embedding) {
        console.error(`Failed to generate embedding for chunk ${chunk.index}`);
        continue;
      }

      const { error: insertError } = await supabase
        .from("vector_embeddings")
        .insert({
          tenant_id,
          namespace_key: buildNamespaceKey(tenant_id, source_type, record_id),
          source_type,
          record_id,
          record_label: record.label,
          chunk_index: chunk.index,
          chunk_text: chunk.text,
          token_count: chunk.tokenCount,
          embedding,
          mode_allowed: record.mode || "compliance",
          metadata: record.metadata || {},
          last_updated_at: new Date().toISOString(),
        });

      if (!insertError) indexedCount++;
    }

    // Log the update
    await supabase.from("vector_index_logs").insert({
      tenant_id,
      action: "update",
      source_type,
      record_id,
      records_affected: indexedCount,
      performed_by: user.id,
      metadata: { chunks_created: chunks.length },
    });

    return jsonOk({
      message: `Updated index for ${source_type}:${record_id}`,
      chunksIndexed: indexedCount,
    });

  } catch (err) {
    console.error("Vector index update error:", err);
    return jsonError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
});

/**
 * Fetch a specific record for indexing
 */
async function fetchRecord(
  supabase: any,
  tenantId: number,
  sourceType: string,
  recordId: string
): Promise<{ id: string; label: string; text: string; mode: string; metadata: any } | null> {
  try {
    switch (sourceType) {
      case "client_summary": {
        const { data } = await supabase
          .from("tenants")
          .select("id, name, status, rto_id, risk_level, abn")
          .eq("id", parseInt(recordId))
          .single();
        
        if (!data) return null;
        return {
          id: String(data.id),
          label: data.name || `Tenant ${data.id}`,
          text: buildClientSummary(data),
          mode: "compliance",
          metadata: { rto_id: data.rto_id, risk_level: data.risk_level },
        };
      }

      case "phase_summary": {
        const { data } = await supabase
          .from("documents_stages")
          .select("id, title, status, stage_type")
          .eq("id", parseInt(recordId))
          .eq("tenant_id", tenantId)
          .single();
        
        if (!data) return null;
        return {
          id: String(data.id),
          label: data.title,
          text: buildPhaseSummary(data),
          mode: "compliance",
          metadata: { stage_type: data.stage_type, status: data.status },
        };
      }

      case "task": {
        const { data } = await supabase
          .from("tasks")
          .select("id, task_name, status, description, due_date_text, priority")
          .eq("id", recordId)
          .eq("tenant_id", tenantId)
          .single();
        
        if (!data) return null;
        return {
          id: data.id,
          label: data.task_name,
          text: buildTaskSummary(data),
          mode: "compliance",
          metadata: { status: data.status, priority: data.priority },
        };
      }

      case "document_metadata": {
        const { data } = await supabase
          .from("documents")
          .select("id, title, category, is_released, uploaded_at")
          .eq("id", parseInt(recordId))
          .eq("tenant_id", tenantId)
          .single();
        
        if (!data) return null;
        return {
          id: String(data.id),
          label: data.title,
          text: buildDocumentSummary(data),
          mode: "compliance",
          metadata: { category: data.category, is_released: data.is_released },
        };
      }

      case "consult_log": {
        const { data } = await supabase
          .from("time_entries")
          .select("id, start_time, notes, duration_minutes, work_type")
          .eq("id", recordId)
          .eq("tenant_id", tenantId)
          .single();
        
        if (!data) return null;
        return {
          id: data.id,
          label: `Consult ${new Date(data.start_time).toLocaleDateString()}`,
          text: buildConsultSummary({
            id: data.id,
            date: new Date(data.start_time).toLocaleDateString(),
            purpose: data.work_type,
            outcomes: data.notes,
            duration_minutes: data.duration_minutes,
          }),
          mode: "compliance",
          metadata: { work_type: data.work_type },
        };
      }

      default:
        return null;
    }
  } catch (err) {
    console.error(`Error fetching record ${sourceType}:${recordId}:`, err);
    return null;
  }
}

/**
 * Generate embedding using Lovable AI
 */
async function generateEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Embedding API error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || null;
  } catch (err) {
    console.error("Embedding generation error:", err);
    return null;
  }
}

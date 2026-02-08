/**
 * Vector Index Rebuild Edge Function
 * 
 * Rebuilds the vector index for a tenant.
 * Requires SuperAdmin role.
 * 
 * POST /vector-index-rebuild
 * Body: { tenant_id: number, source_types?: string[] }
 */

import { createServiceClient } from "../_shared/supabase-client.ts";
import { extractToken, verifyAuth, checkSuperAdmin, UserProfile } from "../_shared/auth-helpers.ts";
import { jsonOk, jsonError } from "../_shared/response-helpers.ts";
import { validateAskVivAccess, askVivAccessDeniedResponse } from "../_shared/ask-viv-access.ts";
import {
  buildClientSummary,
  buildPhaseSummary,
  buildTaskSummary,
  buildDocumentSummary,
  buildConsultSummary,
  chunkText,
  buildNamespaceKey,
  IndexResult,
} from "../_shared/vector-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": 
    "authorization, x-client-info, apikey, content-type, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_SOURCE_TYPES = [
  "client_summary",
  "phase_summary", 
  "task",
  "consult_log",
  "document_metadata",
];

interface RequestPayload {
  tenant_id: number;
  source_types?: string[];
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

    // Validate Ask Viv access - Vivacity internal only
    const accessCheck = await validateAskVivAccess(supabase, user.id, profile, "vector-index-rebuild");
    if (!accessCheck.allowed) {
      return askVivAccessDeniedResponse(accessCheck.reason);
    }

    // Only SuperAdmins can rebuild indexes
    if (!checkSuperAdmin(profile)) {
      return jsonError(403, "FORBIDDEN", "Super Admin access required");
    }

    // Parse request
    let payload: RequestPayload;
    try {
      payload = await req.json();
    } catch {
      return jsonError(400, "BAD_REQUEST", "Invalid JSON body");
    }

    const { tenant_id, source_types } = payload;
    
    if (!tenant_id || typeof tenant_id !== "number") {
      return jsonError(400, "BAD_REQUEST", "tenant_id is required");
    }

    const typesToIndex = source_types?.filter(t => VALID_SOURCE_TYPES.includes(t)) 
      || VALID_SOURCE_TYPES;

    console.log(`Starting index rebuild for tenant ${tenant_id}, types: ${typesToIndex.join(", ")}`);

    // Get embedding API key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonError(500, "CONFIG_ERROR", "Embedding API not configured");
    }

    const result: IndexResult = {
      success: true,
      recordsIndexed: 0,
      recordsRemoved: 0,
      errors: [],
    };

    // Delete existing embeddings for selected types
    const { count: deletedCount } = await supabase
      .from("vector_embeddings")
      .delete({ count: "exact" })
      .eq("tenant_id", tenant_id)
      .in("source_type", typesToIndex);

    result.recordsRemoved = deletedCount || 0;
    console.log(`Deleted ${result.recordsRemoved} existing embeddings`);

    // Index each source type
    for (const sourceType of typesToIndex) {
      try {
        const indexed = await indexSourceType(
          supabase,
          tenant_id,
          sourceType,
          LOVABLE_API_KEY
        );
        result.recordsIndexed += indexed;
      } catch (err) {
        const errMsg = `Error indexing ${sourceType}: ${err instanceof Error ? err.message : String(err)}`;
        console.error(errMsg);
        result.errors.push(errMsg);
      }
    }

    // Log the action
    await supabase.from("vector_index_logs").insert({
      tenant_id,
      action: "rebuild",
      records_affected: result.recordsIndexed,
      performed_by: user.id,
      metadata: {
        source_types: typesToIndex,
        records_removed: result.recordsRemoved,
        errors: result.errors,
      },
    });

    result.success = result.errors.length === 0;

    return jsonOk({
      message: `Index rebuild complete for tenant ${tenant_id}`,
      ...result,
    });

  } catch (err) {
    console.error("Vector index rebuild error:", err);
    return jsonError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
});

/**
 * Index a specific source type for a tenant
 */
async function indexSourceType(
  supabase: any,
  tenantId: number,
  sourceType: string,
  apiKey: string
): Promise<number> {
  let records: any[] = [];

  switch (sourceType) {
    case "client_summary":
      records = await fetchClientSummaries(supabase, tenantId);
      break;
    case "phase_summary":
      records = await fetchPhaseSummaries(supabase, tenantId);
      break;
    case "task":
      records = await fetchTasks(supabase, tenantId);
      break;
    case "document_metadata":
      records = await fetchDocuments(supabase, tenantId);
      break;
    case "consult_log":
      records = await fetchConsultLogs(supabase, tenantId);
      break;
    default:
      console.log(`Unknown source type: ${sourceType}`);
      return 0;
  }

  if (records.length === 0) {
    console.log(`No records found for ${sourceType}`);
    return 0;
  }

  console.log(`Processing ${records.length} records for ${sourceType}`);

  let indexedCount = 0;

  for (const record of records) {
    try {
      const chunks = chunkText(record.text, 500);
      
      for (const chunk of chunks) {
        // Generate embedding
        const embedding = await generateEmbedding(chunk.text, apiKey);
        
        if (!embedding) {
          console.error(`Failed to generate embedding for ${sourceType}:${record.id}`);
          continue;
        }

        // Insert embedding
        const { error: insertError } = await supabase
          .from("vector_embeddings")
          .upsert({
            tenant_id: tenantId,
            namespace_key: buildNamespaceKey(tenantId, sourceType, record.id),
            source_type: sourceType,
            record_id: String(record.id),
            record_label: record.label,
            chunk_index: chunk.index,
            chunk_text: chunk.text,
            token_count: chunk.tokenCount,
            embedding,
            mode_allowed: record.mode || "compliance",
            metadata: record.metadata || {},
            last_updated_at: new Date().toISOString(),
          }, {
            onConflict: "tenant_id,source_type,record_id,chunk_index",
          });

        if (insertError) {
          console.error(`Insert error for ${sourceType}:${record.id}:`, insertError);
        } else {
          indexedCount++;
        }
      }
    } catch (err) {
      console.error(`Error processing record ${record.id}:`, err);
    }
  }

  return indexedCount;
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

// ============= Data Fetchers =============

async function fetchClientSummaries(supabase: any, tenantId: number) {
  const { data } = await supabase
    .from("tenants")
    .select("id, name, status, rto_id, risk_level, abn")
    .eq("id", tenantId)
    .limit(1);

  if (!data || data.length === 0) return [];

  return data.map((t: any) => ({
    id: t.id,
    label: t.name || `Tenant ${t.id}`,
    text: buildClientSummary(t),
    mode: "compliance" as const,
    metadata: { rto_id: t.rto_id, risk_level: t.risk_level },
  }));
}

async function fetchPhaseSummaries(supabase: any, tenantId: number) {
  const { data } = await supabase
    .from("documents_stages")
    .select("id, title, status, stage_type")
    .eq("tenant_id", tenantId)
    .limit(100);

  if (!data) return [];

  return data.map((p: any) => ({
    id: p.id,
    label: p.title,
    text: buildPhaseSummary(p),
    mode: "compliance" as const,
    metadata: { stage_type: p.stage_type, status: p.status },
  }));
}

async function fetchTasks(supabase: any, tenantId: number) {
  const { data } = await supabase
    .from("tasks")
    .select("id, task_name, status, description, due_date_text, priority")
    .eq("tenant_id", tenantId)
    .limit(200);

  if (!data) return [];

  return data.map((t: any) => ({
    id: t.id,
    label: t.task_name,
    text: buildTaskSummary(t),
    mode: "compliance" as const,
    metadata: { status: t.status, priority: t.priority },
  }));
}

async function fetchDocuments(supabase: any, tenantId: number) {
  const { data } = await supabase
    .from("documents")
    .select("id, title, category, is_released, uploaded_at")
    .eq("tenant_id", tenantId)
    .limit(200);

  if (!data) return [];

  return data.map((d: any) => ({
    id: d.id,
    label: d.title,
    text: buildDocumentSummary(d),
    mode: "compliance" as const,
    metadata: { category: d.category, is_released: d.is_released },
  }));
}

async function fetchConsultLogs(supabase: any, tenantId: number) {
  // Using time_entries as consult logs
  const { data } = await supabase
    .from("time_entries")
    .select("id, start_time, notes, duration_minutes, work_type")
    .eq("tenant_id", tenantId)
    .eq("is_billable", true)
    .limit(100);

  if (!data) return [];

  return data.map((c: any) => ({
    id: c.id,
    label: `Consult ${new Date(c.start_time).toLocaleDateString()}`,
    text: buildConsultSummary({
      id: c.id,
      date: new Date(c.start_time).toLocaleDateString(),
      purpose: c.work_type,
      outcomes: c.notes,
      duration_minutes: c.duration_minutes,
    }),
    mode: "compliance" as const,
    metadata: { work_type: c.work_type },
  }));
}

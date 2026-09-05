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
import { extractToken, verifyAuth } from "../_shared/auth-helpers.ts";
import { jsonOk, jsonError } from "../_shared/response-helpers.ts";
import { requireCallerByUserId, FeatureKeys } from "../_shared/requireCaller.ts";
import { validateAskVivAccess, askVivAccessDeniedResponse } from "../_shared/ask-viv-access.ts";
import { generateEmbedding as generateEmbeddingShared } from "../_shared/openai-embeddings.ts";
import { corsHeaders } from "../_shared/cors.ts";
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

interface IndexRecord { id: string | number; label: string; text: string; mode?: string; metadata?: Record<string, unknown>; }
interface TenantRow { id: number; name: string | null; status: string | null; rto_id: number | null; risk_level: string | null; abn: string | null; }
interface StageRow { id: number; name: string; status: string | null; stage_type: string | null; }
interface TaskRow { id: number; task_name: string; status: string | null; description: string | null; due_date_text: string | null; priority: string | null; }
interface DocumentRow { id: number; title: string; category: string | null; is_released: boolean | null; uploaded_at: string | null; }
interface TimeEntryRow { id: number; start_time: string; notes: string | null; duration_minutes: number | null; work_type: string | null; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonError(req, 405, "METHOD_NOT_ALLOWED", "Only POST requests are accepted");
  }

  try {
    // Authenticate
    const token = extractToken(req);
    if (!token) {
      return jsonError(req, 401, "UNAUTHORIZED", "No authorization token provided");
    }

    const supabase = createServiceClient();
    const { user, profile, error: authError } = await verifyAuth(supabase, token);
    
    if (authError || !user || !profile) {
      return jsonError(req, 401, "UNAUTHORIZED", authError || "Authentication failed");
    }

    // Validate Ask Viv access - Vivacity internal only
    const accessCheck = await validateAskVivAccess(supabase, user.id, profile, "vector-index-rebuild");
    if (!accessCheck.allowed) {
      return askVivAccessDeniedResponse(accessCheck.reason);
    }

    const caller = await requireCallerByUserId(supabase, user, {
      featureKey: FeatureKeys.adminVector,
      headers: corsHeaders(req),
      errorStyle: "ok-code",
      forbiddenMessage: "Super Admin access required",
    });
    if (!caller.ok) return caller.response;

    // Parse request
    let payload: RequestPayload;
    try {
      payload = await req.json();
    } catch {
      return jsonError(req, 400, "BAD_REQUEST", "Invalid JSON body");
    }

    const { tenant_id, source_types } = payload;
    
    if (!tenant_id || typeof tenant_id !== "number") {
      return jsonError(req, 400, "BAD_REQUEST", "tenant_id is required");
    }

    const typesToIndex = source_types?.filter(t => VALID_SOURCE_TYPES.includes(t)) 
      || VALID_SOURCE_TYPES;

    console.log(`Starting index rebuild for tenant ${tenant_id}, types: ${typesToIndex.join(", ")}`);

    // Embedding key check (OpenAI direct via shared helper)
    if (!Deno.env.get("OPENAI_API_KEY")) {
      return jsonError(req, 500, "CONFIG_ERROR", "OPENAI_API_KEY not configured in edge function secrets");
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

    return jsonOk(req, {
      message: `Index rebuild complete for tenant ${tenant_id}`,
      ...result,
    });

  } catch (err) {
    console.error("Vector index rebuild error:", err);
    return jsonError(req, 500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
});

/**
 * Index a specific source type for a tenant
 */
async function indexSourceType(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: number,
  sourceType: string,
): Promise<number> {
  let records: IndexRecord[] = [];

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
        const embedding = await generateEmbedding(chunk.text);
        
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
 * Generate embedding via shared OpenAI direct helper.
 * Returns null on failure to preserve existing per-chunk error handling.
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    return await generateEmbeddingShared(text);
  } catch (err) {
    console.error("Embedding generation error:", err);
    return null;
  }
}

// ============= Data Fetchers =============

async function fetchClientSummaries(supabase: ReturnType<typeof createServiceClient>, tenantId: number): Promise<IndexRecord[]> {
  const { data } = await supabase
    .from("tenants")
    .select("id, name, status, rto_id, risk_level, abn")
    .eq("id", tenantId)
    .limit(1);

  if (!data || data.length === 0) return [];

  return (data as TenantRow[]).map((t) => ({
    id: t.id,
    label: t.name || `Tenant ${t.id}`,
    text: buildClientSummary(t),
    mode: "compliance" as const,
    metadata: { rto_id: t.rto_id, risk_level: t.risk_level },
  }));
}

async function fetchPhaseSummaries(supabase: ReturnType<typeof createServiceClient>, tenantId: number): Promise<IndexRecord[]> {
  const { data } = await supabase
    .from("stages")
    .select("id, name, status, stage_type")
    .limit(100);

  if (!data) return [];

  return (data as StageRow[]).map((p) => ({
    id: p.id,
    label: p.name,
    text: buildPhaseSummary(p),
    mode: "compliance" as const,
    metadata: { stage_type: p.stage_type, status: p.status },
  }));
}

async function fetchTasks(supabase: ReturnType<typeof createServiceClient>, tenantId: number): Promise<IndexRecord[]> {
  const { data } = await supabase
    .from("tasks")
    .select("id, task_name, status, description, due_date_text, priority")
    .eq("tenant_id", tenantId)
    .limit(200);

  if (!data) return [];

  return (data as TaskRow[]).map((t) => ({
    id: t.id,
    label: t.task_name,
    text: buildTaskSummary(t),
    mode: "compliance" as const,
    metadata: { status: t.status, priority: t.priority },
  }));
}

async function fetchDocuments(supabase: ReturnType<typeof createServiceClient>, tenantId: number): Promise<IndexRecord[]> {
  const { data } = await supabase
    .from("documents")
    .select("id, title, category, is_released, uploaded_at")
    .eq("tenant_id", tenantId)
    .limit(200);

  if (!data) return [];

  return (data as DocumentRow[]).map((d) => ({
    id: d.id,
    label: d.title,
    text: buildDocumentSummary(d),
    mode: "compliance" as const,
    metadata: { category: d.category, is_released: d.is_released },
  }));
}

async function fetchConsultLogs(supabase: ReturnType<typeof createServiceClient>, tenantId: number): Promise<IndexRecord[]> {
  // Using time_entries as consult logs
  const { data } = await supabase
    .from("time_entries")
    .select("id, start_time, notes, duration_minutes, work_type")
    .eq("tenant_id", tenantId)
    .eq("is_billable", true)
    .limit(100);

  if (!data) return [];

  return (data as TimeEntryRow[]).map((c) => ({
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

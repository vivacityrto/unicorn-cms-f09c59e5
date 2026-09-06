/**
 * Vector Search Edge Function
 * 
 * Performs semantic search across vector embeddings for a tenant.
 * Used by Ask Viv for retrieval-augmented generation.
 * 
 * POST /vector-search
 * Body: { tenant_id: number, query: string, mode: "knowledge" | "compliance", source_types?: string[], limit?: number }
 */

import { createServiceClient } from "../_shared/supabase-client.ts";
import { extractToken, verifyAuth, checkSuperAdmin, checkVivacityTeam } from "../_shared/auth-helpers.ts";
import { jsonOk, jsonError } from "../_shared/response-helpers.ts";
import { validateAskVivAccess, askVivAccessDeniedResponse } from "../_shared/ask-viv-access.ts";
import { generateEmbedding as generateEmbeddingShared } from "../_shared/openai-embeddings.ts";
import { corsHeaders } from "../_shared/cors.ts";
type ServiceClient = ReturnType<typeof createServiceClient>;
type VectorRpcRow = { id: string; source_type: string; record_id: string; record_label: string; chunk_text: string; similarity: number; metadata?: Record<string, unknown> | null };

interface RequestPayload {
  tenant_id: number;
  query: string;
  mode: "knowledge" | "compliance";
  source_types?: string[];
  limit?: number;
  similarity_threshold?: number;
}

interface SearchResult {
  id: string;
  source_type: string;
  record_id: string;
  record_label: string;
  chunk_text: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

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
    const accessCheck = await validateAskVivAccess(supabase, user.id, profile, "vector-search");
    if (!accessCheck.allowed) {
      return askVivAccessDeniedResponse(req, accessCheck.reason);
    }

    // Parse request
    let payload: RequestPayload;
    try {
      payload = await req.json();
    } catch {
      return jsonError(req, 400, "BAD_REQUEST", "Invalid JSON body");
    }

    const { 
      tenant_id, 
      query, 
      mode,
      source_types,
      limit = 10,
      similarity_threshold = 0.7 
    } = payload;
    
    if (!tenant_id || typeof tenant_id !== "number") {
      return jsonError(req, 400, "BAD_REQUEST", "tenant_id is required");
    }

    if (!query || typeof query !== "string") {
      return jsonError(req, 400, "BAD_REQUEST", "query is required");
    }

    if (!mode || !["knowledge", "compliance"].includes(mode)) {
      return jsonError(req, 400, "BAD_REQUEST", "mode must be 'knowledge' or 'compliance'");
    }

    // Validate tenant access
    const hasAccess = await validateTenantAccess(supabase, user.id, profile, tenant_id);
    if (!hasAccess) {
      return jsonError(req, 403, "FORBIDDEN", "You do not have access to this tenant");
    }

    // Generate query embedding via OpenAI direct
    if (!Deno.env.get("OPENAI_API_KEY")) {
      return jsonError(req, 500, "CONFIG_ERROR", "OPENAI_API_KEY not configured in edge function secrets");
    }

    let queryEmbedding: number[];
    try {
      queryEmbedding = await generateEmbeddingShared(query);
    } catch (err) {
      console.error("Embedding generation error:", err);
      return jsonError(req, 500, "EMBEDDING_ERROR", "Failed to generate query embedding");
    }

    // Perform vector search
    const { data: results, error: searchError } = await supabase.rpc(
      "search_vector_embeddings",
      {
        p_tenant_id: tenant_id,
        p_query_embedding: queryEmbedding,
        p_mode: mode,
        p_source_types: source_types || null,
        p_limit: Math.min(limit, 20),
        p_similarity_threshold: similarity_threshold,
      }
    );

    if (searchError) {
      console.error("Vector search error:", searchError);
      return jsonError(req, 500, "SEARCH_ERROR", "Failed to perform vector search");
    }

    const searchResults: SearchResult[] = (results as VectorRpcRow[] | null || []).map((r) => ({
      id: r.id,
      source_type: r.source_type,
      record_id: r.record_id,
      record_label: r.record_label,
      chunk_text: r.chunk_text,
      similarity: r.similarity,
      metadata: r.metadata || {},
    }));

    // Deduplicate by record_id (keep highest similarity)
    const deduped = deduplicateResults(searchResults);

    return jsonOk(req, {
      results: deduped,
      count: deduped.length,
      query_tokens: Math.ceil(query.length / 4),
    });

  } catch (err) {
    console.error("Vector search error:", err);
    return jsonError(req, 500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
});

/**
 * Validate tenant access
 */
async function validateTenantAccess(
  supabase: ServiceClient,
  userId: string,
  profile: Parameters<typeof checkSuperAdmin>[0],
  tenantId: number
): Promise<boolean> {
  // SuperAdmins and Vivacity Team have access to all tenants
  if (checkSuperAdmin(profile) || checkVivacityTeam(profile)) {
    return true;
  }

  // Check tenant_members for client users
  const { data } = await supabase
    .from("tenant_members")
    .select("id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .limit(1)
    .single();

  return !!data;
}

// Local generateEmbedding helper removed — replaced by shared
// _shared/openai-embeddings.ts which calls OpenAI directly. The Lovable
// AI Gateway no longer accepts embedding models.

/**
 * Deduplicate results by record_id, keeping highest similarity
 */
function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>();
  
  for (const result of results) {
    const key = `${result.source_type}:${result.record_id}`;
    const existing = seen.get(key);
    
    if (!existing || result.similarity > existing.similarity) {
      seen.set(key, result);
    }
  }
  
  return Array.from(seen.values()).sort((a, b) => b.similarity - a.similarity);
}

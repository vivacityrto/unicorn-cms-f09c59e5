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

    // Parse request
    let payload: RequestPayload;
    try {
      payload = await req.json();
    } catch {
      return jsonError(400, "BAD_REQUEST", "Invalid JSON body");
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
      return jsonError(400, "BAD_REQUEST", "tenant_id is required");
    }

    if (!query || typeof query !== "string") {
      return jsonError(400, "BAD_REQUEST", "query is required");
    }

    if (!mode || !["knowledge", "compliance"].includes(mode)) {
      return jsonError(400, "BAD_REQUEST", "mode must be 'knowledge' or 'compliance'");
    }

    // Validate tenant access
    const hasAccess = await validateTenantAccess(supabase, user.id, profile, tenant_id);
    if (!hasAccess) {
      return jsonError(403, "FORBIDDEN", "You do not have access to this tenant");
    }

    // Get embedding API key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonError(500, "CONFIG_ERROR", "Embedding API not configured");
    }

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query, LOVABLE_API_KEY);
    if (!queryEmbedding) {
      return jsonError(500, "EMBEDDING_ERROR", "Failed to generate query embedding");
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
      return jsonError(500, "SEARCH_ERROR", "Failed to perform vector search");
    }

    const searchResults: SearchResult[] = (results || []).map((r: any) => ({
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

    return jsonOk({
      results: deduped,
      count: deduped.length,
      query_tokens: Math.ceil(query.length / 4),
    });

  } catch (err) {
    console.error("Vector search error:", err);
    return jsonError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
});

/**
 * Validate tenant access
 */
async function validateTenantAccess(
  supabase: any,
  userId: string,
  profile: any,
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

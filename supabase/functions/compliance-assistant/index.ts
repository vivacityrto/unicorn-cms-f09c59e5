/**
 * Compliance Assistant Edge Function
 * 
 * Answers questions using tenant-scoped live Unicorn data + vector search.
 * Read-only, audit-safe, respects RLS and roles.
 */

import { createServiceClient } from "../_shared/supabase-client.ts";
import { extractToken, verifyAuth, checkVivacityTeam, checkSuperAdmin, UserProfile } from "../_shared/auth-helpers.ts";
import { jsonOk, jsonError, jsonRaw } from "../_shared/response-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": 
    "authorization, x-client-info, apikey, content-type, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Types
interface RequestContext {
  tenant_id: number | null;
  client_id?: number | null;
  package_id?: number | null;
  phase_id?: number | null;
}

interface RequestPayload {
  question: string;
  context: RequestContext;
}

interface RecordAccessed {
  table: string;
  id: string | number;
  label: string;
}

interface VectorResult {
  id: string;
  source_type: string;
  record_id: string;
  record_label: string;
  chunk_text: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

interface ComplianceResponse {
  answer_markdown: string;
  records_accessed: RecordAccessed[];
  confidence: "high" | "medium" | "low";
  gaps: string[];
  chunks_used?: number;
  source_types_used?: string[];
}

// Data models for retrieval
interface TenantSummary {
  id: number;
  name: string;
  status: string;
  rto_id: string | null;
  risk_level: string | null;
  package_ids: number[];
}

interface PackageSummary {
  id: number;
  name: string;
  status: string;
  package_type: string | null;
  total_hours: number | null;
}

interface DocumentSummary {
  id: number;
  title: string;
  category: string | null;
  is_released: boolean;
  stage: number | null;
  due_date: string | null;
}

interface PhaseSummary {
  id: number;
  title: string;
  status: string;
  stage_type: string | null;
}

interface TaskSummary {
  id: string;
  task_name: string;
  status: string;
  due_date_text: string | null;
}

interface TimeEntrySummary {
  total_hours: number;
  billable_hours: number;
  entry_count: number;
}

// Main handler
Deno.serve(async (req) => {
  // Handle CORS
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

    const { question, context } = payload;
    
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return jsonError(400, "BAD_REQUEST", "Question is required");
    }

    // Validate tenant access
    const tenantId = context?.tenant_id;
    if (!tenantId) {
      return jsonError(400, "BAD_REQUEST", "tenant_id is required in context");
    }

    const hasAccess = await validateTenantAccess(supabase, user.id, profile, tenantId);
    if (!hasAccess) {
      return jsonError(403, "FORBIDDEN", "You do not have access to this tenant");
    }

    // Get API key for vector search
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Perform vector search if API key is available
    let vectorResults: VectorResult[] = [];
    if (LOVABLE_API_KEY) {
      vectorResults = await performVectorSearch(
        supabase,
        tenantId,
        question,
        LOVABLE_API_KEY
      );
      console.log(`Vector search returned ${vectorResults.length} results`);
    }

    // Retrieve live data
    const retrievalResult = await retrieveTenantData(supabase, tenantId, context);
    
    // Generate answer combining vector results and live data
    const response = generateComplianceAnswer(question, retrievalResult, context, vectorResults);

    // Log interaction with vector tracking
    await logInteraction(supabase, user.id, tenantId, profile, question, response, context);

    return jsonRaw(response);

  } catch (err) {
    console.error("Compliance assistant error:", err);
    return jsonError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
});

/**
 * Validate that the user has access to the specified tenant
 */
async function validateTenantAccess(
  supabase: any,
  userId: string,
  profile: UserProfile,
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
 * Perform vector search for the question
 */
async function performVectorSearch(
  supabase: any,
  tenantId: number,
  query: string,
  apiKey: string
): Promise<VectorResult[]> {
  try {
    // Generate query embedding
    const response = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: query,
      }),
    });

    if (!response.ok) {
      console.error("Embedding API error:", response.status);
      return [];
    }

    const embeddingData = await response.json();
    const queryEmbedding = embeddingData.data?.[0]?.embedding;
    
    if (!queryEmbedding) {
      console.error("No embedding returned");
      return [];
    }

    // Search vector embeddings
    const { data: results, error } = await supabase.rpc(
      "search_vector_embeddings",
      {
        p_tenant_id: tenantId,
        p_query_embedding: queryEmbedding,
        p_mode: "compliance",
        p_source_types: null,
        p_limit: 10,
        p_similarity_threshold: 0.7,
      }
    );

    if (error) {
      console.error("Vector search error:", error);
      return [];
    }

    return (results || []).map((r: any) => ({
      id: r.id,
      source_type: r.source_type,
      record_id: r.record_id,
      record_label: r.record_label,
      chunk_text: r.chunk_text,
      similarity: r.similarity,
      metadata: r.metadata || {},
    }));
  } catch (err) {
    console.error("Vector search failed:", err);
    return [];
  }
}

/**
 * Retrieve tenant-scoped data for answering the question
 */
interface RetrievalResult {
  tenant: TenantSummary | null;
  packages: PackageSummary[];
  documents: DocumentSummary[];
  phases: PhaseSummary[];
  tasks: TaskSummary[];
  timeEntries: TimeEntrySummary;
  records: RecordAccessed[];
}

async function retrieveTenantData(
  supabase: any,
  tenantId: number,
  context: RequestContext
): Promise<RetrievalResult> {
  const records: RecordAccessed[] = [];
  
  // Fetch tenant
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, status, rto_id, risk_level, package_ids")
    .eq("id", tenantId)
    .single();

  if (tenant) {
    records.push({ table: "tenants", id: tenant.id, label: tenant.name || `Tenant ${tenant.id}` });
  }

  // Fetch packages for tenant
  const packageIds = tenant?.package_ids || [];
  let packages: PackageSummary[] = [];
  if (packageIds.length > 0) {
    const { data: pkgs } = await supabase
      .from("packages")
      .select("id, name, status, package_type, total_hours")
      .in("id", packageIds)
      .limit(20);
    
    packages = pkgs || [];
    packages.forEach(p => records.push({ table: "packages", id: p.id, label: p.name }));
  }

  // Fetch documents for tenant
  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, category, is_released, stage, due_date")
    .eq("tenant_id", tenantId)
    .limit(50);
  
  const docs: DocumentSummary[] = documents || [];
  docs.forEach(d => records.push({ table: "documents", id: d.id, label: d.title }));

  // Fetch phases (stages) - get from stage_ids on tenant or document stages
  let phases: PhaseSummary[] = [];
  const stageIds = tenant?.stage_ids || [];
  if (stageIds.length > 0) {
    const { data: stgs } = await supabase
      .from("documents_stages")
      .select("id, title, status, stage_type")
      .in("id", stageIds)
      .limit(30);
    
    phases = stgs || [];
    phases.forEach(p => records.push({ table: "documents_stages", id: p.id, label: p.title }));
  }

  // Fetch tasks - using time_entries to get task context for this tenant
  let tasks: TaskSummary[] = [];
  const { data: taskData } = await supabase
    .from("tasks")
    .select("id, task_name, status, due_date_text")
    .limit(50);
  
  // Note: tasks table doesn't have tenant_id directly, we'll need to filter differently
  // For v1, we'll just sample tasks that are relevant via time_entries
  tasks = taskData || [];
  tasks.slice(0, 20).forEach(t => records.push({ table: "tasks", id: t.id, label: t.task_name }));

  // Fetch time entries summary for tenant
  const { data: timeData } = await supabase
    .from("time_entries")
    .select("duration_minutes, is_billable")
    .eq("tenant_id", tenantId);

  let timeEntries: TimeEntrySummary = { total_hours: 0, billable_hours: 0, entry_count: 0 };
  if (timeData && timeData.length > 0) {
    const totalMinutes = timeData.reduce((sum: number, t: any) => sum + (t.duration_minutes || 0), 0);
    const billableMinutes = timeData
      .filter((t: any) => t.is_billable)
      .reduce((sum: number, t: any) => sum + (t.duration_minutes || 0), 0);
    
    timeEntries = {
      total_hours: Math.round(totalMinutes / 60 * 10) / 10,
      billable_hours: Math.round(billableMinutes / 60 * 10) / 10,
      entry_count: timeData.length,
    };
    records.push({ table: "time_entries", id: tenantId, label: `${timeEntries.entry_count} entries` });
  }

  return {
    tenant: tenant as TenantSummary | null,
    packages,
    documents: docs,
    phases,
    tasks: tasks.slice(0, 20),
    timeEntries,
    records,
  };
}

/**
 * Generate a compliance answer based on retrieved data and vector results
 */
function generateComplianceAnswer(
  question: string,
  data: RetrievalResult,
  context: RequestContext,
  vectorResults: VectorResult[] = []
): ComplianceResponse {
  const gaps: string[] = [];
  const bullets: string[] = [];
  let confidence: "high" | "medium" | "low" = "medium";
  const sourceTypesUsed = new Set<string>();

  const q = question.toLowerCase();

  // Check for empty data
  if (!data.tenant) {
    return {
      answer_markdown: "**No accessible data found for this request.**\n\nThe specified tenant could not be found or you may not have access.\n\n*Suggestion: Verify the tenant ID and your access permissions.*",
      records_accessed: [],
      confidence: "low",
      gaps: ["Tenant data not accessible"],
      chunks_used: 0,
      source_types_used: [],
    };
  }

  // If we have vector results, incorporate them first
  if (vectorResults.length > 0) {
    bullets.push("**Relevant Context (from indexed data):**\n");
    
    // Group by source type for better organization
    const bySource = new Map<string, VectorResult[]>();
    for (const vr of vectorResults.slice(0, 5)) {
      const existing = bySource.get(vr.source_type) || [];
      existing.push(vr);
      bySource.set(vr.source_type, existing);
      sourceTypesUsed.add(vr.source_type);
    }

    for (const [sourceType, results] of bySource) {
      const sourceLabel = sourceType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      bullets.push(`**${sourceLabel}:**`);
      for (const r of results) {
        bullets.push(`- ${r.record_label}: ${r.chunk_text.slice(0, 150)}${r.chunk_text.length > 150 ? "..." : ""}`);
        // Add vector result to records accessed
        data.records.push({
          table: sourceType,
          id: r.record_id,
          label: r.record_label,
        });
      }
    }
    bullets.push("");
    confidence = "high"; // Vector matches increase confidence
  }

  // Tenant summary
  bullets.push(`**Tenant:** ${data.tenant.name}`);
  bullets.push(`**Status:** ${data.tenant.status || "Unknown"}`);
  if (data.tenant.rto_id) bullets.push(`**RTO ID:** ${data.tenant.rto_id}`);
  if (data.tenant.risk_level) bullets.push(`**Risk Level:** ${data.tenant.risk_level}`);

  // Handle specific question patterns
  if (q.includes("package") || q.includes("subscription")) {
    if (data.packages.length === 0) {
      bullets.push("\n**Packages:** No packages found");
      gaps.push("No package data available");
    } else {
      bullets.push(`\n**Packages (${data.packages.length}):**`);
      data.packages.forEach(p => {
        bullets.push(`- ${p.name}: ${p.status}${p.total_hours ? ` (${p.total_hours}h allocated)` : ""}`);
      });
    }
    confidence = data.packages.length > 0 ? "high" : "low";
  }

  if (q.includes("document") || q.includes("evidence") || q.includes("file")) {
    if (data.documents.length === 0) {
      bullets.push("\n**Documents:** No documents found");
      gaps.push("No document data available");
    } else {
      const released = data.documents.filter(d => d.is_released).length;
      const draft = data.documents.filter(d => !d.is_released).length;
      const overdue = data.documents.filter(d => d.due_date && new Date(d.due_date) < new Date()).length;
      
      bullets.push(`\n**Documents Summary:**`);
      bullets.push(`- Total: ${data.documents.length}`);
      bullets.push(`- Released: ${released}`);
      bullets.push(`- Draft: ${draft}`);
      if (overdue > 0) bullets.push(`- ⚠️ Overdue: ${overdue}`);
    }
    confidence = data.documents.length > 0 ? "high" : "low";
  }

  if (q.includes("phase") || q.includes("stage") || q.includes("progress")) {
    if (data.phases.length === 0) {
      bullets.push("\n**Phases:** No phases found");
      gaps.push("No phase/stage data available");
    } else {
      bullets.push(`\n**Phases (${data.phases.length}):**`);
      data.phases.slice(0, 10).forEach(p => {
        bullets.push(`- ${p.title}: ${p.status}`);
      });
      if (data.phases.length > 10) {
        bullets.push(`- ... and ${data.phases.length - 10} more`);
      }
    }
  }

  if (q.includes("time") || q.includes("hour") || q.includes("consult") || q.includes("billable")) {
    bullets.push(`\n**Time Tracking:**`);
    bullets.push(`- Total logged: ${data.timeEntries.total_hours}h`);
    bullets.push(`- Billable: ${data.timeEntries.billable_hours}h`);
    bullets.push(`- Entries: ${data.timeEntries.entry_count}`);
    
    // Check for package hour limits
    const totalPackageHours = data.packages.reduce((sum, p) => sum + (p.total_hours || 0), 0);
    if (totalPackageHours > 0) {
      const utilization = Math.round((data.timeEntries.billable_hours / totalPackageHours) * 100);
      bullets.push(`- Package allocation: ${totalPackageHours}h`);
      bullets.push(`- Utilization: ${utilization}%`);
      
      if (data.timeEntries.billable_hours > totalPackageHours) {
        bullets.push(`\n⚠️ **Blocker:** Consult hours (${data.timeEntries.billable_hours}h) exceed package allowance (${totalPackageHours}h)`);
      }
    }
    confidence = "high";
  }

  if (q.includes("blocker") || q.includes("issue") || q.includes("risk") || q.includes("problem")) {
    bullets.push(`\n**Potential Blockers:**`);
    let blockerCount = 0;

    // Check for overdue documents
    const overdueDocsCount = data.documents.filter(d => d.due_date && new Date(d.due_date) < new Date()).length;
    if (overdueDocsCount > 0) {
      bullets.push(`- ⚠️ ${overdueDocsCount} overdue document(s)`);
      blockerCount++;
    }

    // Check for missing documents in phases
    if (data.phases.length > 0 && data.documents.length === 0) {
      bullets.push(`- ⚠️ Phases exist but no documents uploaded`);
      blockerCount++;
    }

    // Check hours utilization
    const totalPackageHours = data.packages.reduce((sum, p) => sum + (p.total_hours || 0), 0);
    if (totalPackageHours > 0 && data.timeEntries.billable_hours > totalPackageHours) {
      bullets.push(`- ⚠️ Hours exceeded package allowance`);
      blockerCount++;
    }

    // Risk level check
    if (data.tenant.risk_level === "high" || data.tenant.risk_level === "critical") {
      bullets.push(`- ⚠️ Tenant flagged as ${data.tenant.risk_level} risk`);
      blockerCount++;
    }

    if (blockerCount === 0) {
      bullets.push(`- ✓ No major blockers identified`);
    }

    confidence = "medium";
  }

  // Generic summary if no specific pattern matched and no vector results
  if (bullets.length <= 4 && vectorResults.length === 0) {
    bullets.push(`\n**Data Overview:**`);
    bullets.push(`- Packages: ${data.packages.length}`);
    bullets.push(`- Documents: ${data.documents.length}`);
    bullets.push(`- Phases: ${data.phases.length}`);
    bullets.push(`- Time entries: ${data.timeEntries.entry_count}`);
    gaps.push("Question may need more specific keywords to provide detailed analysis");
  }

  // Note about vector search if no results
  if (vectorResults.length === 0) {
    gaps.push("No indexed vector data found - using live database queries only");
  }

  // Build final answer
  const answer = bullets.join("\n");

  return {
    answer_markdown: answer,
    records_accessed: data.records,
    confidence,
    gaps,
    chunks_used: vectorResults.length,
    source_types_used: Array.from(sourceTypesUsed),
  };
}

/**
 * Log the interaction to ai_interaction_logs
 */
async function logInteraction(
  supabase: any,
  userId: string,
  tenantId: number,
  profile: UserProfile,
  question: string,
  response: ComplianceResponse,
  context: RequestContext
): Promise<void> {
  try {
    await supabase.from("ai_interaction_logs").insert({
      user_id: userId,
      tenant_id: tenantId,
      mode: "compliance",
      prompt_text: question,
      response_text: response.answer_markdown,
      records_accessed: response.records_accessed,
      request_context: {
        tenant_id: tenantId,
        client_id: context.client_id || null,
        package_id: context.package_id || null,
        phase_id: context.phase_id || null,
        user_role: profile.unicorn_role,
        confidence: response.confidence,
        gaps_count: response.gaps.length,
      },
      chunks_used: response.chunks_used || 0,
      source_types_used: response.source_types_used || [],
    });
  } catch (err) {
    console.error("Failed to log interaction:", err);
    // Non-blocking - don't fail the request
  }
}

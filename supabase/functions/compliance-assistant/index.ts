/**
 * Compliance Assistant Edge Function
 * 
 * V2: Integrated with AI Brain architecture.
 * Uses structured facts, tiered reasoning, and governance controls.
 * Read-only, audit-safe, respects RLS and roles.
 */

import { createServiceClient } from "../_shared/supabase-client.ts";
import { extractToken, verifyAuth, checkVivacityTeam, checkSuperAdmin, UserProfile } from "../_shared/auth-helpers.ts";
import { jsonOk, jsonError, jsonRaw } from "../_shared/response-helpers.ts";
import { validateAskVivAccess, askVivAccessDeniedResponse } from "../_shared/ask-viv-access.ts";

// AI Brain imports
import {
  processAIBrainInput,
  buildSourceCitations,
  buildGovernanceInfo,
  formatEscalationsForPrompt,
  type AIContext,
  type FactSet,
  type ReasoningOutput,
  type ConfidenceResult,
  type DataForFacts,
  type ClientData,
  type PackageData,
  type PhaseData,
  type TaskData,
  type EvidenceData,
  type RiskData,
} from "../_shared/ai-brain/index.ts";

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
  // V2: AI Brain additions
  reasoning_tiers?: {
    tier: string;
    finding_count: number;
    critical_count: number;
  }[];
  escalation_count?: number;
  governance?: {
    read_only: boolean;
    human_action_required: boolean;
    caution_banners: string[];
  };
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

    // Validate Ask Viv access - Vivacity internal only
    const accessCheck = await validateAskVivAccess(supabase, user.id, profile, "compliance-assistant");
    if (!accessCheck.allowed) {
      return askVivAccessDeniedResponse(accessCheck.reason);
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

    // Retrieve data for AI Brain
    const dataForFacts = await retrieveDataForFacts(supabase, tenantId, context);
    
    // Process through AI Brain pipeline
    const brainResult = processAIBrainInput({
      user: { id: user.id },
      profile,
      tenant: dataForFacts.client ? {
        id: tenantId,
        name: dataForFacts.client.name,
        status: dataForFacts.client.status,
        rto_id: dataForFacts.client.rto_id,
        risk_level: dataForFacts.client.risk_level,
      } : null,
      scope: {
        client_id: context.client_id,
        package_id: context.package_id,
        phase_id: context.phase_id,
      },
      data: dataForFacts,
    });

    // Generate answer combining AI Brain reasoning, vector results, and question
    const response = generateBrainPoweredAnswer(
      question, 
      brainResult,
      vectorResults,
      context
    );

    // Log interaction with enhanced tracking
    await logInteraction(
      supabase, 
      user.id, 
      tenantId, 
      profile, 
      question, 
      response, 
      context,
      brainResult
    );

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
 * Retrieve data formatted for AI Brain fact builder
 */
async function retrieveDataForFacts(
  supabase: any,
  tenantId: number,
  context: RequestContext
): Promise<DataForFacts> {
  // Fetch tenant
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, status, rto_id, risk_level, package_ids, updated_at")
    .eq("id", tenantId)
    .single();

  const client: ClientData | undefined = tenant ? {
    id: tenant.id,
    name: tenant.name,
    status: tenant.status || "unknown",
    rto_id: tenant.rto_id,
    risk_level: tenant.risk_level,
    updated_at: tenant.updated_at,
  } : undefined;

  // Fetch packages
  const packageIds = tenant?.package_ids || [];
  let packages: PackageData[] = [];
  if (packageIds.length > 0) {
    const { data: pkgs } = await supabase
      .from("packages")
      .select("id, name, status, package_type, total_hours, used_hours, updated_at")
      .in("id", packageIds)
      .limit(20);
    
    packages = (pkgs || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      package_type: p.package_type,
      total_hours: p.total_hours,
      used_hours: p.used_hours,
      updated_at: p.updated_at,
    }));
  }

  // Fetch phases (stages)
  const { data: stagesData } = await supabase
    .from("documents_stages")
    .select("id, title, status, stage_type, due_date, updated_at")
    .limit(30);
  
  const phases: PhaseData[] = (stagesData || []).map((s: any) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    stage_type: s.stage_type,
    due_date: s.due_date,
    updated_at: s.updated_at,
  }));

  // Fetch tasks
  const { data: tasksData } = await supabase
    .from("tasks")
    .select("id, task_name, status, priority, due_date_text, updated_at")
    .limit(50);
  
  const tasks: TaskData[] = (tasksData || []).slice(0, 20).map((t: any) => ({
    id: t.id,
    task_name: t.task_name,
    status: t.status,
    priority: t.priority,
    due_date: t.due_date_text,
    updated_at: t.updated_at,
  }));

  // Fetch documents (evidence)
  const { data: docsData } = await supabase
    .from("documents")
    .select("id, title, category, is_released, updated_at")
    .eq("tenant_id", tenantId)
    .limit(50);
  
  const evidence: EvidenceData[] = (docsData || []).map((d: any) => ({
    id: d.id,
    title: d.title,
    status: d.category || "unknown",
    is_released: d.is_released,
    updated_at: d.updated_at,
  }));

  // Fetch risks/opportunities
  const { data: risksData } = await supabase
    .from("eos_issues")
    .select("id, item_type, title, status, impact, category")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .limit(20);
  
  const risks: RiskData[] = (risksData || []).map((r: any) => ({
    id: r.id,
    item_type: r.item_type,
    title: r.title,
    status: r.status,
    impact: r.impact,
    category: r.category,
  }));

  return {
    client,
    packages,
    phases,
    tasks,
    evidence,
    risks,
  };
}

/**
 * Generate answer using AI Brain reasoning
 */
function generateBrainPoweredAnswer(
  question: string,
  brainResult: {
    context: AIContext;
    factSet: FactSet;
    reasoning: ReasoningOutput;
    confidence: ConfidenceResult;
    contextPrompt: string;
    factsPrompt: string;
    reasoningPrompt: string;
  },
  vectorResults: VectorResult[],
  context: RequestContext
): ComplianceResponse {
  const gaps: string[] = [];
  const bullets: string[] = [];
  const sourceTypesUsed = new Set<string>();
  
  const q = question.toLowerCase();
  const { factSet, reasoning, confidence } = brainResult;

  // Build governance info
  const governance = buildGovernanceInfo(confidence, reasoning.escalation_triggers);

  // Add caution banner if needed
  if (governance.caution_banners.length > 0) {
    bullets.push(...governance.caution_banners.map(b => `**${b}**`));
    bullets.push("");
  }

  // Tenant context
  if (brainResult.context.tenant) {
    const t = brainResult.context.tenant;
    bullets.push(`**Tenant:** ${t.name}`);
    bullets.push(`**Status:** ${t.status}`);
    if (t.rto_id) bullets.push(`**RTO ID:** ${t.rto_id}`);
    if (t.risk_level) bullets.push(`**Risk Level:** ${t.risk_level}`);
    bullets.push("");
  }

  // Include vector results if available
  if (vectorResults.length > 0) {
    bullets.push("**Relevant Context (indexed):**");
    const bySource = new Map<string, VectorResult[]>();
    for (const vr of vectorResults.slice(0, 5)) {
      const existing = bySource.get(vr.source_type) || [];
      existing.push(vr);
      bySource.set(vr.source_type, existing);
      sourceTypesUsed.add(vr.source_type);
    }

    for (const [sourceType, results] of bySource) {
      const sourceLabel = sourceType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      bullets.push(`*${sourceLabel}:*`);
      for (const r of results) {
        bullets.push(`- ${r.record_label}: ${r.chunk_text.slice(0, 100)}...`);
      }
    }
    bullets.push("");
  }

  // Tier-based responses
  if (q.includes("status") || q.includes("overview") || q.includes("summary")) {
    bullets.push("**Current Status:**");
    const statusTier = reasoning.tiers.find(t => t.tier === "status");
    if (statusTier) {
      for (const finding of statusTier.findings.slice(0, 10)) {
        bullets.push(`- ${finding.summary}`);
      }
    }
    bullets.push("");
  }

  if (q.includes("blocker") || q.includes("block") || q.includes("stuck")) {
    bullets.push("**Blockers:**");
    const blockerTier = reasoning.tiers.find(t => t.tier === "blockers");
    if (blockerTier && blockerTier.findings.length > 0) {
      for (const finding of blockerTier.findings) {
        const icon = finding.severity === "critical" ? "🔴" : "⚠️";
        bullets.push(`${icon} ${finding.summary}`);
        if (finding.details) bullets.push(`  └─ ${finding.details}`);
      }
    } else {
      bullets.push("✅ No active blockers detected");
    }
    bullets.push("");
  }

  if (q.includes("risk") || q.includes("audit") || q.includes("compliance")) {
    bullets.push("**Risk Assessment:**");
    const riskTier = reasoning.tiers.find(t => t.tier === "risk");
    if (riskTier && riskTier.findings.length > 0) {
      for (const finding of riskTier.findings) {
        const icon = finding.severity === "critical" ? "🔴" : "⚠️";
        bullets.push(`${icon} ${finding.summary}`);
      }
    } else {
      bullets.push("✅ No elevated risk indicators");
    }
    bullets.push("");
  }

  if (q.includes("action") || q.includes("next") || q.includes("do")) {
    bullets.push("**Suggested Next Steps:**");
    const actionTier = reasoning.tiers.find(t => t.tier === "actions");
    if (actionTier && actionTier.findings.length > 0) {
      for (const finding of actionTier.findings) {
        bullets.push(`→ ${finding.summary}`);
      }
    } else {
      bullets.push("No immediate actions required");
    }
    bullets.push("");
  }

  // Add escalations if present
  if (reasoning.escalation_triggers.length > 0) {
    bullets.push("**⚠️ Escalation Alerts:**");
    for (const trigger of reasoning.escalation_triggers) {
      const icon = trigger.severity === "critical" ? "🚨" : "⚠️";
      bullets.push(`${icon} ${trigger.message}`);
      bullets.push(`  Action: ${trigger.suggested_action}`);
    }
    bullets.push("");
  }

  // Generic summary if no specific pattern matched
  if (bullets.length <= 6 && vectorResults.length === 0) {
    bullets.push("**Summary:**");
    bullets.push(reasoning.final_summary);
    bullets.push("");
  }

  // Confidence and review reminders
  bullets.push(`*Confidence: ${confidence.level.toUpperCase()}*`);
  if (governance.review_reminders.length > 0) {
    for (const reminder of governance.review_reminders) {
      bullets.push(`📋 ${reminder}`);
    }
  }

  // Gaps
  if (confidence.level !== "high") {
    gaps.push(confidence.explanation);
  }
  if (vectorResults.length === 0) {
    gaps.push("No indexed vector data - using live database only");
  }

  // Build source citations
  const citations = buildSourceCitations(factSet);
  const records: RecordAccessed[] = citations.map(c => ({
    table: c.table,
    id: c.id,
    label: c.label,
  }));

  // Add vector results to records
  for (const vr of vectorResults) {
    records.push({
      table: vr.source_type,
      id: vr.record_id,
      label: vr.record_label,
    });
  }

  return {
    answer_markdown: bullets.join("\n"),
    records_accessed: records,
    confidence: confidence.level,
    gaps,
    chunks_used: vectorResults.length,
    source_types_used: Array.from(sourceTypesUsed),
    reasoning_tiers: reasoning.tiers.map(t => ({
      tier: t.tier,
      finding_count: t.findings.length,
      critical_count: t.findings.filter(f => f.severity === "critical").length,
    })),
    escalation_count: reasoning.escalation_triggers.length,
    governance: {
      read_only: true,
      human_action_required: governance.human_action_required,
      caution_banners: governance.caution_banners,
    },
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
  context: RequestContext,
  brainResult?: {
    context: AIContext;
    factSet: FactSet;
    reasoning: ReasoningOutput;
    confidence: ConfidenceResult;
  }
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
        // V2: AI Brain tracking
        ai_brain_version: "2.0",
        reasoning_tiers: response.reasoning_tiers,
        escalation_count: response.escalation_count,
        fact_count: brainResult?.factSet.fact_count || 0,
        categories_analyzed: brainResult?.factSet.categories || [],
      },
      chunks_used: response.chunks_used || 0,
      source_types_used: response.source_types_used || [],
    });
  } catch (err) {
    console.error("Failed to log interaction:", err);
    // Non-blocking - don't fail the request
  }
}

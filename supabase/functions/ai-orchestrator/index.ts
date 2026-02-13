import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * AI Orchestrator Edge Function
 * 
 * Single entry point for all Phase 1 AI tasks.
 * Enforces tenancy, feature policy, schema validation, and audit logging.
 * 
 * Supported task types:
 *   - meeting_summary
 *   - doc_extract_tas
 *   - doc_extract_trainer_matrix
 *   - phase_completeness_check
 *   - risk_explain_v1
 * 
 * Every request writes to ai_events + ai_event_payloads.
 * No client-side model calls. No ai_event_payloads exposed to clients.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============= Task Type Registry =============

const ALLOWED_TASK_TYPES = [
  "meeting_summary",
  "doc_extract_tas",
  "doc_extract_trainer_matrix",
  "phase_completeness_check",
  "risk_explain_v1",
] as const;

type TaskType = typeof ALLOWED_TASK_TYPES[number];

// ============= Input Schemas =============

interface BasePayload {
  tenant_id: number;
  actor_user_id: string;
  task_type: TaskType;
  feature: string;
  model_name?: string;
  context?: Record<string, unknown>;
}

interface MeetingSummaryInput extends BasePayload {
  task_type: "meeting_summary";
  input: {
    meeting_id: string;
    transcript_text?: string;
    notes_text?: string;
  };
}

interface DocExtractTasInput extends BasePayload {
  task_type: "doc_extract_tas";
  input: {
    doc_file_id: string;
    extracted_text: string;
  };
}

interface DocExtractTrainerMatrixInput extends BasePayload {
  task_type: "doc_extract_trainer_matrix";
  input: {
    doc_file_id: string;
    extracted_text: string;
  };
}

interface PhaseCompletenessInput extends BasePayload {
  task_type: "phase_completeness_check";
  input: {
    package_id: number;
    phase_id: number;
  };
}

interface RiskExplainInput extends BasePayload {
  task_type: "risk_explain_v1";
  input: {
    risk_id: string;
    risk_type: string;
    risk_data: Record<string, unknown>;
  };
}

type OrchestratorPayload =
  | MeetingSummaryInput
  | DocExtractTasInput
  | DocExtractTrainerMatrixInput
  | PhaseCompletenessInput
  | RiskExplainInput;

// ============= Output Schemas =============

interface MeetingSummaryOutput {
  summary: string;
  action_items: Array<{ description: string; assignee?: string }>;
  key_decisions: string[];
  citations: Array<{ source: string; ref: string }>;
}

interface DocExtractTasOutput {
  units: Array<{
    unit_code: string;
    unit_title: string;
    elements: Array<{ element_text: string; performance_criteria: string[] }>;
  }>;
  citations: Array<{ doc_file_id: string; chunk_index: number }>;
}

interface DocExtractTrainerMatrixOutput {
  trainers: Array<{
    trainer_name: string;
    qualifications: string[];
    units_assigned: string[];
    currency_status: string;
  }>;
  citations: Array<{ doc_file_id: string; chunk_index: number }>;
}

interface PhaseCompletenessOutput {
  phase_id: number;
  completeness_pct: number;
  missing_items: Array<{ item: string; category: string; severity: string }>;
  is_complete: boolean;
}

interface RiskExplainOutput {
  risk_id: string;
  explanation: string;
  contributing_factors: string[];
  suggested_actions: string[];
  confidence: number;
}

type TaskOutput =
  | MeetingSummaryOutput
  | DocExtractTasOutput
  | DocExtractTrainerMatrixOutput
  | PhaseCompletenessOutput
  | RiskExplainOutput;

// ============= Schema Validators =============

/**
 * Validates output conforms to expected schema per task type.
 * Returns null if valid, or an error message string if invalid.
 */
function validateOutput(taskType: TaskType, output: unknown): string | null {
  if (!output || typeof output !== "object") {
    return "Output must be a non-null object";
  }

  const o = output as Record<string, unknown>;

  switch (taskType) {
    case "meeting_summary":
      if (typeof o.summary !== "string") return "meeting_summary: missing 'summary' string";
      if (!Array.isArray(o.action_items)) return "meeting_summary: missing 'action_items' array";
      if (!Array.isArray(o.key_decisions)) return "meeting_summary: missing 'key_decisions' array";
      if (!Array.isArray(o.citations)) return "meeting_summary: missing 'citations' array";
      return null;

    case "doc_extract_tas":
      if (!Array.isArray(o.units)) return "doc_extract_tas: missing 'units' array";
      if (!Array.isArray(o.citations)) return "doc_extract_tas: missing 'citations' array";
      return null;

    case "doc_extract_trainer_matrix":
      if (!Array.isArray(o.trainers)) return "doc_extract_trainer_matrix: missing 'trainers' array";
      if (!Array.isArray(o.citations)) return "doc_extract_trainer_matrix: missing 'citations' array";
      return null;

    case "phase_completeness_check":
      if (typeof o.phase_id !== "number") return "phase_completeness_check: missing 'phase_id' number";
      if (typeof o.completeness_pct !== "number") return "phase_completeness_check: missing 'completeness_pct' number";
      if (!Array.isArray(o.missing_items)) return "phase_completeness_check: missing 'missing_items' array";
      if (typeof o.is_complete !== "boolean") return "phase_completeness_check: missing 'is_complete' boolean";
      return null;

    case "risk_explain_v1":
      if (typeof o.risk_id !== "string") return "risk_explain_v1: missing 'risk_id' string";
      if (typeof o.explanation !== "string") return "risk_explain_v1: missing 'explanation' string";
      if (!Array.isArray(o.contributing_factors)) return "risk_explain_v1: missing 'contributing_factors' array";
      if (!Array.isArray(o.suggested_actions)) return "risk_explain_v1: missing 'suggested_actions' array";
      if (typeof o.confidence !== "number") return "risk_explain_v1: missing 'confidence' number";
      return null;

    default:
      return `Unknown task type: ${taskType}`;
  }
}

/**
 * Validates the incoming payload has required fields.
 */
function validatePayload(body: unknown): { valid: boolean; error?: string; payload?: OrchestratorPayload } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  if (!b.tenant_id || typeof b.tenant_id !== "number") {
    return { valid: false, error: "tenant_id (number) is required" };
  }

  if (!b.actor_user_id || typeof b.actor_user_id !== "string") {
    return { valid: false, error: "actor_user_id (string) is required" };
  }

  if (!b.task_type || typeof b.task_type !== "string") {
    return { valid: false, error: "task_type (string) is required" };
  }

  if (!ALLOWED_TASK_TYPES.includes(b.task_type as TaskType)) {
    return { valid: false, error: `task_type '${b.task_type}' is not allowed. Allowed: ${ALLOWED_TASK_TYPES.join(", ")}` };
  }

  if (!b.feature || typeof b.feature !== "string") {
    return { valid: false, error: "feature (string) is required" };
  }

  if (!b.input || typeof b.input !== "object") {
    return { valid: false, error: "input (object) is required" };
  }

  return { valid: true, payload: b as unknown as OrchestratorPayload };
}

// ============= Task Handlers (Stubs for Phase 1) =============

/**
 * Dispatches to the correct task handler.
 * Phase 1: these return structured tool-based context first,
 * then will call LLM in future prompts.
 * For now, returns placeholder output conforming to schemas.
 */
async function executeTask(
  _supabase: ReturnType<typeof createClient>,
  payload: OrchestratorPayload
): Promise<{ output: TaskOutput; model_name: string }> {
  const model = payload.model_name || "rules-v1";

  switch (payload.task_type) {
    case "meeting_summary":
      // Phase 1 stub: will integrate with transcript processing later
      return {
        model_name: model,
        output: {
          summary: "[Pending LLM integration]",
          action_items: [],
          key_decisions: [],
          citations: [],
        },
      };

    case "doc_extract_tas":
      // Phase 1 stub: will process chunked doc text
      return {
        model_name: model,
        output: {
          units: [],
          citations: [{ doc_file_id: payload.input.doc_file_id, chunk_index: 0 }],
        },
      };

    case "doc_extract_trainer_matrix":
      // Phase 1 stub: will extract trainer data from chunks
      return {
        model_name: model,
        output: {
          trainers: [],
          citations: [{ doc_file_id: payload.input.doc_file_id, chunk_index: 0 }],
        },
      };

    case "phase_completeness_check":
      // Phase 1: rules-based check against phase requirements
      return {
        model_name: "rules-v1",
        output: {
          phase_id: payload.input.phase_id,
          completeness_pct: 0,
          missing_items: [],
          is_complete: false,
        },
      };

    case "risk_explain_v1":
      // Phase 1: rules-first, AI explanation deferred
      return {
        model_name: "rules-v1",
        output: {
          risk_id: payload.input.risk_id,
          explanation: "[Rules-based risk assessment — AI explanation pending]",
          contributing_factors: [],
          suggested_actions: [],
          confidence: 0,
        },
      };
  }
}

// ============= Audit Logging =============

async function writeAuditEvent(
  supabase: ReturnType<typeof createClient>,
  params: {
    tenant_id: number;
    actor_user_id: string;
    feature: string;
    task_type: string;
    request_id: string;
    input_hash: string;
    context_hash: string;
    model_name: string;
    latency_ms: number;
    status: "success" | "blocked" | "error";
    confidence: number | null;
    request_json: unknown;
    context_json: unknown;
    response_json: unknown;
    citations_json: unknown;
    error_json: unknown;
  }
): Promise<void> {
  // Insert ai_event
  const { data: event, error: eventError } = await supabase
    .from("ai_events")
    .insert({
      tenant_id: params.tenant_id,
      actor_user_id: params.actor_user_id,
      feature: params.feature,
      task_type: params.task_type,
      request_id: params.request_id,
      input_hash: params.input_hash,
      context_hash: params.context_hash,
      model_name: params.model_name,
      latency_ms: params.latency_ms,
      status: params.status,
      confidence: params.confidence,
    })
    .select("ai_event_id")
    .single();

  if (eventError) {
    console.error("Failed to write ai_event:", eventError);
    return;
  }

  // Insert ai_event_payloads (1:1 with ai_event)
  const { error: payloadError } = await supabase
    .from("ai_event_payloads")
    .insert({
      ai_event_id: event.ai_event_id,
      request_json: params.request_json,
      context_json: params.context_json,
      response_json: params.response_json,
      citations_json: params.citations_json,
      error_json: params.error_json,
    });

  if (payloadError) {
    console.error("Failed to write ai_event_payloads:", payloadError);
  }
}

// ============= Utility =============

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ============= Input Size Limits =============

const MAX_INPUT_SIZES: Record<string, number> = {
  meeting_summary: 100_000,     // ~100K chars for transcripts
  doc_extract_tas: 200_000,     // ~200K chars for doc text
  doc_extract_trainer_matrix: 200_000,
  phase_completeness_check: 10_000,
  risk_explain_v1: 10_000,
};

function checkInputSize(taskType: string, input: unknown): string | null {
  const maxSize = MAX_INPUT_SIZES[taskType] || 50_000;
  const inputStr = JSON.stringify(input);
  if (inputStr.length > maxSize) {
    return `Input too large: ${inputStr.length} chars exceeds limit of ${maxSize} for ${taskType}`;
  }
  return null;
}

// ============= Feature Flag Mapping =============

const TASK_TO_FLAG: Record<string, string> = {
  meeting_summary: "ai_meeting_summary_enabled",
  doc_extract_tas: "ai_doc_extract_enabled",
  doc_extract_trainer_matrix: "ai_doc_extract_enabled",
  phase_completeness_check: "ai_phase_check_enabled",
  risk_explain_v1: "ai_risk_radar_enabled",
};

/**
 * Check if a feature is enabled for the given tenant.
 * Priority: tenant override > global app_settings.
 * SuperAdmins always have access (for testing).
 */
async function isFeatureEnabled(
  supabase: ReturnType<typeof createClient>,
  taskType: string,
  tenantId: number,
  userId: string
): Promise<{ enabled: boolean; reason?: string }> {
  const flagName = TASK_TO_FLAG[taskType];
  if (!flagName) return { enabled: false, reason: "Unknown task type" };

  // SuperAdmins bypass feature flags
  const { data: userData } = await supabase
    .from("users")
    .select("unicorn_role, global_role")
    .eq("user_uuid", userId)
    .single();

  if (userData) {
    const role = userData.unicorn_role || userData.global_role || "";
    if (role === "Super Admin" || role === "SuperAdmin") {
      return { enabled: true };
    }
  }

  // Check tenant-level override first
  const { data: override } = await supabase
    .from("ai_feature_overrides")
    .select("enabled")
    .eq("tenant_id", tenantId)
    .eq("flag_name", flagName)
    .maybeSingle();

  if (override) {
    return override.enabled
      ? { enabled: true }
      : { enabled: false, reason: `Feature ${flagName} is disabled for this tenant` };
  }

  // Fall back to global setting
  const { data: settings } = await supabase
    .from("app_settings")
    .select(flagName)
    .limit(1)
    .single();

  if (settings && (settings as any)[flagName] === true) {
    return { enabled: true };
  }

  return { enabled: false, reason: `Feature ${flagName} is globally disabled` };
}

// ============= Stale Data Warning =============

async function checkStaleData(
  supabase: ReturnType<typeof createClient>,
  tenantId: number
): Promise<{ isStale: boolean; daysSinceActivity: number }> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("audit_events")
    .select("*", { count: "exact", head: true })
    .gte("created_at", thirtyDaysAgo)
    .limit(1);

  if ((count || 0) > 0) {
    return { isStale: false, daysSinceActivity: 0 };
  }

  // Find last activity
  const { data: lastEvent } = await supabase
    .from("audit_events")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const daysSince = lastEvent
    ? Math.floor((Date.now() - new Date(lastEvent.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  return { isStale: true, daysSinceActivity: daysSince };
}

// ============= Main Handler =============

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startMs = Date.now();
  const requestId = crypto.randomUUID();

  try {
    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user JWT
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

    // Parse and validate payload
    const body = await req.json();
    const validation = validatePayload(body);

    if (!validation.valid || !validation.payload) {
      const latency = Date.now() - startMs;
      // Log blocked request
      await writeAuditEvent(supabase, {
        tenant_id: (body as any)?.tenant_id || 0,
        actor_user_id: user.id,
        feature: (body as any)?.feature || "unknown",
        task_type: (body as any)?.task_type || "unknown",
        request_id: requestId,
        input_hash: simpleHash(JSON.stringify(body)),
        context_hash: simpleHash(""),
        model_name: "none",
        latency_ms: latency,
        status: "blocked",
        confidence: null,
        request_json: body,
        context_json: null,
        response_json: null,
        citations_json: null,
        error_json: { validation_error: validation.error },
      });

      return new Response(
        JSON.stringify({ error: validation.error, request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = validation.payload;

    // Enforce actor matches authenticated user
    if (payload.actor_user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "actor_user_id must match authenticated user" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Feature flag check ----
    const featureCheck = await isFeatureEnabled(supabase, payload.task_type, payload.tenant_id, user.id);
    if (!featureCheck.enabled) {
      const latencyFf = Date.now() - startMs;
      await writeAuditEvent(supabase, {
        tenant_id: payload.tenant_id,
        actor_user_id: user.id,
        feature: payload.feature,
        task_type: payload.task_type,
        request_id: requestId,
        input_hash: simpleHash(JSON.stringify(payload.input)),
        context_hash: simpleHash(""),
        model_name: "none",
        latency_ms: latencyFf,
        status: "blocked",
        confidence: null,
        request_json: { input: payload.input },
        context_json: null,
        response_json: null,
        citations_json: null,
        error_json: { feature_disabled: featureCheck.reason },
      });

      return new Response(
        JSON.stringify({ error: featureCheck.reason, request_id: requestId }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Rate limiting ----
    const { data: rateLimitOk } = await supabase.rpc("check_ai_rate_limit", {
      p_user_id: user.id,
      p_tenant_id: payload.tenant_id,
      p_max_per_hour: 30,
      p_max_per_tenant_hour: 100,
    });

    if (rateLimitOk === false) {
      const latencyRl = Date.now() - startMs;
      await writeAuditEvent(supabase, {
        tenant_id: payload.tenant_id,
        actor_user_id: user.id,
        feature: payload.feature,
        task_type: payload.task_type,
        request_id: requestId,
        input_hash: simpleHash(JSON.stringify(payload.input)),
        context_hash: simpleHash(""),
        model_name: "none",
        latency_ms: latencyRl,
        status: "blocked",
        confidence: null,
        request_json: { input: payload.input },
        context_json: null,
        response_json: null,
        citations_json: null,
        error_json: { rate_limited: true },
      });

      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Try again later.", request_id: requestId }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Input size check ----
    const sizeError = checkInputSize(payload.task_type, payload.input);
    if (sizeError) {
      return new Response(
        JSON.stringify({ error: sizeError, request_id: requestId }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Stale data check ----
    let staleWarning: string | null = null;
    let confidenceCap: number | null = null;
    const staleCheck = await checkStaleData(supabase, payload.tenant_id);
    if (staleCheck.isStale) {
      staleWarning = `Warning: No activity detected in ${staleCheck.daysSinceActivity} days. Results may not reflect current state.`;
      // Cap confidence based on staleness
      if (staleCheck.daysSinceActivity > 60) confidenceCap = 0.3;
      else if (staleCheck.daysSinceActivity > 30) confidenceCap = 0.5;
    }

    // Execute task
    const { output, model_name } = await executeTask(supabase, payload);

    // Validate output schema server-side
    const outputError = validateOutput(payload.task_type, output);
    const latency = Date.now() - startMs;

    if (outputError) {
      // Schema validation failed — log as error
      await writeAuditEvent(supabase, {
        tenant_id: payload.tenant_id,
        actor_user_id: user.id,
        feature: payload.feature,
        task_type: payload.task_type,
        request_id: requestId,
        input_hash: simpleHash(JSON.stringify(payload.input)),
        context_hash: simpleHash(JSON.stringify(payload.context || {})),
        model_name,
        latency_ms: latency,
        status: "error",
        confidence: null,
        request_json: { input: payload.input },
        context_json: payload.context || null,
        response_json: output,
        citations_json: null,
        error_json: { schema_error: outputError },
      });

      return new Response(
        JSON.stringify({ error: "Output schema validation failed", detail: outputError, request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract citations if present
    const citations = (output as any).citations || null;

    // Apply confidence cap for stale data
    let finalConfidence = (output as any).confidence || null;
    if (confidenceCap !== null && finalConfidence !== null) {
      finalConfidence = Math.min(finalConfidence, confidenceCap);
    }

    // Success — log audit event
    await writeAuditEvent(supabase, {
      tenant_id: payload.tenant_id,
      actor_user_id: user.id,
      feature: payload.feature,
      task_type: payload.task_type,
      request_id: requestId,
      input_hash: simpleHash(JSON.stringify(payload.input)),
      context_hash: simpleHash(JSON.stringify(payload.context || {})),
      model_name,
      latency_ms: latency,
      status: "success",
      confidence: finalConfidence,
      request_json: { input: payload.input },
      context_json: payload.context || null,
      response_json: output,
      citations_json: citations,
      error_json: null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        request_id: requestId,
        task_type: payload.task_type,
        model_name,
        latency_ms: latency,
        confidence: finalConfidence,
        stale_warning: staleWarning,
        output,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const latency = Date.now() - startMs;
    console.error("ai-orchestrator error:", err);

    // Attempt to log the error
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await writeAuditEvent(supabase, {
        tenant_id: 0,
        actor_user_id: "system",
        feature: "ai-orchestrator",
        task_type: "unknown",
        request_id: requestId,
        input_hash: "",
        context_hash: "",
        model_name: "none",
        latency_ms: latency,
        status: "error",
        confidence: null,
        request_json: {},
        context_json: null,
        response_json: null,
        citations_json: null,
        error_json: { message: err instanceof Error ? err.message : String(err) },
      });
    } catch {
      // Audit logging itself failed — already logged to console
    }

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err), request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * client-insights: a short AI summary of how things are going, for the client portal's Home, Packages and Academy
 * pages.
 *
 * Read-only: nothing is stored or created. Who can call it, in order:
 *  1. a signed-in, active user (verifyAuth);
 *  2. a client user with exactly one active organisation, or Vivacity staff previewing one (validateClientAskVivAccess);
 *  3. an organisation that client AI is switched on for (rollout flag, fails closed);
 *  4. a person still inside today's token budget (shared with the client Ask Viv chat).
 *
 * The caller supplies only `surface` (home, packages or academy) and, for staff previewing, `preview_tenant_id`. The
 * organisation always comes from the access gate, never from the request. Every read uses the caller's own
 * (row-level-security) client, so Postgres, not this code, is the boundary between organisations. Facts are built
 * here, the model writes only words, and every number it returns is checked against the facts; a summary with a
 * number the data does not contain is dropped, never shown. No learner or staff names are sent to the model.
 */
import { createServiceClient, createUserClient } from "../_shared/supabase-client.ts";
import { extractToken, verifyAuth } from "../_shared/auth-helpers.ts";
import { jsonError, jsonOk } from "../_shared/response-helpers.ts";
import { validateClientAskVivAccess, askVivAccessDeniedResponse, clientAskVivDenialMessage, isVivacityInternal } from "../_shared/ask-viv-access.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { callAnthropic, extractToolUses, CLAUDE_HAIKU_MODEL } from "../_shared/anthropic-client.ts";
import { checkClientTokenBudget, isClientAiEnabledForTenant, recordClientTokens } from "../_shared/client-ai-limits.ts";
import {
  FORBIDDEN_BODY_FIELDS,
  SUMMARY_TOOL,
  SYSTEM_PROMPT,
  academySection,
  buildUserPrompt,
  factsText,
  feedSection,
  isGrounded,
  isSurface,
  packageSection,
  parseSummary,
  type AcademyInput,
  type FactSection,
  type PackageRow,
  type Surface,
} from "../_shared/client-insights.ts";

const AI_TIMEOUT_MS = 30_000;

interface Body {
  surface?: unknown;
  preview_tenant_id?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonError(req, 405, "METHOD_NOT_ALLOWED", "Only POST requests are accepted");

  try {
    const token = extractToken(req);
    if (!token) return jsonError(req, 401, "UNAUTHORIZED", "No authorization token provided");

    const supabase = createUserClient(req.headers.get("Authorization"));
    const { user, profile, error: authError } = await verifyAuth(supabase, token);
    if (authError || !user || !profile) return jsonError(req, 401, "UNAUTHORIZED", authError || "Authentication failed");

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return jsonError(req, 400, "BAD_REQUEST", "Invalid JSON body");
    }

    for (const forbidden of FORBIDDEN_BODY_FIELDS) {
      if (forbidden in (body as Record<string, unknown>)) {
        return jsonError(req, 400, "BAD_REQUEST", `Field '${forbidden}' is not allowed; scope is resolved server-side`);
      }
    }
    if (!isSurface(body.surface)) return jsonError(req, 400, "BAD_REQUEST", "surface must be home, packages or academy");
    const surface: Surface = body.surface;

    let previewTenantId: number | undefined;
    if ("preview_tenant_id" in body) {
      if (!isVivacityInternal(profile)) return jsonError(req, 400, "BAD_REQUEST", "Field 'preview_tenant_id' is not allowed");
      const id = Number(body.preview_tenant_id);
      if (!Number.isInteger(id) || id <= 0) return jsonError(req, 400, "BAD_REQUEST", "preview_tenant_id must be a positive integer");
      previewTenantId = id;
    }

    const access = await validateClientAskVivAccess(supabase, user.id, profile, "client-insights", previewTenantId);
    if (!access.allowed) return askVivAccessDeniedResponse(req, clientAskVivDenialMessage(access.reason));
    const tenantId = access.tenant_id;

    // app_settings and the usage table are staff-only or service-written, so these two reads use service role.
    const serviceClient = createServiceClient();
    if (!(await isClientAiEnabledForTenant(serviceClient, tenantId))) {
      return jsonError(req, 403, "NOT_ENABLED", "Viv summaries are not available for your account yet.");
    }
    const budget = await checkClientTokenBudget(serviceClient, user.id);
    if (!budget.withinCap) return jsonError(req, 429, "DAILY_LIMIT_REACHED", "You have reached today's limit for Viv. It resets tomorrow.");

    // Facts, read as the caller (row-level security), always for the gate-resolved organisation.
    const sections: FactSection[] = [];
    const today = new Date();

    if (surface === "home" || surface === "packages") {
      const { data, error } = await supabase.rpc("get_client_package_dashboard", { p_tenant_id: tenantId, p_package_instance_id: null });
      if (error) throw new Error(`package facts failed: ${error.message}`);
      sections.push(packageSection((data ?? []) as PackageRow[], today));
    }
    if (surface === "home") {
      const { data, error } = await supabase.from("v_client_home_feed").select("feed_section").eq("tenant_id", tenantId);
      if (!error) {
        const rows = (data ?? []) as Array<{ feed_section: string }>;
        sections.push(feedSection({ needsAttention: rows.filter((r) => r.feed_section === "needs_attention").length, comingUp: rows.filter((r) => r.feed_section === "coming_up").length }));
      }
    }
    if (surface === "academy" || surface === "home") {
      const { data, error } = await supabase.rpc("get_tenant_academy_learner_analytics", { p_tenant_id: tenantId });
      if (error) {
        // Only the organisation's main contacts may see Academy figures; on the Academy page that is a refusal,
        // on Home it just means the Academy line is left out.
        if (surface === "academy") return jsonError(req, 403, "NOT_AVAILABLE", "Academy figures are not available to you.");
      } else if (data) {
        const a = data as { totals: AcademyInput["totals"]; stalled?: unknown[] };
        sections.push(academySection({ totals: a.totals, stalledCount: Array.isArray(a.stalled) ? a.stalled.length : 0 }));
      }
    }

    const prompt = buildUserPrompt(surface, sections);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    let summary = null;
    let usage = { input_tokens: 0, output_tokens: 0 };
    try {
      const response = await callAnthropic({
        model: CLAUDE_HAIKU_MODEL,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
        tools: [SUMMARY_TOOL as unknown as { name: string; description: string; input_schema: Record<string, unknown> }],
        tool_choice: { type: "tool", name: SUMMARY_TOOL.name },
        // No temperature: current Claude models reject it.
        max_tokens: 600,
        signal: controller.signal,
      });
      usage = { input_tokens: response.usage?.input_tokens ?? 0, output_tokens: response.usage?.output_tokens ?? 0 };
      summary = parseSummary(extractToolUses(response)[0]?.input);
    } finally {
      clearTimeout(timer);
    }
    await recordClientTokens(serviceClient, user.id, usage.input_tokens, usage.output_tokens);

    if (!summary) return jsonError(req, 502, "NO_SUMMARY", "Viv could not write a summary. Please try again.");
    if (!isGrounded(summary, factsText(surface, sections))) {
      console.warn("[client-insights] dropped a summary containing a number that is not in the facts");
      return jsonError(req, 502, "UNGROUNDED", "Viv could not write a reliable summary just now.");
    }
    return jsonOk(req, { summary, surface, generated_at: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[client-insights] failure:", message);
    if (message.includes("ANTHROPIC_API_KEY is not configured")) return jsonError(req, 502, "AI_NOT_CONFIGURED", "The AI service is not configured.");
    if (message.includes("Anthropic API error: 429")) return jsonError(req, 429, "BUSY", "Viv is busy. Please try again in a minute.");
    if (message.includes("Anthropic API error: 529") || message.includes("Anthropic API error: 503") || (error instanceof Error && error.name === "AbortError")) {
      return jsonError(req, 503, "UNAVAILABLE", "Viv is not available right now. Please try again shortly.");
    }
    return jsonError(req, 500, "INTERNAL", "Viv could not write a summary. Please try again.");
  }
});

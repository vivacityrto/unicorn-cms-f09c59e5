/**
 * scorecard-insight
 *
 * "Ask Viv" for one scorecard measure: a short, plain-language read of what is behind this week's number,
 * why it may be happening, and what to do about it. Nothing is stored and nothing is created from the answer;
 * a person decides what to do with it.
 *
 * Auth: Vivacity staff only (`staff.ai.use`), checked before the body, the database or the AI is touched.
 * The only caller input used is a validated measure id and week; every fact the model sees is read here with
 * the service role. Learner names and email addresses are never sent, only business names, counts and the
 * owner and CSC names that appear on the scorecard.
 *
 * Body: { metric_id: uuid, week_key: "yyyy-mm-dd" (the Monday that starts the week) }
 * Responses:
 *   200 { insight, generated_at, model, week_key }
 *   400 { error }   missing or invalid input
 *   404 { error }   measure not found
 *   429 / 503       AI rate limit / AI busy
 *   502 { error }   AI not configured, or no usable answer
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { FeatureKeys, requireCaller } from "../_shared/requireCaller.ts";
import { CLAUDE_SONNET_MODEL, callAnthropic, extractToolUses } from "../_shared/anthropic-client.ts";
import {
  INSIGHT_TOOL,
  SYSTEM_PROMPT,
  buildUserPrompt,
  certificateSections,
  clientSections,
  parseInsight,
  type ClientFact,
  type FactSection,
  type HistoryPoint,
  type PreviousClientFact,
} from "../_shared/scorecard-insight.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TZ = "Australia/Sydney";
const HISTORY_WEEKS = 8;
const AI_TIMEOUT_MS = 45_000;

/** The automatic client measures that have a breakdown. Other measures get a read of their numbers alone. */
const CLIENT_KEYS = new Set([
  "cst_rtos_with_activity_pct",
  "cst_rtos_no_activity_count",
  "cst_client_activity_rate_pct",
  "cst_users_never_signed_in_count",
  "cst_certificates_issued_count",
]);

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sydneyDay(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const shortDate = (iso: string) => new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00Z`));
const fullName = (first: string | null, last: string | null) => `${first ?? ""} ${last ?? ""}`.trim() || null;

function weekLabel(weekKey: string): string {
  const end = addDays(weekKey, 6);
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", ...opts }).format(new Date(`${iso}T00:00:00Z`));
  return `${fmt(weekKey, { day: "numeric", month: "long" })} to ${fmt(end, { day: "numeric", month: "long", year: "numeric" })}`;
}

interface SnapshotRow {
  tenant_id: number;
  csc_user_id: string | null;
  client_users: number;
  active_users_28d: number;
  never_signed_in: number;
  certificates_week: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const caller = await requireCaller(req, admin, {
    featureKey: FeatureKeys.staffAi,
    headers: corsHeaders(req),
    unauthorizedMessage: "Unauthorized",
    forbiddenMessage: "Forbidden",
  });
  if (!caller.ok) return caller.response;

  let body: { metric_id?: unknown; week_key?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: "Send a JSON body with metric_id and week_key" });
  }
  const metricId = typeof body.metric_id === "string" ? body.metric_id : "";
  const weekKey = typeof body.week_key === "string" ? body.week_key : "";
  if (!UUID.test(metricId)) return json(req, 400, { error: "metric_id must be a valid id" });
  if (!DAY.test(weekKey) || new Date(`${weekKey}T00:00:00Z`).getUTCDay() !== 1) {
    return json(req, 400, { error: "week_key must be the Monday that starts the week, as yyyy-mm-dd" });
  }

  try {
    const { data: metric, error: metricError } = await admin
      .from("eos_scorecard_metrics")
      .select("id, name, description, category, unit, direction, target_value, metric_source, metric_key, owner_id, is_archived")
      .eq("id", metricId)
      .maybeSingle();
    if (metricError) throw metricError;
    if (!metric || metric.is_archived) return json(req, 404, { error: "Measure not found" });

    const firstWeek = addDays(weekKey, -7 * (HISTORY_WEEKS - 1));
    const { data: entryRows, error: entriesError } = await admin
      .from("eos_scorecard_entries")
      .select("week_ending, value, actual_value")
      .eq("metric_id", metricId)
      .gte("week_ending", firstWeek)
      .lte("week_ending", weekKey);
    if (entriesError) throw entriesError;
    const byWeek = new Map<string, number>();
    for (const e of entryRows ?? []) {
      const v = Number(e.actual_value ?? e.value);
      if (Number.isFinite(v)) byWeek.set(String(e.week_ending).slice(0, 10), v);
    }
    const history: HistoryPoint[] = Array.from({ length: HISTORY_WEEKS }, (_, i) => {
      const key = addDays(weekKey, -7 * (HISTORY_WEEKS - 1 - i));
      return { label: `week of ${shortDate(key)}`, value: byWeek.get(key) ?? null };
    });

    let ownerName: string | null = null;
    if (metric.owner_id) {
      const { data: owner, error: ownerError } = await admin.from("users").select("first_name, last_name").eq("user_uuid", metric.owner_id).maybeSingle();
      if (ownerError) throw ownerError;
      ownerName = owner ? fullName(owner.first_name, owner.last_name) : null;
    }

    const sections: FactSection[] = [];
    if (metric.metric_key && CLIENT_KEYS.has(metric.metric_key)) {
      const weekEnding = addDays(weekKey, 6);
      const { data: snap, error: snapError } = await admin
        .from("cst_scorecard_weekly_snapshot")
        .select("tenant_id, week_ending, csc_user_id, client_users, active_users_28d, never_signed_in, certificates_week")
        .in("week_ending", [weekEnding, addDays(weekEnding, -7)]);
      if (snapError) throw snapError;
      const thisWeek = (snap ?? []).filter((r) => String(r.week_ending).slice(0, 10) === weekEnding) as SnapshotRow[];
      const lastWeek = (snap ?? []).filter((r) => String(r.week_ending).slice(0, 10) !== weekEnding) as SnapshotRow[];

      const tenantIds = [...new Set(thisWeek.map((r) => r.tenant_id))];
      const cscIds = [...new Set(thisWeek.map((r) => r.csc_user_id).filter((id): id is string => !!id))];
      const [tenants, cscs, lastSeen] = await Promise.all([
        tenantIds.length ? admin.from("tenants").select("id, name").in("id", tenantIds) : Promise.resolve({ data: [], error: null }),
        cscIds.length ? admin.from("users").select("user_uuid, first_name, last_name").in("user_uuid", cscIds) : Promise.resolve({ data: [], error: null }),
        admin.rpc("cst_last_activity"),
      ]);
      if (tenants.error) throw tenants.error;
      if (cscs.error) throw cscs.error;
      const tenantName = new Map((tenants.data ?? []).map((t: { id: number; name: string }) => [t.id, t.name]));
      const cscName = new Map((cscs.data ?? []).map((u: { user_uuid: string; first_name: string | null; last_name: string | null }) => [u.user_uuid, fullName(u.first_name, u.last_name) ?? "a CSC"]));
      const lastActive = new Map<number, string>(((lastSeen.data ?? []) as { tenant_id: number; last_active_at: string }[]).map((r) => [r.tenant_id, r.last_active_at]));
      // If the last-activity read failed, say so rather than describing every client as never active.
      if (lastSeen.error) console.error("[scorecard-insight] cst_last_activity failed:", lastSeen.error.message);
      const activityKnown = !lastSeen.error;
      const now = Date.now();

      const facts: ClientFact[] = thisWeek.map((r) => {
        const seen = lastActive.get(r.tenant_id);
        return {
          name: tenantName.get(r.tenant_id) ?? "A client",
          csc: r.csc_user_id ? cscName.get(r.csc_user_id) ?? "a CSC" : "no CSC yet",
          clientUsers: r.client_users,
          activeUsers: r.active_users_28d,
          neverSignedIn: r.never_signed_in,
          certificates: r.certificates_week,
          lastActiveDays: !activityKnown ? undefined : seen ? Math.max(0, Math.floor((now - new Date(seen).getTime()) / 86_400_000)) : null,
        };
      });
      const previous: PreviousClientFact[] | null =
        lastWeek.length > 0 ? lastWeek.map((r) => ({ name: tenantName.get(r.tenant_id) ?? "A client", clientUsers: r.client_users, activeUsers: r.active_users_28d })) : null;
      sections.push(...clientSections(facts, previous));

      if (metric.metric_key === "cst_certificates_issued_count") {
        const from = addDays(weekEnding, -6);
        const { data: certs, error: certError } = await admin
          .from("academy_certificates")
          .select("course_id, tenant_id, issued_at")
          .is("revoked_at", null)
          .gte("issued_at", `${addDays(from, -1)}T00:00:00Z`)
          .lt("issued_at", `${addDays(weekEnding, 2)}T00:00:00Z`);
        if (certError) throw certError;
        const inWeek = (certs ?? []).filter((c) => {
          const day = sydneyDay(c.issued_at);
          return day >= from && day <= weekEnding && tenantName.has(c.tenant_id);
        });
        const courseIds = [...new Set(inWeek.map((c) => c.course_id))];
        const { data: courses, error: courseError } = courseIds.length ? await admin.from("academy_courses").select("id, title").in("id", courseIds) : { data: [], error: null };
        if (courseError) throw courseError;
        const title = new Map((courses ?? []).map((c: { id: string; title: string }) => [c.id, c.title]));
        sections.push(...certificateSections(inWeek.map((c) => ({ course: title.get(c.course_id) ?? "A course", client: tenantName.get(c.tenant_id) ?? "A client" }))));
      }
    } else {
      sections.push({ title: "Detail", lines: ["This number is typed in by hand. There is no breakdown behind it, only the recent numbers above."] });
    }

    const system = SYSTEM_PROMPT;
    const prompt = buildUserPrompt({
      measure: {
        name: metric.name,
        description: metric.description,
        category: metric.category ?? "Other",
        unit: metric.unit ?? "Count",
        direction: metric.direction ?? "higher_is_better",
        target: Number(metric.target_value),
        value: byWeek.get(weekKey) ?? null,
        source: metric.metric_source ?? "manual",
        ownerName,
      },
      weekLabel: weekLabel(weekKey),
      history,
      sections,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    let insight = null;
    try {
      const response = await callAnthropic({
        model: CLAUDE_SONNET_MODEL,
        system,
        messages: [{ role: "user", content: prompt }],
        tools: [INSIGHT_TOOL as unknown as { name: string; description: string; input_schema: Record<string, unknown> }],
        tool_choice: { type: "tool", name: INSIGHT_TOOL.name },
        // No temperature: the current Claude models reject it ("temperature is deprecated for this model") and the call fails.
        max_tokens: 1200,
        signal: controller.signal,
      });
      insight = parseInsight(extractToolUses(response)[0]?.input);
    } finally {
      clearTimeout(timer);
    }
    if (!insight) {
      console.error("[scorecard-insight] AI returned no usable read");
      return json(req, 502, { error: "Viv could not write a read of this measure. Please try again." });
    }
    return json(req, 200, { insight, generated_at: new Date().toISOString(), model: CLAUDE_SONNET_MODEL, week_key: weekKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[scorecard-insight] failure:", message);
    if (message.includes("ANTHROPIC_API_KEY is not configured")) return json(req, 502, { error: "The AI service is not configured." });
    if (message.includes("Anthropic API error: 429")) return json(req, 429, { error: "Viv is busy. Please try again in a minute." });
    if (message.includes("Anthropic API error: 529") || message.includes("Anthropic API error: 503") || (error instanceof Error && error.name === "AbortError")) {
      return json(req, 503, { error: "Viv is not available right now. Please try again shortly." });
    }
    return json(req, 500, { error: "Viv could not read this measure. Please try again." });
  }
});

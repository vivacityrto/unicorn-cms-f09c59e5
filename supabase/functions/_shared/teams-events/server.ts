/**
 * Server-side plumbing shared by the Teams event Edge Functions: caller
 * authorisation, service-role client, Graph client construction from the
 * dedicated TEAMS_EVENTS_* secrets, JSON responses and audit writes.
 *
 * Deno-only (reads Deno.env). Everything unit-testable lives in the sibling
 * dependency-free modules.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor, FeatureKeys, type RequireCallerOptions } from "../requireCaller.ts";
import { createTeamsGraphClient, type TeamsGraphClient } from "./graph-client.ts";
import { resolveTeamsGraphCredentials } from "./credentials.ts";
import type { ClassifiedGraphError } from "./graph-errors.ts";
import { sanitiseMessage } from "./graph-errors.ts";

export type AdminClient = SupabaseClient;

export function jsonResponse(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

export function errorResponse(req: Request, status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return jsonResponse(req, status, { error: message, code, ...extra });
}

export function createAdminClient(): AdminClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Options for the in-function gate. Every Teams event function calls
 * `requireCaller(req, admin, teamsEventsCallerOptions(req))` itself, so each
 * call is authorised server-side (never just in the UI): the caller must hold
 * `teams_events.manage_registrations` (Super Admin always passes).
 */
export function teamsEventsCallerOptions(req: Request): RequireCallerOptions {
  return {
    featureKey: FeatureKeys.teamsEventsManageRegistrations,
    minLevel: "full",
    headers: corsHeadersFor(req),
  };
}

/** Secret used to sign preview tokens. Server-only; never leaves the function. */
export function previewSigningSecret(): string {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

export function createGraphFromEnv(): { ok: true; client: TeamsGraphClient } | { ok: false; reason: "not_configured" } {
  // Reuses the existing SharePoint app's MICROSOFT_* credentials unless a
  // dedicated TEAMS_EVENTS_* set is configured (see credentials.ts).
  const credentials = resolveTeamsGraphCredentials((name) => Deno.env.get(name));
  if (!credentials) return { ok: false, reason: "not_configured" };
  return {
    ok: true,
    client: createTeamsGraphClient({
      tenantId: credentials.tenantId,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      preferredTimezone: Deno.env.get("TEAMS_EVENTS_PREFERRED_TIMEZONE") || undefined,
      preferredLanguage: Deno.env.get("TEAMS_EVENTS_PREFERRED_LANGUAGE") || undefined,
    }),
  };
}

export function notConfiguredResponse(req: Request): Response {
  return errorResponse(
    req,
    503,
    "not_configured",
    "The Teams event integration has not been configured yet. A Microsoft 365 administrator needs to finish the app registration.",
  );
}

/** Maps a classified Graph failure to a clear, secret-free HTTP response. */
export function graphErrorResponse(req: Request, error: ClassifiedGraphError): Response {
  const status = error.category === "throttling" ? 429 : error.category === "event_unavailable" ? 404 : 502;
  return errorResponse(req, status, error.category, error.message, { graph_code: error.code });
}

export interface AuditEntry {
  action: string;
  actorUserId: string;
  batchId: string;
  details: Record<string, unknown>;
}

/**
 * Privileged audit write (service role). Deliberately carries counts and
 * identifiers only — never the contact list (that lives in the secured items
 * table) and never Graph tokens or join URLs.
 */
export async function writeAudit(admin: AdminClient, entry: AuditEntry): Promise<void> {
  const { error } = await admin.from("client_audit_log").insert({
    tenant_id: null,
    actor_user_id: entry.actorUserId,
    action: entry.action,
    entity_type: "teams_event_registration_batch",
    entity_id: entry.batchId,
    details: entry.details,
  });
  if (error) {
    console.error("[teams-events] audit write failed", sanitiseMessage(error.message));
  }
}

export function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d{1,15}$/.test(value)) {
    const n = Number(value);
    return n > 0 ? n : null;
  }
  return null;
}

export function parseEventId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // Graph webinar ids look like "<guid>@<tenantGuid>"; keep a generous cap.
  if (trimmed.length === 0 || trimmed.length > 200 || !/^[A-Za-z0-9@._=-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Microsoft Graph client for Teams webinars (client-credentials grant).
 *
 * It authenticates as whichever Entra app `credentials.ts` selects: by default
 * the existing SharePoint app (MICROSOFT_* secrets, the same app
 * `_shared/graph-app-client.ts` uses), or a dedicated app when all three
 * TEAMS_EVENTS_* secrets are set. Token caching here is separate from
 * graph-app-client's, so the two never share state.
 *
 * Graph application permissions the app needs: VirtualEvent.Read.All,
 * VirtualEventRegistration-Anon.ReadWrite.All, plus a Teams application
 * access policy granted to each organiser (list/get return only webinars
 * whose organiser has been assigned the policy).
 *
 * This module is dependency-free (fetch/sleep are injected) so it is unit
 * tested in Node with a mocked Graph. It never logs tokens or secrets and
 * never returns a raw Graph body — failures come back as a
 * ClassifiedGraphError.
 */
import { classifyGraphError, type ClassifiedGraphError } from "./graph-errors.ts";
import type { GraphWebinar } from "./event-window.ts";

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/**
 * Registrant preferences sent with every app-only registration.
 * VERIFY IN THE LIVE TENANT before release: Microsoft's examples use Windows
 * zone names ("Pacific Standard Time") and lower-case language tags, so the
 * IANA id "Australia/Sydney" may be rejected.
 */
export const DEFAULT_PREFERRED_TIMEZONE = "AUS Eastern Standard Time";
export const DEFAULT_PREFERRED_LANGUAGE = "en-AU";

export interface TeamsGraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  preferredTimezone?: string;
  preferredLanguage?: string;
}

export interface TeamsGraphDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Upper bound for a single back-off wait. */
  maxDelayMs?: number;
  /** Total attempts per Graph call for transient failures (>= 1). */
  maxAttempts?: number;
}

export interface WebinarAttendee {
  firstName: string;
  lastName: string;
  email: string;
}

export interface RegistrationQuestion {
  id: string;
  displayName: string;
  isRequired: boolean;
}

export type GraphResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: ClassifiedGraphError };

export type RegisterResult =
  | { ok: true; registrationId: string | null; attempts: number }
  | { ok: false; error: ClassifiedGraphError; attempts: number };

const MAX_PAGES = 20;
const MAX_REGISTRATION_PAGES = 10;

export interface RegistrationCounts {
  registered: number;
  /** Waiting for approval or on the waitlist. */
  pending: number;
  /** True when the webinar has more registrations than we are willing to page through. */
  capped: boolean;
}
const TRANSIENT_STATUSES = new Set([0, 423, 429, 500, 502, 503, 504]);

/** Keep `@` literal in Graph ids ("guid@tenantId"), encode everything else. */
export function encodeGraphId(id: string): string {
  return encodeURIComponent(id).replace(/%40/g, "@");
}

function parseRetryAfterMs(headers: Headers | undefined): number | null {
  const raw = headers?.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function authFailure(status: number, body: unknown): ClassifiedGraphError {
  // AAD token errors carry an AADSTS code; surface only that, never the
  // description (it includes trace/correlation ids and tenant detail).
  const description =
    body && typeof body === "object" && typeof (body as { error_description?: unknown }).error_description === "string"
      ? (body as { error_description: string }).error_description
      : "";
  const aadsts = /AADSTS\d+/.exec(description)?.[0] ?? "";
  const classified = classifyGraphError(status === 0 ? 0 : 401, null);
  return {
    ...classified,
    category: status === 0 ? "temporary_failure" : "auth_or_consent",
    retryable: status === 0 || status === 429 || status >= 500,
    code: aadsts || classified.code,
  };
}

export function createTeamsGraphClient(config: TeamsGraphConfig, deps: TeamsGraphDeps = {}) {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxDelayMs = deps.maxDelayMs ?? 30_000;
  const maxAttempts = Math.max(1, deps.maxAttempts ?? 3);
  const preferredTimezone = config.preferredTimezone || DEFAULT_PREFERRED_TIMEZONE;
  const preferredLanguage = config.preferredLanguage || DEFAULT_PREFERRED_LANGUAGE;

  let cachedToken: { value: string; expiresAtMs: number } | null = null;

  async function getToken(forceRefresh = false): Promise<GraphResult<{ token: string }>> {
    if (!forceRefresh && cachedToken && Date.now() < cachedToken.expiresAtMs) {
      return { ok: true, token: cachedToken.value };
    }
    let response: Response;
    try {
      response = await doFetch(
        `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            scope: "https://graph.microsoft.com/.default",
            grant_type: "client_credentials",
          }),
        },
      );
    } catch {
      return { ok: false, error: authFailure(0, null) };
    }
    const body = await response.json().catch(() => null);
    const accessToken = body && typeof body === "object" ? (body as { access_token?: unknown }).access_token : null;
    if (!response.ok || typeof accessToken !== "string") {
      return { ok: false, error: authFailure(response.status, body) };
    }
    const expiresIn = Number((body as { expires_in?: unknown }).expires_in) || 3600;
    cachedToken = { value: accessToken, expiresAtMs: Date.now() + expiresIn * 1000 - 60_000 };
    return { ok: true, token: accessToken };
  }

  /**
   * One Graph call with: a single token refresh on 401, and capped retries
   * (Retry-After honoured, exponential back-off otherwise) for transient
   * failures only. Permanent errors return immediately.
   */
  async function graphCall(
    method: "GET" | "POST",
    url: string,
    body?: unknown,
  ): Promise<{ status: number; json: unknown; attempts: number; tokenError?: ClassifiedGraphError }> {
    let attempts = 0;
    let refreshed = false;
    for (;;) {
      attempts++;
      const token = await getToken(refreshed);
      if (!token.ok) return { status: 401, json: null, attempts, tokenError: token.error };

      let status = 0;
      let json: unknown = null;
      let retryAfterMs: number | null = null;
      try {
        const response = await doFetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token.token}`,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        status = response.status;
        retryAfterMs = parseRetryAfterMs(response.headers);
        json = await response.json().catch(() => null);
      } catch {
        status = 0;
      }

      if (status === 401 && !refreshed) {
        refreshed = true;
        cachedToken = null;
        attempts--; // a token refresh is not a Graph attempt
        continue;
      }
      if (TRANSIENT_STATUSES.has(status) && attempts < maxAttempts) {
        const backoff = Math.min(1000 * 2 ** (attempts - 1), maxDelayMs);
        await sleep(Math.min(retryAfterMs ?? backoff, maxDelayMs));
        continue;
      }
      return { status, json, attempts };
    }
  }

  async function listWebinars(): Promise<GraphResult<{ webinars: GraphWebinar[] }>> {
    const webinars: GraphWebinar[] = [];
    let url: string | null = `${GRAPH_BASE}/solutions/virtualEvents/webinars`;
    for (let page = 0; url && page < MAX_PAGES; page++) {
      const result = await graphCall("GET", url);
      if (result.tokenError) return { ok: false, error: result.tokenError };
      if (result.status < 200 || result.status >= 300) {
        return { ok: false, error: classifyGraphError(result.status, result.json) };
      }
      const payload = (result.json ?? {}) as { value?: unknown; "@odata.nextLink"?: unknown };
      if (Array.isArray(payload.value)) webinars.push(...(payload.value as GraphWebinar[]));
      const next = payload["@odata.nextLink"];
      // Only ever follow paging links that stay on Graph.
      url = typeof next === "string" && next.startsWith("https://graph.microsoft.com/") ? next : null;
    }
    return { ok: true, webinars };
  }

  async function getWebinar(webinarId: string): Promise<GraphResult<{ webinar: GraphWebinar }>> {
    const result = await graphCall("GET", `${GRAPH_BASE}/solutions/virtualEvents/webinars/${encodeGraphId(webinarId)}`);
    if (result.tokenError) return { ok: false, error: result.tokenError };
    if (result.status < 200 || result.status >= 300) {
      return { ok: false, error: classifyGraphError(result.status, result.json) };
    }
    return { ok: true, webinar: result.json as GraphWebinar };
  }

  /** Mandatory-question check (brief section 10). Endpoint to confirm live. */
  async function listRegistrationQuestions(
    webinarId: string,
  ): Promise<GraphResult<{ questions: RegistrationQuestion[] }>> {
    const result = await graphCall(
      "GET",
      `${GRAPH_BASE}/solutions/virtualEvents/webinars/${encodeGraphId(webinarId)}/registrationConfiguration/questions`,
    );
    if (result.tokenError) return { ok: false, error: result.tokenError };
    if (result.status < 200 || result.status >= 300) {
      return { ok: false, error: classifyGraphError(result.status, result.json) };
    }
    const value = (result.json as { value?: unknown } | null)?.value;
    const questions = Array.isArray(value)
      ? (value as Array<{ id?: unknown; displayName?: unknown; isRequired?: unknown }>).map((q) => ({
        id: String(q.id ?? ""),
        displayName: typeof q.displayName === "string" ? q.displayName : "",
        isRequired: q.isRequired === true,
      }))
      : [];
    return { ok: true, questions };
  }

  /**
   * App-only registration returns 204 No Content (no registration id), so
   * `registrationId` is null unless Graph ever returns a body.
   */
  async function registerWebinarAttendee(webinarId: string, attendee: WebinarAttendee): Promise<RegisterResult> {
    const result = await graphCall(
      "POST",
      `${GRAPH_BASE}/solutions/virtualEvents/webinars/${encodeGraphId(webinarId)}/registrations`,
      {
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        email: attendee.email,
        preferredTimezone,
        preferredLanguage,
      },
    );
    if (result.tokenError) return { ok: false, error: result.tokenError, attempts: result.attempts };
    if (result.status >= 200 && result.status < 300) {
      const id = (result.json as { id?: unknown } | null)?.id;
      return { ok: true, registrationId: typeof id === "string" ? id : null, attempts: result.attempts };
    }
    return { ok: false, error: classifyGraphError(result.status, result.json), attempts: result.attempts };
  }

  /**
   * Registrant counts for one webinar, for display only. Best effort: Microsoft
   * may refuse this call for the app (permission / policy), in which case the
   * caller shows "not available" and nothing else is affected. Pages are capped
   * so a very large webinar cannot hold the listing up.
   */
  async function countRegistrations(webinarId: string): Promise<GraphResult<RegistrationCounts>> {
    const counts: RegistrationCounts = { registered: 0, pending: 0, capped: false };
    let url: string | null =
      `${GRAPH_BASE}/solutions/virtualEvents/webinars/${encodeGraphId(webinarId)}/registrations?$top=100`;
    for (let page = 0; url; page++) {
      if (page >= MAX_REGISTRATION_PAGES) {
        counts.capped = true;
        break;
      }
      const result = await graphCall("GET", url);
      if (result.tokenError) return { ok: false, error: result.tokenError };
      if (result.status < 200 || result.status >= 300) {
        return { ok: false, error: classifyGraphError(result.status, result.json) };
      }
      const payload = (result.json ?? {}) as { value?: unknown; "@odata.nextLink"?: unknown };
      if (Array.isArray(payload.value)) {
        for (const row of payload.value as Array<{ status?: unknown }>) {
          const status = typeof row?.status === "string" ? row.status : "";
          if (status === "registered") counts.registered++;
          else if (status === "pendingApproval" || status === "waitlisted") counts.pending++;
        }
      }
      const next = payload["@odata.nextLink"];
      url = typeof next === "string" && next.startsWith("https://graph.microsoft.com/") ? next : null;
    }
    return { ok: true, ...counts };
  }

  return { getToken, listWebinars, getWebinar, listRegistrationQuestions, countRegistrations, registerWebinarAttendee };
}

export type TeamsGraphClient = ReturnType<typeof createTeamsGraphClient>;

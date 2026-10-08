/**
 * Microsoft Graph error classification (brief section 13.1).
 *
 * Every Graph failure is reduced to one of the brief's categories, a
 * retryability flag and a sanitised, operator-readable message. The raw
 * Graph body is never stored or shown: it can echo registrant emails,
 * request ids and (in the worst case) token fragments.
 */

export type GraphErrorCategory =
  | "auth_or_consent"
  | "organiser_access_policy"
  | "event_unavailable"
  | "required_answers_missing"
  | "invalid_contact_data"
  | "duplicate"
  | "throttling"
  | "temporary_failure"
  | "unknown";

export interface ClassifiedGraphError {
  category: GraphErrorCategory;
  /** Safe to retry automatically (transient). */
  retryable: boolean;
  /** HTTP status Graph returned (0 for network failures). */
  status: number;
  /** Graph error.code when present, else the category. */
  code: string;
  /** Sanitised message safe to store and display. */
  message: string;
}

/** Categories that apply to the whole event, not the individual person. */
export const EVENT_LEVEL_CATEGORIES: ReadonlySet<GraphErrorCategory> = new Set([
  "auth_or_consent",
  "organiser_access_policy",
  "event_unavailable",
]);

/**
 * Failed items in these categories are not worth retrying: the contact's own
 * data has to be fixed first. Everything else can be retried by the operator
 * once the underlying cause (consent, policy, event state) is resolved.
 */
export const NON_RETRYABLE_ITEM_CATEGORIES: ReadonlySet<GraphErrorCategory> = new Set([
  "invalid_contact_data",
]);

const FRIENDLY_MESSAGES: Record<GraphErrorCategory, string> = {
  auth_or_consent:
    "Microsoft rejected the Unicorn app credentials or its admin consent. A Microsoft 365 administrator needs to check the app registration.",
  organiser_access_policy:
    "The event's organiser has not been granted to the Unicorn app (application access policy). A Microsoft 365 administrator needs to grant it.",
  event_unavailable: "The event could not be found, is closed, or is no longer open for registration.",
  required_answers_missing:
    "This webinar has required registration questions that Unicorn cannot answer automatically.",
  invalid_contact_data: "Microsoft rejected this person's details (name or email).",
  duplicate: "This person is already registered for the event.",
  throttling: "Microsoft is rate-limiting requests. Retry in a few minutes.",
  temporary_failure: "Microsoft Teams had a temporary problem. Retry in a few minutes.",
  unknown: "Microsoft returned an unexpected response.",
};

/** Strip anything that looks like a credential before it is stored or shown. */
export function sanitiseMessage(input: unknown, maxLength = 300): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, "[redacted-token]")
    .replace(/(client_secret|access_token|refresh_token|password|secret)=([^&\s"']+)/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s"']*[?&](?:code|token|sig|signature|sv)=[^\s"']*/gi, "[redacted-url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function extractGraphError(body: unknown): { code: string; message: string } {
  if (body && typeof body === "object") {
    const error = (body as { error?: unknown }).error;
    if (error && typeof error === "object") {
      const e = error as { code?: unknown; message?: unknown };
      return {
        code: typeof e.code === "string" ? e.code : "",
        message: typeof e.message === "string" ? e.message : "",
      };
    }
  }
  return { code: "", message: "" };
}

export function classifyGraphError(status: number, body: unknown): ClassifiedGraphError {
  const { code, message } = extractGraphError(body);
  const text = `${code} ${message}`.toLowerCase();

  const build = (category: GraphErrorCategory, retryable: boolean): ClassifiedGraphError => ({
    category,
    retryable,
    status,
    code: sanitiseMessage(code, 80) || category,
    message: FRIENDLY_MESSAGES[category],
  });

  if (status === 429) return build("throttling", true);
  if (status === 423 || status === 500 || status === 502 || status === 503 || status === 504 || status === 0) {
    return build("temporary_failure", true);
  }
  if (status === 401) return build("auth_or_consent", false);
  if (status === 403) {
    if (text.includes("application access policy")) return build("organiser_access_policy", false);
    return build("auth_or_consent", false);
  }
  if (status === 404) return build("event_unavailable", false);
  if (status === 409 || /already\s+regist/.test(text)) return build("duplicate", false);
  if (status === 400 || status === 422) {
    if (/question|answer/.test(text)) return build("required_answers_missing", false);
    if (/email|firstname|lastname|first name|last name|invalid/.test(text)) {
      return build("invalid_contact_data", false);
    }
    if (/closed|cancel|not open|ended|unpublished|draft/.test(text)) return build("event_unavailable", false);
  }
  return build("unknown", false);
}

/**
 * Server-side email URL construction.
 *
 * Callers must never supply a whole destination URL. Known link slots
 * (task_url, meeting_url, dashboard_url, summary_url, invite_url,
 * action_link, redirect_to) are built as
 * `${APP_BASE_URL}/<known-path>/<validated-id>`.
 *
 * If a relative path is genuinely required, it is accepted only when it
 * starts with a single `/` and contains no `://`, leading `//`, or `\`.
 */

export const EMAIL_URL_KEYS = [
  "task_url",
  "meeting_url",
  "dashboard_url",
  "summary_url",
  "invite_url",
  "action_link",
  "redirect_to",
] as const;

export type EmailUrlKey = (typeof EMAIL_URL_KEYS)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSITIVE_INT_RE = /^[1-9]\d{0,17}$/;

export function defaultAppBaseUrl(): string {
  return "https://unicorn-cms.au";
}

export function normalizeAppBaseUrl(raw: string | undefined | null): string {
  const fallback = defaultAppBaseUrl();
  if (!raw || typeof raw !== "string") return fallback;
  const trimmed = raw.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    if (url.username || url.password) return fallback;
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

export function isSafeRelativePath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) {
    return false;
  }
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("://")) return false;
  if (path.includes("\\")) return false;
  if (path.includes("\0") || path.includes("\r") || path.includes("\n")) {
    return false;
  }
  return true;
}

export function validatedId(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) {
      return null;
    }
    return String(value);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (UUID_RE.test(trimmed) || POSITIVE_INT_RE.test(trimmed)) return trimmed;
  return null;
}

export function buildAppUrl(baseUrl: string, relativePath: string): string {
  if (!isSafeRelativePath(relativePath)) {
    throw new Error("Refusing to build an email URL from an unsafe path");
  }
  return `${normalizeAppBaseUrl(baseUrl)}${relativePath}`;
}

/**
 * Map a known URL slot onto a first-party path. IDs must already have
 * passed `validatedId`. Relative caller paths are used only when safe.
 */
export function knownEmailPath(
  key: EmailUrlKey,
  ids: {
    task_id?: string | null;
    meeting_id?: string | null;
    tenant_id?: string | null;
    audit_id?: string | null;
    invitation_id?: string | null;
  },
  callerPath?: unknown,
): string {
  if (isSafeRelativePath(callerPath)) return callerPath;

  switch (key) {
    case "task_url":
      if (ids.tenant_id) return `/tenant/${ids.tenant_id}/tasks`;
      return "/tasks";
    case "meeting_url":
      if (ids.meeting_id) return `/meetings/${ids.meeting_id}`;
      if (ids.audit_id) return `/audits/${ids.audit_id}`;
      return "/work/meetings";
    case "dashboard_url":
      return "/dashboard";
    case "summary_url":
      if (ids.meeting_id) return `/eos/meetings/${ids.meeting_id}/summary`;
      return "/eos/meetings";
    case "invite_url":
      return "/accept-invitation";
    case "action_link":
      if (ids.tenant_id) return `/tenant/${ids.tenant_id}`;
      if (ids.audit_id) return `/audits/${ids.audit_id}`;
      return "/dashboard";
    case "redirect_to":
      return "/dashboard";
  }
}

export function collectValidatedIds(
  source: Record<string, unknown> | null | undefined,
): {
  task_id: string | null;
  meeting_id: string | null;
  tenant_id: string | null;
  audit_id: string | null;
  invitation_id: string | null;
} {
  const src = source ?? {};
  return {
    task_id: validatedId(src.task_id),
    meeting_id: validatedId(src.meeting_id),
    tenant_id: validatedId(src.tenant_id),
    audit_id: validatedId(src.audit_id),
    invitation_id: validatedId(src.invitation_id),
  };
}

export function resolveEmailUrl(
  key: EmailUrlKey,
  baseUrl: string,
  source: Record<string, unknown> | null | undefined,
): string {
  const ids = collectValidatedIds(source);
  const callerPath = source ? source[key] : undefined;
  return buildAppUrl(baseUrl, knownEmailPath(key, ids, callerPath));
}

export function isEmailUrlKey(key: string): key is EmailUrlKey {
  return (EMAIL_URL_KEYS as readonly string[]).includes(key);
}

/**
 * Escape every merge variable and rewrite known URL slots before they
 * reach an HTML body or a Mailgun template.
 */
import { escapeHtml } from "./escape-html.ts";
import {
  isEmailUrlKey,
  normalizeAppBaseUrl,
  resolveEmailUrl,
} from "./email-urls.ts";

export function sanitizeMergeVars(
  vars: Record<string, unknown> | null | undefined,
  appBaseUrl?: string | null,
): Record<string, string> {
  const source = vars ?? {};
  const base = normalizeAppBaseUrl(appBaseUrl ?? undefined);
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (isEmailUrlKey(key)) {
      out[key] = escapeHtml(resolveEmailUrl(key, base, source));
      continue;
    }
    if (value !== null && typeof value === "object") {
      out[key] = escapeHtml(JSON.stringify(value));
      continue;
    }
    out[key] = escapeHtml(value);
  }

  return out;
}

export function envFromAddress(): string {
  const email =
    Deno.env.get("MAILGUN_FROM_EMAIL") ||
    Deno.env.get("MAIL_FROM_ADDRESS") ||
    "no-reply@mg.unicorn-cms.au";
  const name = Deno.env.get("MAILGUN_FROM_NAME") || "Unicorn CMS";
  if (email.includes("<")) return email;
  return `${name} <${email}>`;
}

export function envReplyTo(): string {
  return Deno.env.get("MAIL_REPLY_TO") || Deno.env.get("MAILGUN_REPLY_TO") || "support@vivacity.com.au";
}

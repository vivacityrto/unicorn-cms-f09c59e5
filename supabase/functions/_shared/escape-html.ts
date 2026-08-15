/**
 * HTML-escape a value before interpolating it into an email body or
 * Mailgun template variable. Applied to every caller- or DB-sourced
 * merge field so markup / attribute breakouts cannot ride along.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

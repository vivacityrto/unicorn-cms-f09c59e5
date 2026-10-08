/**
 * Email normalisation for Teams event registration.
 *
 * The normalised form is the identity used for de-duplication and for the
 * logical uniqueness key (event_type + graph_event_id + normalised_email),
 * so it must be deterministic and side-effect free.
 */

const EMAIL_PATTERN = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/;

/** Maximum length RFC 5321 allows for a forward-path. */
const MAX_EMAIL_LENGTH = 254;

/**
 * Trim + lowercase. Returns null when the value is not a plausible email
 * address (the caller reports it as `invalid_email`, it is never "fixed").
 */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > MAX_EMAIL_LENGTH) return null;
  if (!EMAIL_PATTERN.test(value)) return null;
  return value;
}

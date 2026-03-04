/**
 * Microsoft Identity Platform v2 — OAuth scope constants.
 *
 * Scopes are delegated permissions requested during the OAuth consent flow.
 * The actual set requested at connect-time is determined by the admin
 * feature flags in app_settings, NOT by user toggles.
 */

/** Always requested — sign-in, refresh, profile display */
export const BASE_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
] as const;

/** Outlook Mail surface — read-only by default */
export const MAIL_SCOPES = ['Mail.Read', 'Mail.Send'] as const;

/** Meetings & Calendar surface — read-only by default */
export const CALENDAR_SCOPES = ['Calendars.Read'] as const;

/** Documents (SharePoint + OneDrive) surface — read-only by default */
export const DOCUMENT_SCOPES = ['Files.Read.All'] as const;

export interface SurfaceFlags {
  mail: boolean;
  calendar: boolean;
  documents: boolean;
}

/**
 * Build the OAuth scope string from admin feature flags.
 *
 * Rule: request only what is enabled in Admin > Add-in Settings.
 * If nothing is enabled beyond the master flag, only baseline scopes
 * are requested (identity-only connection).
 */
export function buildScopeString(surfaces: SurfaceFlags): string {
  const scopes: string[] = [...BASE_SCOPES];

  if (surfaces.mail) scopes.push(...MAIL_SCOPES);
  if (surfaces.calendar) scopes.push(...CALENDAR_SCOPES);
  if (surfaces.documents) scopes.push(...DOCUMENT_SCOPES);

  return scopes.join(' ');
}

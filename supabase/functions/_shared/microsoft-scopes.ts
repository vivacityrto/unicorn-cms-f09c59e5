/**
 * Microsoft OAuth scope constants — shared across edge functions.
 * Mirror of src/lib/microsoft/scopes.ts for Deno runtime.
 */

export const BASE_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
];

export const MAIL_SCOPES = ['Mail.Read'];
export const CALENDAR_SCOPES = ['Calendars.Read'];
export const DOCUMENT_SCOPES = ['Files.Read.All'];

export interface SurfaceFlags {
  mail: boolean;
  calendar: boolean;
  documents: boolean;
}

export function buildScopeString(surfaces: SurfaceFlags): string {
  const scopes: string[] = [...BASE_SCOPES];
  if (surfaces.mail) scopes.push(...MAIL_SCOPES);
  if (surfaces.calendar) scopes.push(...CALENDAR_SCOPES);
  if (surfaces.documents) scopes.push(...DOCUMENT_SCOPES);
  return scopes.join(' ');
}

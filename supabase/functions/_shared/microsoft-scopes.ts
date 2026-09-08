/**
 * Microsoft OAuth scope constants — shared across edge functions.
 */

export const BASE_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
];

export const MAIL_SCOPES = ['Mail.Read', 'Mail.Send'];
// ReadWrite (not just Read) so sync-outlook-calendar can create/cancel
// Outlook calendar invites for opening/closing audit meetings, not just sync
// existing events. Existing connections made under the old Calendars.Read
// scope need to reconnect via the normal connect flow to pick this up.
export const CALENDAR_SCOPES = ['Calendars.ReadWrite'];
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

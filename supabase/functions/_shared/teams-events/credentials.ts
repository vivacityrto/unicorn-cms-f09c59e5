/**
 * Which Entra app the Teams event functions authenticate as.
 *
 * By default they REUSE the app registration Unicorn already has for
 * SharePoint (`MICROSOFT_TENANT_ID` / `MICROSOFT_CLIENT_ID` /
 * `MICROSOFT_CLIENT_SECRET`, see `_shared/graph-app-client.ts`): a Microsoft 365
 * administrator adds the two webinar application permissions to that app,
 * grants consent, and grants the Teams application access policy to the
 * organisers. No new secrets are needed.
 *
 * A dedicated app can be swapped in later with no code change by setting all
 * three `TEAMS_EVENTS_*` secrets; they take precedence when present. A partly
 * set `TEAMS_EVENTS_*` trio is treated as not configured rather than silently
 * mixed with the SharePoint credentials.
 *
 * Pure (the reader is injected) so it is unit tested in Node.
 */

export interface TeamsGraphCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Which secret set was used (for diagnostics; never log the values). */
  source: "teams_events" | "microsoft";
}

type EnvReader = (name: string) => string | undefined;

function readSet(read: EnvReader, names: [string, string, string]): [string, string, string] | null {
  const values = names.map((n) => (read(n) ?? "").trim());
  return values.every((v) => v.length > 0) ? (values as [string, string, string]) : null;
}

export function resolveTeamsGraphCredentials(read: EnvReader): TeamsGraphCredentials | null {
  const dedicatedNames: [string, string, string] = [
    "TEAMS_EVENTS_TENANT_ID",
    "TEAMS_EVENTS_CLIENT_ID",
    "TEAMS_EVENTS_CLIENT_SECRET",
  ];
  const anyDedicated = dedicatedNames.some((n) => (read(n) ?? "").trim().length > 0);
  if (anyDedicated) {
    const dedicated = readSet(read, dedicatedNames);
    if (!dedicated) return null;
    return { tenantId: dedicated[0], clientId: dedicated[1], clientSecret: dedicated[2], source: "teams_events" };
  }

  const shared = readSet(read, ["MICROSOFT_TENANT_ID", "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"]);
  if (!shared) return null;
  return { tenantId: shared[0], clientId: shared[1], clientSecret: shared[2], source: "microsoft" };
}

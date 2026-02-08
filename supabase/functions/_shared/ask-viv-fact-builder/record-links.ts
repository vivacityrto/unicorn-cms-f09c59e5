/**
 * Record Link Mapping
 * 
 * Creates navigable links for all source records.
 */

import type { RecordLink } from "./types.ts";

/**
 * Build record links for navigation.
 * Maps source tables to internal routes.
 */
export function buildRecordLinks(
  recordIds: { table: string; ids: string[] }[],
  scope: {
    client_id: string | null;
    package_id: string | null;
    phase_id: string | null;
  }
): RecordLink[] {
  const links: RecordLink[] = [];
  const seenKeys = new Set<string>();

  for (const { table, ids } of recordIds) {
    for (const id of ids) {
      const key = `${table}:${id}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const link = createRecordLink(table, id, scope);
      if (link) {
        links.push(link);
      }
    }
  }

  return links;
}

/**
 * Create a single record link based on table type.
 */
function createRecordLink(
  table: string,
  id: string,
  scope: {
    client_id: string | null;
    package_id: string | null;
    phase_id: string | null;
  }
): RecordLink | null {
  const clientId = scope.client_id || "unknown";
  const packageId = scope.package_id || "unknown";

  switch (table) {
    case "tenants":
      return {
        table: "tenants",
        id,
        label: `Tenant ${id}`,
        path: `/tenant/${id}`,
      };

    case "clients":
    case "clients_legacy":
      return {
        table: "clients",
        id,
        label: `Client ${id}`,
        path: `/clients/${id}`,
      };

    case "packages":
      return {
        table: "packages",
        id,
        label: `Package ${id}`,
        path: `/tenant/${clientId}/packages/${id}`,
      };

    case "documents_stages":
      return {
        table: "documents_stages",
        id,
        label: `Phase ${id}`,
        path: `/tenant/${clientId}/packages/${packageId}/phases/${id}`,
      };

    case "tasks":
      return {
        table: "tasks",
        id,
        label: `Task ${id}`,
        path: `/tasks/${id}`,
      };

    case "documents":
      return {
        table: "documents",
        id,
        label: `Document ${id}`,
        path: `/documents/${id}`,
      };

    case "consult_logs":
      return {
        table: "consult_logs",
        id,
        label: `Consult ${id}`,
        path: `/consults/${id}`,
      };

    case "eos_issues":
      return {
        table: "eos_issues",
        id,
        label: `Issue ${id}`,
        path: `/eos/issues/${id}`,
      };

    default:
      // Unknown table - provide generic link
      return {
        table,
        id,
        label: `${table} ${id}`,
        path: `/${table}/${id}`,
      };
  }
}

/**
 * Deduplicate and sort links by table then id.
 */
export function deduplicateLinks(links: RecordLink[]): RecordLink[] {
  const seen = new Set<string>();
  const unique: RecordLink[] = [];

  for (const link of links) {
    const key = `${link.table}:${link.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(link);
    }
  }

  // Sort by table name, then by id
  return unique.sort((a, b) => {
    if (a.table !== b.table) {
      return a.table.localeCompare(b.table);
    }
    return a.id.localeCompare(b.id);
  });
}

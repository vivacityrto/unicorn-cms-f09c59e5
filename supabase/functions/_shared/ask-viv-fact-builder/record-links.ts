/**
 * Record Link Mapping
 *
 * Creates navigable links for all source records.
 */

import type { RecordLink } from "./types.ts";

/**
 * Build record links for navigation.
 * Maps source tables to internal routes.
 *
 * `labels`, when provided, is keyed `${table}:${id}` and gives a real display
 * name (package/stage/task/action-item title etc.) instead of the generic
 * `"Task 8f2..."` fallback — callers should populate it from names they
 * already fetched in data-retrieval.ts rather than re-querying here.
 */
export function buildRecordLinks(
  recordIds: { table: string; ids: string[] }[],
  scope: {
    client_id: string | null;
    package_id: string | null;
    phase_id: string | null;
  },
  labels?: Map<string, string>
): RecordLink[] {
  const links: RecordLink[] = [];
  const seenKeys = new Set<string>();

  for (const { table, ids } of recordIds) {
    for (const id of ids) {
      const key = `${table}:${id}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const link = createRecordLink(table, id, scope, labels?.get(key));
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
  },
  label?: string
): RecordLink | null {
  const clientId = scope.client_id || "unknown";
  const packageId = scope.package_id || "unknown";

  switch (table) {
    case "tenants":
      return {
        table: "tenants",
        id,
        label: label ?? `Tenant ${id}`,
        path: `/tenant/${id}`,
      };

    case "clients":
    case "clients_legacy":
      return {
        table: "clients",
        id,
        label: label ?? `Client ${id}`,
        path: `/clients/${id}`,
      };

    case "package_instances":
      return {
        table: "package_instances",
        id,
        label: label ?? `Package ${id}`,
        path: `/tenant/${clientId}/packages/${id}`,
      };

    case "client_package_stage_state":
      return {
        table: "client_package_stage_state",
        id,
        label: label ?? `Stage ${id}`,
        path: `/tenant/${clientId}/packages/${packageId}/phases/${id}`,
      };

    case "tasks_tenants":
      return {
        table: "tasks_tenants",
        id,
        label: label ?? `Task ${id}`,
        path: `/tenant/${clientId}/tasks/${id}`,
      };

    case "client_action_items":
      return {
        table: "client_action_items",
        id,
        label: label ?? `Action item ${id}`,
        path: `/tenant/${clientId}/actions/${id}`,
      };

    case "documents":
      return {
        table: "documents",
        id,
        label: label ?? `Document ${id}`,
        path: `/documents/${id}`,
      };

    case "time_entries":
      return {
        table: "time_entries",
        id,
        label: label ?? `Time entry ${id}`,
        path: `/tenant/${clientId}/time`,
      };

    case "eos_issues":
      return {
        table: "eos_issues",
        id,
        label: label ?? `Issue ${id}`,
        path: `/eos/issues/${id}`,
      };

    default:
      // Unknown table - no fabricated route. A generic /${table}/${id} path
      // for an unrecognised table is almost never a real page.
      return null;
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

/**
 * Server-side ownership checks for the records an upload may be linked to.
 *
 * The caller supplies these ids in the multipart form, and the function inserts with the service
 * role, so none of them can be trusted as sent: each must resolve to the tenant being uploaded
 * for. Kept free of Deno/npm imports so it can be unit-tested under Node.
 */

// The slice of the Supabase client used here: from(table).select(cols).eq(col, v)...limit(n).
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
interface Query extends PromiseLike<{ data: Row[] | null; error: unknown }> {
  eq(column: string, value: string | number | boolean): Query;
  limit(count: number): Query;
}
export interface LinkLookupClient {
  from(table: string): { select(columns: string): Query };
}

export interface LinkedIds {
  stageId: number | null;
  packageId: number | null;
  taskId: string | null;
  evidenceItemId: string | null;
  categoryId: string | null;
}

export type LinkCheck = { ok: true } | { ok: false; status: 400 | 403; message: string };

const NOT_FOUND = "A linked record was not found for this tenant";

async function firstRow(query: Query): Promise<Row | null> {
  const { data, error } = await query.limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0];
}

/**
 * Fails closed: a lookup error, a missing row, or a row owned by another tenant all reject.
 * `isMemberCaller` is true for a tenant member (not staff); members may not set linked_task_id,
 * which has no tenant-scoped table to resolve against.
 */
export async function checkLinkedIds(
  db: LinkLookupClient,
  tenantId: number,
  ids: LinkedIds,
  isMemberCaller: boolean,
): Promise<LinkCheck> {
  const forbidden: LinkCheck = { ok: false, status: 403, message: NOT_FOUND };

  if (ids.taskId !== null && isMemberCaller) {
    return { ok: false, status: 403, message: "linked_task_id is not accepted for this upload" };
  }

  if (ids.stageId !== null) {
    const stage = await firstRow(
      db.from("stage_instances").select("packageinstance_id").eq("id", ids.stageId),
    );
    if (!stage || stage.packageinstance_id == null) return forbidden;
    const pkgInstance = await firstRow(
      db.from("package_instances").select("tenant_id").eq("id", stage.packageinstance_id),
    );
    if (!pkgInstance || pkgInstance.tenant_id !== tenantId) return forbidden;
  }

  if (ids.packageId !== null) {
    // linked_package_id references the packages catalogue; the tenant must hold an instance of it.
    const owned = await firstRow(
      db.from("package_instances").select("id").eq("tenant_id", tenantId).eq("package_id", ids.packageId),
    );
    if (!owned) return forbidden;
  }

  if (ids.evidenceItemId !== null) {
    const item = await firstRow(
      db.from("evidence_request_items").select("request_id").eq("id", ids.evidenceItemId),
    );
    if (!item || item.request_id == null) return forbidden;
    const request = await firstRow(
      db.from("evidence_requests").select("tenant_id").eq("id", item.request_id),
    );
    if (!request || request.tenant_id !== tenantId) return forbidden;
  }

  if (ids.categoryId !== null) {
    // Categories are a shared lookup, not tenant data: only check it exists and is active.
    const category = await firstRow(
      db.from("portal_document_categories").select("id").eq("id", ids.categoryId).eq("is_active", true),
    );
    if (!category) return { ok: false, status: 400, message: "category_id is not a valid category" };
  }

  return { ok: true };
}

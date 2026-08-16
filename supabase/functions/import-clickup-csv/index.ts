/**
 * import-clickup-csv
 * ------------------
 * Upserts a ClickUp CSV export into clickup_tasks or clickup_tasksdb.
 *
 * Authorization: requireCaller(req, "admin.team_users.manage", "full")
 * (Version A). No import-specific permission_features key exists;
 * admin.team_users.manage is Super Admin only and matches the
 * /admin/clickup-import route gate. verify_jwt is not authorization.
 *
 * Rows are allowlisted (pickAllowedClickupColumns) — never spread.
 * tenant_id is never taken from the payload; clickup_tasksdb rows are
 * resolved from unicorn_url after the caller is verified.
 * CORS is APP_BASE_URL-derived via corsHeadersFor.
 */
import { createServiceClient } from "../_shared/supabase-client.ts";
import { corsHeadersFor, requireCaller } from "../_shared/requireCaller.ts";
import {
  CLICKUP_TASKS_ALLOWED_COLUMNS,
  CLICKUP_TASKSDB_ALLOWED_COLUMNS,
  pickAllowedClickupColumns,
} from "./clickup-csv-allowlist.ts";

const ALLOWED_TABLES = ["clickup_tasks", "clickup_tasksdb"] as const;
type TargetTable = (typeof ALLOWED_TABLES)[number];

/**
 * Resolve tenant_id for clickup_tasksdb rows using unicorn_url patterns:
 *  - /clients/N  → tenant_id = N
 *  - /stage/N    → lookup v_tenant_stage_instances
 *  - /N or /email/N → lookup package_instances
 *
 * Called only after requireCaller has verified the importer. Does not
 * read tenant_id from the CSV payload.
 */
async function resolveTenantIds(sb: ReturnType<typeof createServiceClient>, insertedIds?: number[]): Promise<number> {
  let query = sb
    .from("clickup_tasksdb")
    .select("id, unicorn_url, tenant_id")
    .is("tenant_id", null);

  if (insertedIds && insertedIds.length > 0) {
    query = query.in("id", insertedIds);
  }

  const { data: rows } = await query;
  if (!rows || rows.length === 0) return 0;

  let resolved = 0;

  for (const row of rows) {
    const url = (row as { unicorn_url?: string | null }).unicorn_url;
    if (!url) continue;

    let tenantId: number | null = null;

    const clientMatch = url.match(/\/clients\/(\d+)/);
    if (clientMatch) {
      tenantId = parseInt(clientMatch[1], 10);
    }

    if (!tenantId) {
      const stageMatch = url.match(/\/stage\/(\d+)/);
      if (stageMatch) {
        const stageInstanceId = parseInt(stageMatch[1], 10);
        const { data: stageData } = await sb
          .from("v_tenant_stage_instances" as never)
          .select("tenant_id")
          .eq("stage_instance_id", stageInstanceId)
          .limit(1)
          .single();
        if (stageData) tenantId = (stageData as { tenant_id: number }).tenant_id;
      }
    }

    if (!tenantId) {
      const pkgMatch = url.match(/\/(?:email\/)?(\d+)\s*$/);
      if (pkgMatch) {
        const pkgId = parseInt(pkgMatch[1], 10);
        const { data: pkgData } = await sb
          .from("package_instances")
          .select("tenant_id")
          .eq("id", pkgId)
          .limit(1)
          .single();
        if (pkgData) tenantId = (pkgData as { tenant_id: number }).tenant_id;
      }
    }

    if (tenantId) {
      await sb
        .from("clickup_tasksdb")
        .update({ tenant_id: tenantId })
        .eq("id", (row as { id: number }).id);
      resolved++;
    }
  }

  return resolved;
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const caller = await requireCaller(req, "admin.team_users.manage", "full");
  if (caller instanceof Response) return caller;

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(req, 400, { error: "Invalid JSON body" });
    }

    const action = body.action;
    const sb = createServiceClient();

    // Manual resolve-only mode — still gated; never trusts payload tenant_id.
    if (action === "resolve_tenants") {
      const resolved = await resolveTenantIds(sb);
      return json(req, 200, { resolved });
    }

    const rows = body.rows;
    const target_table = body.target_table;
    const table: TargetTable = ALLOWED_TABLES.includes(target_table as TargetTable)
      ? (target_table as TargetTable)
      : "clickup_tasksdb";

    if (!Array.isArray(rows) || rows.length === 0) {
      return json(req, 400, { error: "No rows provided" });
    }

    const now = new Date().toISOString();
    const allowed = table === "clickup_tasks"
      ? CLICKUP_TASKS_ALLOWED_COLUMNS
      : CLICKUP_TASKSDB_ALLOWED_COLUMNS;
    const stampField = table === "clickup_tasks" ? "date_imported" : "imported_at";

    const stamped = (rows as Record<string, unknown>[]).map((raw) => {
      const picked = pickAllowedClickupColumns(raw, allowed);
      return Object.assign({}, picked, { [stampField]: now });
    });

    const { data, error } = await sb
      .from(table)
      .upsert(stamped, { onConflict: "task_id", ignoreDuplicates: false })
      .select("id");

    if (error) {
      console.error("Upsert error:", error);
      return json(req, 200, { inserted: 0, errors: rows.length, detail: error.message });
    }

    const insertedCount = data?.length ?? 0;
    let resolvedCount = 0;

    if (table === "clickup_tasksdb" && data && data.length > 0) {
      try {
        const ids = data.map((d: { id: number }) => d.id);
        resolvedCount = await resolveTenantIds(sb, ids);
      } catch (resolveErr) {
        console.error("Tenant resolution error (non-fatal):", resolveErr);
      }
    }

    return json(req, 200, {
      inserted: insertedCount,
      errors: 0,
      resolved: resolvedCount,
      imported_by: caller.userId,
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return json(req, 500, { error: (err as Error).message });
  }
});

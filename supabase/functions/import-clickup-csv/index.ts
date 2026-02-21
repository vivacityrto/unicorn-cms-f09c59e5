import { createServiceClient } from "../_shared/supabase-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_TABLES = ["clickup_tasks", "clickup_tasksdb"] as const;
type TargetTable = (typeof ALLOWED_TABLES)[number];

/**
 * Resolve tenant_id for clickup_tasksdb rows using unicorn_url patterns:
 *  - /clients/N  → tenant_id = N
 *  - /stage/N    → lookup v_tenant_stage_instances
 *  - /N or /email/N → lookup package_instances
 */
async function resolveTenantIds(sb: ReturnType<typeof createServiceClient>, insertedIds: number[]) {
  if (insertedIds.length === 0) return;

  // 1. Direct /clients/N pattern
  await sb.rpc("execute_sql" as any, {}).catch(() => {}); // no-op, we use typed queries below

  // Fetch rows that need tenant resolution
  const { data: rows } = await sb
    .from("clickup_tasksdb")
    .select("id, unicorn_url, tenant_id")
    .in("id", insertedIds)
    .is("tenant_id", null);

  if (!rows || rows.length === 0) return;

  for (const row of rows) {
    const url = (row as any).unicorn_url as string | null;
    if (!url) continue;

    let tenantId: number | null = null;

    // Pattern 1: /clients/N
    const clientMatch = url.match(/\/clients\/(\d+)/);
    if (clientMatch) {
      tenantId = parseInt(clientMatch[1], 10);
    }

    // Pattern 2: /stage/N
    if (!tenantId) {
      const stageMatch = url.match(/\/stage\/(\d+)/);
      if (stageMatch) {
        const stageInstanceId = parseInt(stageMatch[1], 10);
        const { data: stageData } = await sb
          .from("v_tenant_stage_instances" as any)
          .select("tenant_id")
          .eq("stage_instance_id", stageInstanceId)
          .limit(1)
          .single();
        if (stageData) {
          tenantId = (stageData as any).tenant_id;
        }
      }
    }

    // Pattern 3: /N (bare number) or /email/N — treat as package_instance id
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
        if (pkgData) {
          tenantId = (pkgData as any).tenant_id;
        }
      }
    }

    if (tenantId) {
      await sb
        .from("clickup_tasksdb")
        .update({ tenant_id: tenantId })
        .eq("id", (row as any).id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rows, target_table } = await req.json();

    // Validate target table
    const table: TargetTable = ALLOWED_TABLES.includes(target_table) ? target_table : "clickup_tasksdb";

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "No rows provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = createServiceClient();
    const now = new Date().toISOString();

    // Stamp each row
    const stampField = table === "clickup_tasks" ? "date_imported" : "imported_at";
    const stamped = rows.map((r: Record<string, unknown>) => ({
      ...r,
      [stampField]: now,
    }));

    const { data, error } = await sb
      .from(table)
      .upsert(stamped, { onConflict: "task_id", ignoreDuplicates: false })
      .select("id");

    if (error) {
      console.error("Upsert error:", error);
      return new Response(
        JSON.stringify({ inserted: 0, errors: rows.length, detail: error.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const insertedCount = data?.length ?? 0;

    // For clickup_tasksdb, resolve tenant_id from unicorn_url
    if (table === "clickup_tasksdb" && data && data.length > 0) {
      try {
        const ids = data.map((d: any) => d.id);
        await resolveTenantIds(sb, ids);
      } catch (resolveErr) {
        console.error("Tenant resolution error (non-fatal):", resolveErr);
      }
    }

    return new Response(
      JSON.stringify({ inserted: insertedCount, errors: 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

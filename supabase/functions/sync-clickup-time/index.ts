import { createServiceClient } from "../_shared/supabase-client.ts";
import { corsHeaders } from "../_shared/cors.ts";

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";
const RATE_LIMIT_MS = 650;
const BATCH_SIZE = 50;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function clickupGet(path: string, apiKey: string): Promise<any> {
  const resp = await fetch(`${CLICKUP_API_BASE}${path}`, {
    headers: { Authorization: apiKey },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ClickUp API ${path} → ${resp.status}: ${text}`);
  }
  return resp.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const CLICKUP_API_KEY = Deno.env.get("CLICKUP_API_KEY");
    if (!CLICKUP_API_KEY) {
      throw new Error("CLICKUP_API_KEY secret is not configured");
    }

    const body = await req.json();
    const { mode, tenant_id: filterTenantId, offset: startOffset = 0 } = body;

    const sb = createServiceClient();
    const log = (msg: string) => console.log(`[sync-clickup-time] ${msg}`);

    // Build task query
    let query = sb
      .from("clickup_tasks_api")
      .select("task_id, tenant_id")
      .not("task_id", "is", null);

    if (mode === "sync_by_tenant") {
      if (!filterTenantId) {
        return new Response(
          JSON.stringify({ error: "tenant_id required for sync_by_tenant mode" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      query = query.eq("tenant_id", filterTenantId);
    } else if (mode !== "sync_all") {
      return new Response(
        JSON.stringify({ error: "Invalid mode. Use sync_all or sync_by_tenant" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch batch of tasks
    const { data: tasks, error: fetchError } = await query
      .order("id", { ascending: true })
      .range(startOffset, startOffset + BATCH_SIZE - 1);

    if (fetchError) throw fetchError;
    if (!tasks || tasks.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No more tasks to process",
          entries_synced: 0,
          has_more: false,
          next_offset: startOffset,
          total_tasks: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let entriesSynced = 0;
    let tasksProcessed = 0;
    const errors: string[] = [];

    for (const task of tasks) {
      try {
        const timeData = await clickupGet(`/task/${task.task_id}/time`, CLICKUP_API_KEY);
        const intervals = timeData?.data ?? [];

        if (intervals.length > 0) {
          const rows = intervals.map((interval: any) => ({
            clickup_interval_id: String(interval.id),
            task_id: task.task_id,
            tenant_id: task.tenant_id ?? null,
            user_name: interval.user?.username ?? null,
            user_email: interval.user?.email ?? null,
            duration_ms: parseInt(interval.duration ?? interval.time ?? "0"),
            start_at: interval.start ? new Date(parseInt(interval.start)).toISOString() : null,
            end_at: interval.end ? new Date(parseInt(interval.end)).toISOString() : null,
            description: interval.description ?? null,
            billable: interval.billable ?? false,
            imported_at: new Date().toISOString(),
          }));

          const { error: upsertError } = await sb
            .from("clickup_time_entries")
            .upsert(rows, { onConflict: "clickup_interval_id", ignoreDuplicates: false });

          if (upsertError) {
            errors.push(`Task ${task.task_id}: ${upsertError.message}`);
          } else {
            entriesSynced += rows.length;
          }
        }

        tasksProcessed++;
        await delay(RATE_LIMIT_MS);
      } catch (e) {
        errors.push(`Task ${task.task_id}: ${(e as Error).message}`);
        tasksProcessed++;
        await delay(RATE_LIMIT_MS);
      }
    }

    const hasMore = tasks.length === BATCH_SIZE;
    const nextOffset = startOffset + tasks.length;

    log(`Batch done: ${tasksProcessed} tasks processed, ${entriesSynced} time entries synced, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        entries_synced: entriesSynced,
        tasks_processed: tasksProcessed,
        errors,
        has_more: hasMore,
        next_offset: nextOffset,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sync-clickup-time error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

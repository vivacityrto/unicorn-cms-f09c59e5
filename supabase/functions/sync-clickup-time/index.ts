import { createServiceClient } from "../_shared/supabase-client.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { extractToken, verifyAuth, checkVivacityTeam } from "../_shared/auth-helpers.ts";

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";
const RATE_LIMIT_MS = 650;
const BATCH_SIZE = 50;

interface ClickUpInterval {
  id?: string | number;
  time?: string | number;
  start?: string | number;
  end?: string | number;
  description?: string | null;
  billable?: boolean;
}

interface ClickUpTimeGroup {
  user?: { username?: string | null; email?: string | null } | null;
  intervals?: ClickUpInterval[];
}

interface ClickUpTimeResponse {
  data?: ClickUpTimeGroup[];
}

interface ClickUpTimeEntry {
  clickup_interval_id: string;
  task_id: string;
  tenant_id: number | null;
  user_name: string | null;
  user_email: string | null;
  duration_ms: number;
  start_at: string | null;
  end_at: string | null;
  description: string | null;
  billable: boolean;
  imported_at: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function clickupGet(path: string, apiKey: string): Promise<unknown> {
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
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const CLICKUP_API_KEY = Deno.env.get("CLICKUP_API_KEY");
    if (!CLICKUP_API_KEY) {
      throw new Error("CLICKUP_API_KEY secret is not configured");
    }

    // Had no auth check at all until now -- ClickUp is a Vivacity-internal
    // integration (not client-facing); sync_all mode meant an anonymous
    // caller could trigger unbounded cross-tenant ClickUp API pulls.
    const token = extractToken(req);
    if (!token) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const { user, profile } = await verifyAuth(createServiceClient(), token);
    if (!user || !checkVivacityTeam(profile)) {
      return new Response(JSON.stringify({ error: "Vivacity staff access required" }), {
        status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
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
          { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      query = query.eq("tenant_id", filterTenantId);
    } else if (mode !== "sync_all") {
      return new Response(
        JSON.stringify({ error: "Invalid mode. Use sync_all or sync_by_tenant" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
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
        { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    let entriesSynced = 0;
    let tasksProcessed = 0;
    const errors: string[] = [];

    for (const task of tasks) {
      try {
        const timeData = await clickupGet(`/task/${task.task_id}/time`, CLICKUP_API_KEY) as ClickUpTimeResponse;
        
        // Response structure: data[] = { user, time, intervals[] }
        // Each data item groups intervals by user
        const userGroups = timeData?.data ?? [];
        const seen = new Map<string, ClickUpTimeEntry>();

        for (const group of userGroups) {
          const userName = group.user?.username ?? null;
          const userEmail = group.user?.email ?? null;
          const subIntervals = group.intervals ?? [];

          for (const interval of subIntervals) {
            const id = String(interval.id);
            if (id === "undefined" || !id) continue;
            seen.set(id, {
              clickup_interval_id: id,
              task_id: task.task_id,
              tenant_id: task.tenant_id ?? null,
              user_name: userName,
              user_email: userEmail,
              duration_ms: parseInt(interval.time ?? "0"),
              start_at: interval.start ? new Date(parseInt(interval.start)).toISOString() : null,
              end_at: interval.end ? new Date(parseInt(interval.end)).toISOString() : null,
              description: interval.description ?? null,
              billable: interval.billable ?? false,
              imported_at: new Date().toISOString(),
            });
          }
        }

        if (seen.size > 0) {
          const rows = Array.from(seen.values());

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
      } catch (e: unknown) {
        errors.push(`Task ${task.task_id}: ${e instanceof Error ? e.message : String(e)}`);
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
      { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("sync-clickup-time error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});

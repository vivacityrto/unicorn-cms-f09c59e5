import { createServiceClient } from "../_shared/supabase-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

interface ClickUpComment {
  id: string;
  comment_text: string;
  user: { id: number; username: string; email: string };
  date: string; // unix ms as string
  resolved: boolean;
  comment?: ClickUpComment[]; // threaded replies
}

/**
 * Extract plain text from ClickUp comment_text which may contain rich-text objects.
 */
function extractCommentText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((block: any) => {
        if (typeof block === "string") return block;
        if (block?.text) return block.text;
        return "";
      })
      .join("")
      .trim();
  }
  return String(raw ?? "");
}

/**
 * Flatten a ClickUp comment (and its threaded replies) into DB rows.
 */
function flattenComment(
  c: any,
  taskId: string,
  tenantId: number | null,
  parentId: string | null = null
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const commentId = String(c.id ?? c.comment_id ?? "");
  if (!commentId) return rows;
  
  rows.push({
    task_id: taskId,
    comment_id: commentId,
    comment_text: extractCommentText(c.comment_text ?? c.text_content ?? ""),
    comment_by: c.user?.username ?? null,
    comment_by_id: c.user?.id ?? null,
    comment_by_email: c.user?.email ?? null,
    date_created: c.date ? parseInt(String(c.date), 10) : null,
    resolved: c.resolved ?? false,
    parent_comment_id: parentId,
    tenant_id: tenantId,
  });
  // Recursively handle threaded replies
  if (Array.isArray(c.comment)) {
    for (const reply of c.comment) {
      rows.push(...flattenComment(reply, taskId, tenantId, c.id));
    }
  }
  return rows;
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
    const { action, task_ids, tenant_id } = body;

    const sb = createServiceClient();

    // ─── Mode 1: Fetch comments for specific task IDs ───
    if (action === "fetch_by_task_ids") {
      if (!Array.isArray(task_ids) || task_ids.length === 0) {
        return new Response(
          JSON.stringify({ error: "task_ids array required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let totalFetched = 0;
      let totalStored = 0;
      const errors: string[] = [];

      for (const tid of task_ids.slice(0, 50)) {
        try {
          const resp = await fetch(`${CLICKUP_API_BASE}/task/${tid}/comment`, {
            headers: { Authorization: CLICKUP_API_KEY },
          });

          if (!resp.ok) {
            const errText = await resp.text();
            errors.push(`Task ${tid}: ${resp.status} ${errText}`);
            continue;
          }

          const data = await resp.json();
          const comments: any[] = data.comments ?? [];
          totalFetched += comments.length;

          if (comments.length === 0) continue;

          const rows = comments.flatMap((c: any) =>
            flattenComment(c, tid, tenant_id ?? null)
          );

          const { error: upsertErr } = await sb
            .from("clickup_task_comments")
            .upsert(rows, { onConflict: "comment_id", ignoreDuplicates: false });

          if (upsertErr) {
            errors.push(`Task ${tid} upsert: ${upsertErr.message}`);
          } else {
            totalStored += rows.length;
          }
        } catch (e) {
          errors.push(`Task ${tid}: ${(e as Error).message}`);
        }
      }

      return new Response(
        JSON.stringify({ fetched: totalFetched, stored: totalStored, errors }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Mode 2: Bulk fetch for a tenant, or ALL tasks if tenant_id is 0 ───
    // Supports batch_size (default 50) and offset (default 0) for resumable pagination.
    if (action === "fetch_by_tenant") {
      const fetchAll = !tenant_id || tenant_id === 0;
      const batchSize = body.batch_size ?? 50;
      const offset = body.offset ?? 0;

      // Get total count first
      let countQuery = sb.from("clickup_tasks_api").select("task_id", { count: "exact", head: true });
      if (!fetchAll) countQuery = countQuery.eq("tenant_id", tenant_id);
      const { count: totalTasks } = await countQuery;

      // Get task_ids for this batch
      let query = sb.from("clickup_tasks_api").select("task_id, tenant_id").range(offset, offset + batchSize - 1);
      if (!fetchAll) {
        query = query.eq("tenant_id", tenant_id);
      }
      const { data: tasks, error: fetchErr } = await query;

      if (fetchErr) throw fetchErr;
      if (!tasks || tasks.length === 0) {
        return new Response(
          JSON.stringify({ fetched: 0, stored: 0, errors: [], has_more: false, next_offset: offset, total_tasks: totalTasks ?? 0 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const taskEntries = tasks.filter((t: any) => t.task_id).map((t: any) => ({
        task_id: t.task_id,
        tenant_id: t.tenant_id ?? null,
      }));
      let totalFetched = 0;
      let totalStored = 0;
      const errors: string[] = [];

      for (const entry of taskEntries) {
        try {
          const resp = await fetch(`${CLICKUP_API_BASE}/task/${entry.task_id}/comment`, {
            headers: { Authorization: CLICKUP_API_KEY },
          });

          if (!resp.ok) {
            const errText = await resp.text();
            errors.push(`Task ${entry.task_id}: ${resp.status} ${errText}`);
            continue;
          }

          const data = await resp.json();
          const comments: any[] = data.comments ?? [];
          totalFetched += comments.length;

          if (comments.length === 0) continue;

          const rows = comments.flatMap((c: any) =>
            flattenComment(c, entry.task_id, fetchAll ? entry.tenant_id : tenant_id)
          );

          const { error: upsertErr } = await sb
            .from("clickup_task_comments")
            .upsert(rows, { onConflict: "comment_id", ignoreDuplicates: false });

          if (upsertErr) {
            errors.push(`Task ${entry.task_id} upsert: ${upsertErr.message}`);
          } else {
            totalStored += rows.length;
          }

          // Rate-limit: ClickUp API allows ~100 req/min
          await new Promise((r) => setTimeout(r, 650));
        } catch (e) {
          errors.push(`Task ${entry.task_id}: ${(e as Error).message}`);
        }
      }

      const nextOffset = offset + taskEntries.length;
      const hasMore = nextOffset < (totalTasks ?? 0);

      return new Response(
        JSON.stringify({ fetched: totalFetched, stored: totalStored, task_count: taskEntries.length, errors, has_more: hasMore, next_offset: nextOffset, total_tasks: totalTasks ?? 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use fetch_by_task_ids or fetch_by_tenant" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("fetch-clickup-comments error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

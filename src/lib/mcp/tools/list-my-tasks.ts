import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_my_tasks",
  title: "List my tasks",
  description:
    "List tasks assigned to the signed-in user. Respects tenant RLS: only tasks the user can see in ComplyHub are returned.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of tasks to return (default 25, max 100)."),
    status: z
      .string()
      .optional()
      .describe("Optional task status filter (e.g. 'open', 'in_progress', 'done')."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );

    let query = supabase
      .from("tasks")
      .select("id, title, status, due_date, tenant_id, assigned_to, created_at")
      .eq("assigned_to", ctx.getUserId())
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(limit ?? 25);

    if (status) query = query.eq("status", status);

    const { data, error } = await query;

    if (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }

    return {
      content: [
        { type: "text", text: JSON.stringify(data ?? [], null, 2) },
      ],
      structuredContent: { tasks: data ?? [] },
    };
  },
});

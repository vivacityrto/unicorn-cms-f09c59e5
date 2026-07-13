import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "whoami",
  title: "Who am I",
  description:
    "Return the signed-in user's identity: user id, email, and the tenants they can access via ComplyHub RLS.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx: ToolContext) => {
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

    const { data: memberships, error } = await supabase
      .from("tenant_users")
      .select("tenant_id, tenants(name)")
      .limit(50);

    if (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }

    const identity = {
      user_id: ctx.getUserId(),
      email: ctx.getUserEmail(),
      tenants: memberships ?? [],
    };

    return {
      content: [{ type: "text", text: JSON.stringify(identity, null, 2) }],
      structuredContent: identity,
    };
  },
});

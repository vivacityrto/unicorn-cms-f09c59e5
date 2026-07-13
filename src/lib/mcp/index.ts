import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listMyTenantsTool from "./tools/list-my-tenants";
import listMyTasksTool from "./tools/list-my-tasks";

// The OAuth issuer MUST be the direct Supabase host, built from the project ref.
// Vite inlines VITE_SUPABASE_PROJECT_ID at build time so this stays import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "complyhub-mcp",
  title: "ComplyHub",
  version: "0.1.0",
  instructions:
    "Tools for ComplyHub, a compliance platform for Australian RTOs. Use `whoami` to confirm the signed-in user, `list_my_tenants` to see which client organisations they can access, and `list_my_tasks` to see tasks assigned to them. All tools honour tenant-scoped RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listMyTenantsTool, listMyTasksTool],
});

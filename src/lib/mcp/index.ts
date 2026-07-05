import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";

// Build the Supabase Auth issuer from the project ref (Vite inlines this at
// build time, keeping the entry import-safe — no runtime env read at module
// evaluation). The fallback keeps the issuer well-formed during the
// throwaway manifest-extract eval.
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "complyhub-mcp",
  title: "ComplyHub MCP",
  version: "0.1.0",
  instructions:
    "Tools for ComplyHub — the RTO compliance platform. Start with `echo` to verify connectivity.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool],
});

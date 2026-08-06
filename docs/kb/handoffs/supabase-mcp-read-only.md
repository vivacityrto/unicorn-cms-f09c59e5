# Supabase MCP Read-Only Setup

> **Last updated:** 2026-05-09 · **Reconsider by:** 2026-08-09 · **Confidence:** high.
>
> Use this when Codex or Claude needs to inspect the Supabase project without
> being able to write to it.

---

## When to Use This

Use this setup for investigation work such as:

- Checking Priority Checks.
- Inspecting RBAC tables and policies.
- Counting affected users.
- Reading logs, advisors, schema, and table data.

Do not use this setup for migrations, data fixes, or production writes. If a
write is needed, pause and follow the production database change handoff.

---

## Project

Use the project ref for the Supabase project you need to inspect. Keep the
actual value out of this doc.

```text
PROJECT_REF
```

Read-only MCP URL pattern:

```text
https://mcp.supabase.com/mcp?project_ref=PROJECT_REF&read_only=true
```

The important safety flag is:

```text
read_only=true
```

Do not remove it for normal investigations.

---

## Local Credential Handling

Codex and Claude should read the Supabase credential from a local environment
variable:

```text
SUPABASE_ACCESS_TOKEN
```

Set the value outside the repo through the approved local secret process for
your machine. Do not paste the real value into repo files, docs, prompts,
screenshots, terminal transcripts, or commit messages.

If OAuth approval fails with a privileges error, use the bearer-token setup
below instead of OAuth. This happened during the initial setup for this
workspace.

---

## Codex Setup

Add the MCP server:

```bash
codex mcp add supabase \
  --url "https://mcp.supabase.com/mcp?project_ref=PROJECT_REF&read_only=true" \
  --bearer-token-env-var SUPABASE_ACCESS_TOKEN
```

If Codex is launched from a terminal session, make sure
`SUPABASE_ACCESS_TOKEN` is available in that shell before launching Codex.

If Codex is launched as a macOS app, make sure the same environment variable is
available to GUI apps, then fully quit and reopen Codex.

Check that Codex sees the MCP server:

```bash
codex mcp list
```

Expected shape:

```text
Name      Url                                                                           Bearer Token Env Var   Status   Auth
supabase  https://mcp.supabase.com/mcp?project_ref=PROJECT_REF&read_only=true           SUPABASE_ACCESS_TOKEN  enabled  Bearer token
```

Optional detail check:

```bash
codex mcp get supabase
```

After restarting Codex, ask it to use the Supabase MCP. If tools are not
visible, the app probably did not inherit `SUPABASE_ACCESS_TOKEN`.

---

## Claude Setup

Before adding the MCP server, make sure `SUPABASE_ACCESS_TOKEN` is available to
the Claude process. For Claude Desktop or other GUI launches on macOS, set it
for GUI apps through the approved local secret process, then fully quit and
reopen Claude.

Add the read-only MCP server:

```bash
claude mcp add --scope project --transport http supabase \
  "https://mcp.supabase.com/mcp?project_ref=PROJECT_REF&read_only=true"
```

Then check:

```bash
claude mcp list
```

If Claude's current CLI requires an explicit header or environment binding for
HTTP MCP bearer auth, run:

```bash
claude mcp add --help
```

Use the option that maps the bearer token to `SUPABASE_ACCESS_TOKEN`. Keep the
URL unchanged and keep `read_only=true`.

---

## Verification Prompts

Use harmless read-only checks first:

```text
Use the Supabase MCP in read-only mode. Confirm the project ref and list the
available read-only tools before querying data.
```

Then:

```text
Check Priority Checks via Supabase MCP. Do not write or apply migrations.
Return only findings, counts, and the source tables/views used.
```

For RBAC:

```text
Inspect the current RBAC tables and policies via Supabase MCP. Summarize the
roles in a tree format and flag any role mismatches by count. Do not write.
```

---

## Safety Rules

- Keep `read_only=true` in the MCP URL.
- Do not call migration, write, delete, update, or insert tools during review.
- Prefer counts and summaries over row-level personal data.
- Fetch names or emails only when the user explicitly needs them to make a
  decision.
- If a production data change is needed, stop and use
  [lovable-production-db-change.md](lovable-production-db-change.md).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| MCP server is listed but tools are unavailable | App did not inherit `SUPABASE_ACCESS_TOKEN` | Re-set the local environment variable, fully quit, then reopen the app |
| OAuth approval fails with a privileges error | Account cannot approve that endpoint | Use bearer token auth through `SUPABASE_ACCESS_TOKEN` |
| MCP can see the wrong project | Wrong `project_ref` in URL | Re-add the server with the correct project ref |
| Write tools appear available | Missing `read_only=true` | Remove and re-add the MCP server with the read-only URL |
| A secret value appears in terminal history | Secret was typed directly | Rotate the secret in Supabase and update the local environment |

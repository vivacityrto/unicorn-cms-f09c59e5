# send-test-email

Super-admin-only preview of a `system_emails` row. The hosted project
had **three** UUID-slug copies of this function, all `verify_jwt=false`
with no caller gate. Saying "two are retired" is how the third was
missed — always enumerate all three.

| Slug | Fate |
|------|------|
| `send-test-email` | Keeper — Super Admin + `requireCaller` |
| `dcd6c745-f1cf-4f2c-af4e-5644f9c814d7` | Retired (410 stub) |
| `c22daa64-2f57-47f9-961c-1b7e2ffc38a8` | Retired (410 stub) |
| `64329f1f-48e1-4374-8ddf-6e66e42d33de` | Digit-leading slug. MCP `deploy_edge_function` rejects `name` matching `/^[A-Za-z][A-Za-z0-9_-]*$/`. Unauthenticated SendGrid sender until deleted or stubbed via Management API `DELETE /v1/projects/{ref}/functions/{slug}` or the dashboard. |

Digit-leading UUID slugs are invisible to name-based greps and cannot be
redeployed through the Supabase MCP. Treat every bare-UUID deployment as
a separate live surface.

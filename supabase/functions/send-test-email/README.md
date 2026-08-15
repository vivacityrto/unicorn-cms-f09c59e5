# send-test-email

Super-admin-only preview of a `system_emails` row. The hosted project
previously had **three** UUID-slug copies of this function, all
`verify_jwt=false` with no caller gate.

| Slug | Fate |
|------|------|
| `send-test-email` | Keeper — Super Admin + `requireCaller` |
| `dcd6c745-f1cf-4f2c-af4e-5644f9c814d7` | Retired (410 stub) |
| `64329f1f-48e1-4374-8ddf-6e66e42d33de` | Retired (410 stub) |
| `c22daa64-2f57-47f9-961c-1b7e2ffc38a8` | Retired (410 stub) — third copy, also an open relay |

All three UUID slugs are retired so none remain as an unauthenticated
send surface. The named slug is the one to keep.

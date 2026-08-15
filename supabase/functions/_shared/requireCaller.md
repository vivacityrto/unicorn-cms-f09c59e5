# requireCaller

In-function authorization for edge functions. Gateway `verify_jwt` is **not**
authorization — the public anon key is a valid JWT and satisfies it.

```ts
import { requireCaller, handleCorsPreflight } from "../_shared/requireCaller.ts";

if (req.method === "OPTIONS") return handleCorsPreflight(req);

// Staff feature
const caller = await requireCaller(req, {
  kind: "permission",
  featureKey: "admin.team_users.manage",
  minLevel: "full",
});

// Super Admin only
const caller = await requireCaller(req, { kind: "super_admin" });

// Cron / function-to-function (constant-time secret compare)
const caller = await requireCaller(req, { kind: "internal" });

if (!caller.ok) return caller.response;
```

Internal secrets (first match wins; all are compared):

- `INTERNAL_EMAIL_SECRET`
- `CRON_FUNCTION_JWT` (set this to `vault.cron_function_jwt` so existing
  `private.cron_function_jwt()` schedules keep working)
- `SUPABASE_SERVICE_ROLE_KEY`

Accepted on `Authorization: Bearer …`, `x-internal-email-secret`, or
`x-cron-secret`.

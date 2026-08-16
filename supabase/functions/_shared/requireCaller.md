# requireCaller

In-function authorization for edge functions. Gateway `verify_jwt` is **not**
authorization — the public anon key is a valid JWT and satisfies it.

C1 API (PR #295). Returns `{ userId }` on success, or a `Response` to return
immediately.

```ts
import {
  corsHeadersFor,
  requireCaller,
  requireSuperAdmin,
  requireInternalEmailSecret,
  requireSharedSecret,
} from "../_shared/requireCaller.ts";

const corsHeaders = corsHeadersFor(req);
if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

// Staff feature
const caller = await requireCaller(req, "admin.team_users.manage", "full");
if (caller instanceof Response) return caller;

// Super Admin only
const adminCaller = await requireSuperAdmin(req);
if (adminCaller instanceof Response) return adminCaller;

// Single-header machine-to-machine (workers)
const secret = requireSharedSecret(req, "WORKER_SECRET", "x-worker-secret");
if (secret instanceof Response) return secret;

// Outbound email cron / function-to-function (multi-secret)
const internal = requireInternalEmailSecret(req);
if (internal instanceof Response) return internal;
```

`requireInternalEmailSecret` accepts (constant-time, all compared):

- `INTERNAL_EMAIL_SECRET`
- `CRON_FUNCTION_JWT` (set this to `vault.cron_function_jwt` so existing
  `private.cron_function_jwt()` schedules keep working)
- `SUPABASE_SERVICE_ROLE_KEY`

Presented on `Authorization: Bearer …`, `x-internal-email-secret`, or
`x-cron-secret`.

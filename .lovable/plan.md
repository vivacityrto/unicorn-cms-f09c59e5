## Fix: Replace `req.headers.get("origin")` with `Deno.env.get("APP_BASE_URL")` in 3 edge functions

Three edge functions read `redirectTo` from `req.headers.get("origin")`, which resolves to the wrong domain and causes users to land on a 404 after clicking password-reset links. The same fix already applied to `send-password-reset` will be applied to these three functions.

### Changes

1. **supabase/functions/generate-recovery-link/index.ts**
   - Line 120: `const origin = req.headers.get("origin") || "..."` → `const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://www.unicorn-cms.au";`
   - Line 126: `${origin}/reset-password` → `${APP_BASE_URL}/reset-password`

2. **supabase/functions/activate-ghost-user/index.ts**
   - Line 134: `const origin = req.headers.get("origin") || "..."` → `const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://www.unicorn-cms.au";`
   - Line 138: `${origin}/reset-password` → `${APP_BASE_URL}/reset-password`
   - Line 188: `Vivacity Unicorn • <a href="${origin}">${origin}</a>` → `Vivacity Unicorn • <a href="${APP_BASE_URL}">${APP_BASE_URL}</a>` (email footer link)

3. **supabase/functions/send-self-password-reset/index.ts**
   - Line 84: `const origin = req.headers.get("origin") || "..."` → `const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://www.unicorn-cms.au";`
   - Line 91: `${origin}/reset-password` → `${APP_BASE_URL}/reset-password`

No other logic, auth checks, templates, or edge functions are touched.
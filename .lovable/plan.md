## Fix: send-password-reset edge function redirect domain

**Problem:** The edge function reads `redirectTo` from the request `origin` header, which resolves to the marketing site (`vivacity.au`) instead of the app domain. Users clicking password-reset links land on a 404.

**Changes in `supabase/functions/send-password-reset/index.ts`:**

1. **Line 153** — Replace origin header fallback with `APP_BASE_URL` env variable:
   - Before: `const origin = req.headers.get("origin") || "https://vivacity.lovable.app";`
   - After: `const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://www.unicorn-cms.au";`

2. **Line 160** — Use `APP_BASE_URL` in the `redirectTo` option:
   - Before: `redirectTo: \`${origin}/reset-password\`,`
   - After: `redirectTo: \`${APP_BASE_URL}/reset-password\``

3. **Line 232** — Use `APP_BASE_URL` in the email footer link:
   - Before: `Vivacity • <a href="${origin}">${origin}</a>`
   - After: `Vivacity • <a href="${APP_BASE_URL}">${APP_BASE_URL}</a>`

**Out of scope:** No changes to email HTML body, Mailgun logic, auth/permission checks, `audit_eos_events` logging, or any other edge functions.

**Deployment:** Deploy the updated edge function after editing.
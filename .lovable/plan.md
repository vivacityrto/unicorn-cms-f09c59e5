Plan

1. Read `supabase/functions/send-self-password-reset/index.ts` to confirm the exact content at line 165.
2. Apply the exact change: replace `${origin}` with `${APP_BASE_URL}` on line 165 in the email footer link.
3. Verify no other occurrences of `origin` remain in the file.
4. No other files or logic are touched.

Technical detail
- Line 165: `<p style="margin: 4px 0;"><a href="${origin}">${origin}</a></p>` → `<p style="margin: 4px 0;"><a href="${APP_BASE_URL}">${APP_BASE_URL}</a></p>`
- The `APP_BASE_URL` variable is already defined earlier in the file from the previous fix.
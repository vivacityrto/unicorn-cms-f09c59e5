# Store the Vimeo API token

No settings page and no code changes — a page in the app cannot write Supabase Edge Function secrets, and the token does not belong in the database.

## Steps

1. Open Lovable's secure secret form for `VIMEO_ACCESS_TOKEN` (update, since the name already exists). You paste the token generated from the "Unicorn Academy" Vimeo app; the value is never shown to me or stored in the codebase.
2. The updated value is picked up by the edge functions that read it — `academy-fetch-vimeo-transcript` (and any other Vimeo caller) via `Deno.env.get("VIMEO_ACCESS_TOKEN")`.
3. Verify end-to-end: on Academy → Quick Add Recording, paste the plain link `https://vimeo.com/1194261152` (no privacy hash needed once the token owns the video) and click **Generate with AI**.
4. If Vimeo still returns 404/403, the error text now surfaces inline on Step 1. That would mean the app was created under an account without access to the video, and the fix is regenerating the token from the owning workspace.

## Notes

- No migration, no new table, no RLS change.
- Nothing to publish — secrets apply to the deployed functions immediately.

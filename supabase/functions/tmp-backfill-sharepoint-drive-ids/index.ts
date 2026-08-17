// NEUTRALIZED. This was a one-off throwaway backfill function
// (populated document_versions.source_drive_item_id/source_site_id for 26 legacy rows
// on 2026-07-20). The backfill ran successfully and was verified; this stub replaces
// the working code so the function can no longer do anything if invoked.
// Safe to delete entirely via the Supabase dashboard.

Deno.serve(async () => {
  return new Response(JSON.stringify({ error: 'Gone — this one-off backfill function has been neutralized after use.' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json' },
  });
});

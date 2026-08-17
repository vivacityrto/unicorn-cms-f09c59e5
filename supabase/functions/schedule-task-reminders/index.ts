// RETIRED 2026-08-18 (docs/audit-log/entries/2026-08-17-schedule-task-reminders-cron-auth.md).
// This function had no caller anywhere — not in this repo, its full git
// history, pg_cron, any Postgres trigger/function, or the codebase's own
// docs — and its target table (notification_schedule) held 0 rows in
// production. Task due-date reminders are handled by the active,
// cron-driven `generate-notifications` function (scope `tasks_obligations`),
// which writes to `user_notifications` instead. Briefly gated on the shared
// cron-invoke-secret pattern (v87) before this retirement, closing an
// anonymous service-role write in the interim; retired outright once Carl
// confirmed generate-notifications is the intended mechanism (no need to
// maintain two parallel, differently-shaped reminder systems).
// Safe to delete entirely via the Supabase dashboard.

Deno.serve(async () => {
  return new Response(JSON.stringify({ error: 'Gone — this function has been retired. Task due-date reminders are handled by generate-notifications.' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json' },
  });
});

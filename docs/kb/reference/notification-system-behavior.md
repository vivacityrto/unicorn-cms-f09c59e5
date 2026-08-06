# Notification System Behaviour Reference

## emit_notification error behaviour (changed 14 May 2026 — Phase 3A)

### What changed

Before Phase 3A, `emit_notification` accepted any valid `notification_event_type` enum value unconditionally. If the matching notification rule was disabled (`is_active = false` in `dd_notification_event`), the function silently returned NULL with no error raised and no log entry.

After Phase 3A, `emit_notification` validates `p_event_type` against `dd_notification_event` at the top of the function. If the value is not found in that table, or if the matching row has `is_active = false`, the function raises:

```
Unknown or inactive notification event_type: <value>
```

### What this means in practice

A disabled notification rule that previously caused a silent skip will now surface as a logged error at the point of emission. This error appears in Supabase logs and in edge function logs.

This is intentional. The change makes accidental deactivation visible rather than allowing it to fail silently.

### How to fix it

If you see errors like the following in the logs:

```
Unknown or inactive notification event_type: task_assigned
```

Check `dd_notification_event` first before investigating any application code:

```sql
SELECT event_type, label, is_active
FROM dd_notification_event
WHERE event_type = 'task_assigned';
```

If `is_active = false`, set it back to true:

```sql
UPDATE dd_notification_event
SET is_active = true
WHERE event_type = 'task_assigned';
```

No code change or deployment is required. The fix takes effect immediately.

---

## Incomplete wiring for 3 event types — resolved 14 May 2026

The following three event types were added to the enum after the original seven were built. Application code was never fully updated to support them. This gap was identified during Phase 3A and fixed as a follow-up task on 14 May 2026.

- `document_request_created`
- `note_shared`
- `note_added`

### State after fix

| Layer | Status |
|---|---|
| `emit_notification` calls | ✅ Working |
| `dd_notification_event` seed rows | ✅ Present with correct labels |
| Teams title map in `process-notification-outbox/index.ts` | ✅ Fixed — proper titles now delivered |
| `NotificationEventType` union in `useTeamsNotifications.tsx` | ✅ Fixed |
| `ALL_EVENT_TYPES` array in `NotificationRulesCard.tsx` | ✅ Fixed — users can now toggle these in the Rules UI |

All 10 notification event types are now fully wired across the entire notification pipeline.

# Phase 3A finalisation — remove `as any` casts

Types are already regenerated: `emit_notification.p_event_type` is now `string` in `src/integrations/supabase/types.ts`. The temporary `as any` casts on enum literals can be removed cleanly.

## Edits

**`src/lib/noteNotifications.ts`**
- Line 133: `p_event_type: 'note_shared' as any,` → `p_event_type: 'note_shared',`
- Line 181: `p_event_type: alreadyNotified ? 'note_shared' as any : 'note_added' as any,` → `p_event_type: alreadyNotified ? 'note_shared' : 'note_added',`

**`src/hooks/useDocumentRequests.tsx`**
- Line 114: `p_event_type: 'document_request_created' as any,` → `p_event_type: 'document_request_created',`

## Out of scope
- Other unrelated `as any` casts in these files (line 123 `notifRows as any`, line 176 `} as any`, and the `(supabase as any)` chain in `useDocumentRequests.tsx`) — these address separate type issues not connected to the enum migration.
- The legacy `notification_event_type` enum is intentionally retained as a rollback safety net until 3B–3D are verified.

## Verification
- TypeScript build (auto-run by harness) passes with the casts removed.

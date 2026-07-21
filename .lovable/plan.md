# Mailgun engagement signals (opens/clicks) on invitations

Additive extension of the existing delivery-status pipeline. `delivery_status` / `delivery_event_at` semantics stay identical (terminal outcomes only). Opens and clicks land in four new columns and surface as a secondary badge next to the existing one in Manage Invites.

## 1. Migration — `user_invitations`

```sql
ALTER TABLE public.user_invitations
  ADD COLUMN first_opened_at  timestamptz,
  ADD COLUMN open_count       integer NOT NULL DEFAULT 0,
  ADD COLUMN first_clicked_at timestamptz,
  ADD COLUMN click_count      integer NOT NULL DEFAULT 0;
```

No RLS/grant/FK/enum changes. `accepted_at` untouched.

## 2. `supabase/functions/mailgun-webhook/index.ts`

Restructure so terminal delivery and engagement are independent branches off the same lookup.

**Explicit change to the current early-return:** today, lines 114–118 do:

```ts
const status = mapEvent(event, severity);
if (!status) {
  console.log("mailgun-webhook: ignored event", { event, severity });
  return ok();
}
```

That early `return ok()` currently short-circuits every non-terminal event before the DB lookup runs. **This early return must be removed.** Replace it with: compute `status` (may be `null`); if `status` is `null` AND `event` is neither `"opened"` nor `"clicked"`, then log "ignored event" and `return ok()` (preserves existing no-op for `accepted`, `unsubscribed`, etc.). Otherwise fall through to the shared lookup so opened/clicked reach Branch B.

Flow after that fix:

- Trim `messageId` (unchanged, lines ~109–112).
- Compute `eventAtIso` from `ed.timestamp` (fallback `now()`), same as today.
- Single lookup:
  ```ts
  .from("user_invitations")
  .select("id, first_opened_at, first_clicked_at, open_count, click_count")
  .eq("mailgun_message_id", messageId)
  .limit(1).maybeSingle();
  ```
  Note the explicit inclusion of `open_count` and `click_count` — required because Branch B increments them in TS and both columns are `NOT NULL DEFAULT 0`; reading them as `undefined` would produce `undefined + 1 = NaN` and violate the constraint on write.
- Branch A — terminal delivery (unchanged behavior): if `status` is non-null, update `delivery_status` + `delivery_event_at`. Existing logging preserved.
- Branch B — engagement (new):
  - `event === "opened"` → `update { open_count: (invite.open_count ?? 0) + 1, first_opened_at: invite.first_opened_at ?? eventAtIso }`.
  - `event === "clicked"` → same pattern for `click_count` / `first_clicked_at`.
  - Best-effort counters; a single event body carries one `event`, so branches are mutually exclusive per call.
- Signature verification, always-200 response, and top-level try/catch unchanged.

## 3. `supabase/functions/reconcile-invite-delivery-status/index.ts`

Extend the per-row loop that already walks the Mailgun events response:

- Keep the existing 50-row batch, 7-day window, 250 ms sleep, error accounting, and terminal-status update path.
- While walking `items`, additionally:
  - Count `opened` items → `openedCount`; track earliest `opened` timestamp → `firstOpenedTs`.
  - Same for `clicked` → `clickedCount`, `firstClickedTs`.
- Row select expands to include `first_opened_at, first_clicked_at, open_count, click_count` so the null-guard on `first_*_at` works without re-reading.
- Build the update patch:
  - Include `delivery_status` + `delivery_event_at` only when a terminal event was picked (existing behavior).
  - If `openedCount > 0`: set `open_count = openedCount`, and `first_opened_at = firstOpenedTs` only when current row value is null.
  - Same for clicks.
  - Empty patch → row stays pending (unchanged).
- Summary log gains `opened_updated` / `clicked_updated`.

## 4. `src/pages/ManageInvites.tsx` — UI

- Extend `InviteRow` with `first_opened_at?: string | null`, `open_count?: number`, `first_clicked_at?: string | null`, `click_count?: number`. No query change (`select("*")`).
- In the Status column, keep the existing `delivery_status` badge exactly as today.
- Immediately after it, render a second, independent engagement badge:
  - `first_clicked_at` set → `<Badge variant="outline">` with `MousePointerClick` icon, label "Clicked", tooltip `Clicked N time(s) — first click <formatted date>`.
  - Else `first_opened_at` set → `<Badge variant="outline">` with `Eye` icon, label "Opened", tooltip `Opened N time(s) — first open <formatted date>`.
  - Else → render nothing.
- Both badges live side-by-side; no re-layout of the row. Icons from `lucide-react` (existing dep). Date formatting reuses the helper already used for `delivery_event_at`.

## Verification (in order)

1. Confirm migration adds exactly the four columns; no other diff.
2. Regenerate Supabase types (auto after migration).
3. Invoke `reconcile-invite-delivery-status` once. Confirm:
   - bwfat.com.au (bounced) rows still show `open_count = 0`, `first_opened_at = null`.
   - Any historical delivered+opened row picks up non-zero counters.
4. Send a fresh invite to a mailbox that will open + click. Confirm webhook path writes both counters and the engagement badge appears with correct tooltip.
5. Visually verify Manage Invites: delivered+opened row shows both badges; delivered-only shows just delivery badge; bounced row unchanged.

## Out of scope

- No changes to `delivery_status` enum, RLS, FKs, or `accepted_at`.
- Copy Link / resend-invite / cancel-invite flows unchanged.
- No filter/sort by engagement in this pass.

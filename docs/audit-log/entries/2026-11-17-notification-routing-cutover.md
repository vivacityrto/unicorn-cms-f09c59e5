# Audit: 2026-11-17 — notification-routing-cutover

**Trigger:** ad-hoc. Carl decided to skip the planned shadow period and go straight to full execution of the notification redesign ([design doc](../../kb/reference/notification-redesign-2026-11-17.md)).
**Scope:** two rows in `public.notification_routing_settings` (data only). No schema, function, trigger or policy changed; the code was applied earlier ([foundation](2026-11-17-notification-routing-foundation.md), [message routing](2026-11-17-notification-message-routing.md), [resolver fix](2026-11-17-notification-resolver-eligible-owners.md)).
**Status:** applied to production on 17 November 2026 (project `yxkgdalkbrriasiyyrwk`, Carl's explicit instruction: "i dont want a shadow period, i want full execution and implementation").

## What changed

| Setting | Before | After |
|---|---|---|
| `message_routing_mode` | `legacy` | `resolver` |
| `escalation_enabled` | `false` | `true` |

`escalation_hours` stays `4`. `updated_by` is the authorising Super Admin (Carl). Two `audit_events` rows (`entity = 'notification_routing_setting'`, `action = 'updated'`) record each change with its old and new value.

**Effect:** from this point a client-sent message notifies, for each tenant, the primary CSC and their delegates (AJ and Ezel, delegates of every CSC), anyone watching or opted in, and, when the tenant has no eligible primary CSC, every Super Admin. It no longer notifies all 19 active internal staff. Messages older than the cutover are not touched by the trigger. The escalation job (`*/15 * * * *`) now escalates an unread owner notification to Super Admins after 4 working hours of the primary CSC's own calendar.

## Evidence

- **Dry run (read-only) before the change:** 2 unread staff `message` notifications existed, both AJ's, and the resolver allows AJ for those tenants, so the cutover needed no new inbox cleanup (the earlier [cleanup](2026-11-17-notification-inbox-cleanup.md) had already cleared the rest). Dave: 0 unread.
- **Postflight (read-only):** settings read `message_routing_mode=resolver`, `escalation_enabled=true`, `escalation_hours=4`; the four triggers on `tenant_messages` are enabled (the shadow trigger does nothing outside `shadow` mode); the escalation job is active; calling `escalate_unread_client_messages()` returned 0 (nothing overdue, as expected, because no owner notifications exist yet); 0 escalation rows; the resolver for a sample tenant returned its primary CSC plus AJ and Ezel.
- **Not verified in production:** a real client message in `resolver` mode. None had arrived at the time of the change. The behaviour is proven on `unicorn-qa` (31 message-routing checks and 47 resolver checks, all rolled back).

## What was skipped, and the risk

The planned shadow period compared what the new rules would send against what the old fan-out sent, over real traffic, before any inbox changed. Skipping it means the first real client messages are the first production test. Mitigations in place: QA proof of every branch; the resolver run against all 67 tenants with an active assignment before the change (65 reach their primary CSC; the two tenants whose CSC is a disabled Super Admin or a system account go to Super Admins as "unassigned"); and a one-statement rollback.

**Check on the first real client messages (read-only):** the staff notifications for a message should be only the tenant's primary CSC, AJ and Ezel, each with `metadata.routing_reason` of `primary_csc` or `delegate`, and none of the other 16 staff. Any `legacy_staff` reason means the function was not replaced as intended.

## Rollback

One audited statement, instant, no deploy:

```sql
UPDATE public.notification_routing_settings
   SET value = CASE key WHEN 'message_routing_mode' THEN 'legacy' WHEN 'escalation_enabled' THEN 'false' END,
       updated_at = now()
 WHERE key IN ('message_routing_mode', 'escalation_enabled');
```

Notifications already written keep their rows. Escalation notifications (`dedupe_key` like `tm-esc:%`) stay unless removed by hand.

## Open questions parked

- Tenants 7492 and 7564 still need a real primary CSC; until then their client messages go to all six Super Admins.
- The shadow trigger and log remain installed but inert; remove them in a later clean-up once nobody expects to use `shadow` mode.

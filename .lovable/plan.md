

## Fix: Scope Client Notifications to Active Tenant

### Problem
`useClientNotifications` queries `user_notifications` without a `tenant_id` filter. When a user (or staff impersonating) views `/client/notifications`, they see notifications from **all** tenants — 314 unrelated items in this case.

The `markAllAsRead` mutation is also unscoped, meaning it would mark notifications for other tenants as read too.

### Changes

**`src/hooks/useClientNotifications.tsx`**
- Import `useClientTenant` to get `activeTenantId`
- Add `.eq("tenant_id", activeTenantId)` to the query
- Add `activeTenantId` to the query key for proper cache separation
- Add `.eq("tenant_id", activeTenantId)` to the `markAllAsRead` mutation
- Guard `enabled` on `!!activeTenantId` in addition to `!!profile?.user_uuid`

### Technical Detail

```typescript
const { activeTenantId } = useClientTenant();

// Query
.from("user_notifications")
.select("*")
.eq("tenant_id", activeTenantId)
.order("created_at", { ascending: false });

// markAllAsRead
.update({ is_read: true })
.eq("is_read", false)
.eq("tenant_id", activeTenantId);

// queryKey includes tenant
queryKey: ["client-notifications", profile?.user_uuid, activeTenantId],
enabled: !!profile?.user_uuid && !!activeTenantId,
```

| Action | File |
|--------|------|
| Modify | `src/hooks/useClientNotifications.tsx` |


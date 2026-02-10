# Client Portal — Tenant-Safe Data Access Checklist

Every query on a `/client/*` route **must** include `tenant_id = resolved_tenant_id` unless explicitly noted. RLS policies enforce this at the database level, but application-layer filtering is also required as defence-in-depth.

---

## Client Home (`/client/home`)

| Item | Detail |
|---|---|
| **Allowed tables** | Tenant-scoped aggregate counts only (documents, notifications, reminders) |
| **Required filter** | `tenant_id = activeTenantId` |
| **Forbidden** | Global search without tenant filter, cross-tenant aggregates |
| **RLS** | `has_tenant_access_safe(tenant_id, auth.uid())` on all queried tables |
| **API pattern** | `.eq('tenant_id', activeTenantId)` on every Supabase query |

---

## Documents (`/client/documents`)

| Item | Detail |
|---|---|
| **Allowed tables** | `portal_documents`, `tenant_document_requests`, `tenant_document_request_attachments` |
| **Required filter** | `tenant_id = activeTenantId`, visibility in `('shared_with_client', 'uploaded_by_client')` |
| **Forbidden** | Template manager, system documents, global document library, other tenant documents |
| **RLS** | `has_tenant_access_safe` on all document tables |
| **API pattern** | `.eq('tenant_id', activeTenantId)` + visibility filter |

---

## Resource Hub (`/client/resource-hub`)

| Item | Detail |
|---|---|
| **Allowed tables** | Global resources table (read-only) |
| **Required filter** | Filtered by membership access flags (e.g. `is_published = true`) |
| **Forbidden** | Other tenants' uploaded resources, draft/unpublished items |
| **RLS** | Public read for published resources; no tenant join required |
| **API pattern** | `.eq('is_published', true)` — no tenant-specific uploads exposed |

---

## Calendar (`/client/calendar`)

| Item | Detail |
|---|---|
| **Allowed tables** | Public events (read-only, no tenant filter needed), tenant-scoped reminders/meetings |
| **Required filter** | Reminders: `tenant_id = activeTenantId` |
| **Forbidden** | Vivacity internal meetings, other tenant events |
| **RLS** | `has_tenant_access_safe` on tenant-scoped calendar items |
| **API pattern** | `.eq('tenant_id', activeTenantId)` for reminders |

---

## Notifications (`/client/notifications`)

| Item | Detail |
|---|---|
| **Allowed tables** | `user_notifications` or tenant notification views |
| **Required filter** | `tenant_id = activeTenantId` AND `recipient_user_id = auth.uid()` where applicable |
| **Forbidden** | Admin/system notifications, other users' notifications |
| **RLS** | Row-level filtering by `recipient_user_id` and `tenant_id` |
| **API pattern** | `.eq('tenant_id', activeTenantId)` |

---

## Reports (`/client/reports`)

| Item | Detail |
|---|---|
| **Allowed tables** | Tenant summary views only |
| **Required filter** | `tenant_id = activeTenantId` |
| **Forbidden** | Cross-tenant reporting, CSC performance dashboards, internal analytics |
| **RLS** | `has_tenant_access_safe` |
| **API pattern** | `.eq('tenant_id', activeTenantId)` |

---

## Team (`/client/team`)

| Item | Detail |
|---|---|
| **Allowed tables** | `tenant_members` (tenant users only, max 5 child accounts) |
| **Required filter** | `tenant_id = activeTenantId` |
| **Forbidden** | Vivacity team user directory, users from other tenants |
| **RLS** | `has_tenant_access_safe` on `tenant_members` |
| **API pattern** | `.eq('tenant_id', activeTenantId)` |

---

## Settings (`/client/settings`)

| Item | Detail |
|---|---|
| **Allowed tables** | `users` (own profile only) |
| **Required filter** | `user_uuid = auth.uid()` |
| **Forbidden** | Other users' profiles, admin settings, system configuration |
| **RLS** | `users_select_own` policy |
| **API pattern** | `.eq('user_uuid', userId)` |

---

## General Rules

1. **Never** query without `tenant_id` on tenant-scoped tables.
2. **Never** join across tenants.
3. **Never** fall back to unscoped queries if tenant filter fails.
4. **Always** use `activeTenantId` from `useClientTenant()` context.
5. **Preview mode** (`isReadOnly = true`): block all mutations in UI.
6. **RLS is defence-in-depth** — application-layer filters are also mandatory.

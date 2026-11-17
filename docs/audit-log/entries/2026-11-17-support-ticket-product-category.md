# 2026-11-17 — Support ticket product is a category

**Change:** Dropped `public.support_tickets` check constraint `support_tickets_product_tenant_chk`, which required every non-Unicorn product (ComplyHub, Company) to sit under Vivacity's tenant 6372.

**Why:** Staff could not change a ticket's product from the Product selector when the ticket was raised by a client. The update was refused and rolled back. The product is a category for what the issue concerns, not a tenant rule, so the constraint was removed.

**Applied:** Production project `yxkgdalkbrriasiyyrwk`, migration `support_tickets_product_category` (file `supabase/migrations/20261117100000_support_tickets_product_category.sql`). Approved by Carl in chat on 17 Nov 2026.

**Verification:** A read-only check after the migration showed `support_tickets_product_tenant_chk` absent and `support_tickets_product_chk` (the allowed values) still present.

**Not changed:** The `create_support_ticket` function still refuses staff-created ComplyHub or Company tickets under a tenant other than 6372. The new-ticket dialog never creates those, so no current flow is affected.

**Rollback:** Re-add the constraint with `CHECK (product = 'unicorn' OR tenant_id = 6372)`, only once no non-Unicorn ticket sits under another tenant.

**UI:** The Product selector is now an inline column in the tickets table and a field on mobile cards, beside Status and Assigned to.

## Follow-up: reporter keeps access (migration `20261117110000_support_tickets_reporter_keeps_access`)

Review on PR #1537 found that the reporter rules still required `product = 'unicorn'`, so reclassifying a client's ticket removed the reporter's access to it. Carl chose to keep access in chat on 17 Nov 2026.

**Change (applied to production `yxkgdalkbrriasiyyrwk`):** dropped the product predicate from `can_view_support_ticket`, `can_read_support_file` and the `support_tickets_select` policy. Reporter access still requires being the reporter, a live ticket and current tenant access. Staff access is unchanged.

**Verification:** read back the live policy and both functions after applying. None still mentions `product`.

**Rollback:** restore the `product = 'unicorn'` predicate in the three definitions, from `supabase/migrations/20261113100000_support_tickets_model.sql`.

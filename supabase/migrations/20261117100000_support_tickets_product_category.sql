-- Support tickets: product is a category, not a tenant rule.
-- Staff can change a ticket's product (Unicorn, ComplyHub, Company) on any
-- ticket, including tickets raised by a client, so the ticket stays under the
-- client's tenant. The previous check pinned every non-Unicorn product to
-- Vivacity's tenant (6372), which refused those updates.
-- migration-target-project: yxkgdalkbrriasiyyrwk
--
-- Rollback: ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_product_tenant_chk
--   CHECK (product = 'unicorn' OR tenant_id = 6372);  (only once no non-Unicorn ticket sits under another tenant)

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_product_tenant_chk;

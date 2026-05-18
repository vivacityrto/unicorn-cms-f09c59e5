## Fix Evidence Request Frontend/DB Column-and-Value Mismatches

Three independent renames across five evidence-related files only. No DB changes, no new components, no schema edits.

---

### Fix 1 — `sort_order` → `display_order` (evidence_request_items only)

The DB column is `display_order`. Frontend incorrectly uses `sort_order` in the `EvidenceRequestItem` interface, sort logic, and insert payloads.

**Files & lines:**
- `src/hooks/useEvidenceRequests.tsx`
  - L18: interface field `sort_order: number` → `display_order: number`
  - L89: `a.sort_order - b.sort_order` → `a.display_order - b.display_order`
  - L128: same sort expression → `a.display_order - b.display_order`
  - L222: insert payload `sort_order: index` → `display_order: index`
- `src/hooks/useAuditPrep.ts`
  - L139: `.order('sort_order', { ascending: true })` → `.order('display_order', { ascending: true })`
- `src/components/audit/workspace/SendEvidenceRequestDrawer.tsx`
  - L79: `.order('sort_order', { ascending: true })` → `.order('display_order', { ascending: true })`

### Fix 2 — `reviewed_by_user_id` → `reviewed_by` (TypeScript interface only)

DB column is `reviewed_by`. Only the local `EvidenceRequestItem` interface is wrong; no read/write call sites use it yet.

**File & line:**
- `src/hooks/useEvidenceRequests.tsx`
  - L16: `reviewed_by_user_id: string | null` → `reviewed_by: string | null`

### Fix 3 — status value `revision_requested` → `resubmit_requested`

DB CHECK constraint allows `resubmit_requested`, not `revision_requested`. Change only the string literal; the user-facing label "Revision needed" stays unchanged.

**Files & lines:**
- `src/hooks/useAuditPrep.ts`
  - L173: TS union literal `'accepted' | 'revision_requested'` → `'accepted' | 'resubmit_requested'`
- `src/components/audit/workspace/EvidenceRequestsSection.tsx`
  - L22: status map key `revision_requested:` → `resubmit_requested:`
  - L108: comparison `item.status === 'revision_requested'` → `item.status === 'resubmit_requested'` (keep label "Revision needed")
  - L132: mutate payload `status: 'revision_requested'` → `status: 'resubmit_requested'`
- `src/components/client/AuditPreparationSection.tsx`
  - L16: status map key `revision_requested:` → `resubmit_requested:`
  - L107: comparison `item.status === 'revision_requested'` → `item.status === 'resubmit_requested'`
  - L125: comparison `item.status === 'revision_requested'` → `item.status === 'resubmit_requested'`

---

### Verification

1. Run `tsc --noEmit` (or build) to confirm TypeScript passes.
2. Search project-wide for `sort_order` and `reviewed_by_user_id` and `revision_requested` inside the five evidence files — expect zero hits for the old names. Hits in academy/, pdp/, and other unrelated modules are expected and must be left untouched.
3. Smoke: create an evidence request from CSC view → Documents → Evidence Requests → Send Request should succeed without schema cache error.

### Out of scope (unchanged)
- Any DB / migration / RPC / trigger code
- User-visible label "Revision needed" — stays as-is
- Other `sort_order` references in academy/, pdp/, compliance templates, etc.
- `tenant_document_requests` feature
- Reminder cron `audit_send_evidence_reminders` filter `WHERE er.status = 'sent'`

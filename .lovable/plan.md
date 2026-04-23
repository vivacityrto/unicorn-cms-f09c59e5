

## Plan: Prevent duplicate active packages of the same type — with regulatory exception

### Refinement
The previous plan blocked any second active package of the same `package_type`. The user has clarified one valid exception: a tenant may legitimately hold **two concurrent regulatory packages** when they cover **different regulatory streams** — RTO, CRICOS, and GTO are distinct compliance regimes and a single client can hold more than one.

This applies to:
- **KickStart (KS)** — `package_type = 'regulatory_submission'` — a client can be doing an RTO KickStart and a CRICOS KickStart in parallel.
- **Memberships** — `package_type = 'membership'` — already modelled as dual (M-RR for RTO + M-CR for CRICOS), with the existing `membership_allocation_groups` weighting infrastructure proving the pattern.
- **GTO** packages — distinct from both.

The differentiator is the package's **regulatory stream** (RTO / CRICOS / GTO), not just its `package_type`.

### How the stream is identified
Packages already encode their stream via naming convention and code:
- `M-RR` (Membership RTO), `M-CR` (Membership CRICOS) — already in use for the Davies tenant
- `KS-RTO`, `KS-CRICOS`, `KS-GTO` — KickStart variants
- Equivalent codes for audits and other regulatory packages

We will derive a **stream tag** for each package from `packages.code` / `packages.name` using a small pure SQL helper (`fn_package_stream(package_id) returns text` → `'rto' | 'cricos' | 'gto' | 'generic'`). The helper inspects the `code`/`name` for the suffix tokens (`-RR`, `-RTO`, `-CR`, `-CRICOS`, `-GR`, `-GTO`). `'generic'` means the package isn't stream-specific (e.g. project work, consultations).

If the user prefers an explicit column over name parsing we can add `packages.regulatory_stream` (text, nullable) and backfill — see Open question.

### Updated guard logic

A new active stand-alone package is **blocked** if there is an existing active stand-alone instance for the same tenant where:

```
existing.package_type = new.package_type
AND (
     fn_package_stream(existing.package_id) = 'generic'
  OR fn_package_stream(new.package_id) = 'generic'
  OR fn_package_stream(existing.package_id) = fn_package_stream(new.package_id)
)
```

Plain English:
- Two `membership` packages of the **same** stream → blocked (e.g. two RTO Memberships).
- `M-RR` (RTO Membership) + `M-CR` (CRICOS Membership) → **allowed**.
- `KS-RTO` + `KS-CRICOS` + `KS-GTO` concurrently → **allowed**.
- Two `KS-RTO` instances → **blocked**.
- Stream-less packages (audits without a stream tag, generic projects) fall back to "one active per type" — safe default.

Add-ons (`parent_instance_id IS NOT NULL`) remain unaffected — they always stack on their parent.

### Changes

**1. Migration**
- Create `public.fn_package_stream(p_package_id bigint) returns text` — pure, `STABLE`, parses `code` then `name`.
- Update `public.start_client_package` RPC to run the guard above before insert. On conflict raise:
  ```
  raise exception 'DUPLICATE_PACKAGE_TYPE: tenant % already has an active % (% stream) package: %. Cancel or complete it first.',
    p_tenant_id, v_pkg_type, v_stream, v_existing_name
    using errcode = 'P0001';
  ```

**2. `src/components/client/StartPackageDialog.tsx`**
- `fetchData` already loads `activeInstances`; extend it to include each active package's `package_type`, `code`, and `name`.
- When a package is selected (and `attachToInstanceId` is empty):
  - Compute its stream client-side using the same suffix rules (small `getPackageStream(code, name)` helper in `src/lib/packageStream.ts`).
  - Find any active stand-alone instance with the same `package_type` AND a conflicting stream per the rule above.
  - If found: disable **Start Package** and show inline warning:  
    *"This client already has an active {Type} ({Stream}) package: **{name}**. Cancel or complete it first, or attach as an add-on."*
- Show the stream tag (RTO / CRICOS / GTO) as a small badge next to each option in the Package dropdown so the user sees why something is or isn't allowed.

**3. `src/hooks/useClientPackageInstances.tsx`**
- Detect `error.message?.startsWith('DUPLICATE_PACKAGE_TYPE')` and surface the message verbatim (already user-friendly) via toast.

### Out of scope
- Auto-cancelling the old instance for upgrades — cancellation stays explicit with a reason.
- Backfilling existing duplicates — handled separately via the SuperAdmin Package Data Manager.
- Changing the `membership_allocation_groups` weighting model — this guard sits before allocation, doesn't touch it.

### Open question for the user
The stream detection relies on package `code`/`name` suffixes (`-RR`, `-CR`, `-RTO`, `-CRICOS`, `-GR`, `-GTO`). This matches every membership and KS package currently in use. If you'd prefer an explicit `packages.regulatory_stream` column instead (more robust for future packages with non-standard codes), say the word and the migration will add + backfill it.

### Verification
1. Tenant 6278 (active `M-RR` Ruby): try to start `M-DR` (Diamond RTO Membership) → **blocked** (same membership + RTO stream). Cancel Ruby → Diamond starts. ✓
2. Same tenant: try to start `M-CD` (Diamond CRICOS Membership) → **allowed** (different stream). ✓
3. Tenant with active `KS-RTO`: try to start `KS-CRICOS` → **allowed**. Try to start a second `KS-RTO` → **blocked**. ✓
4. Tenant with active `KS-RTO` AND `KS-CRICOS`: try to start `KS-GTO` → **allowed** (three regulatory streams running in parallel). ✓
5. Add an extra-time package (`parent_instance_id` set) to any of the above → **always allowed**. ✓
6. Direct RPC call from SQL editor reproduces all results.


## Plan — Target RTO for Due Diligence audits

For Due Diligence audits, the **client (Purchaser)** commissions the audit but the audit is *about* a different RTO (the **Target RTO** being acquired). Today the New Audit wizard auto-fills the snapshot fields (RTO Name, RTO Number, CRICOS, CEO, address, contacts, website) from the *Purchaser's* TGA record, which is wrong for DD — those snapshot fields should describe the Target.

This change adds an explicit "Target RTO" capture step for `due_diligence` and `due_diligence_combined` audits, keyed by RTO code with a TGA lookup so the snapshot can be auto-populated. No schema changes — we reuse the existing `snapshot_*` columns on `client_audits` (which is exactly what they're for: details captured at audit time that flow through to the report).

### 1. `src/components/audit/NewAuditModal.tsx`

**a. New "Target RTO" panel rendered above the snapshot grid in Step 3, only when `selectedCard.value` is `due_diligence` or `due_diligence_combined`:**

```text
┌──────────────────────────────────────────────────────────────┐
│ Target RTO (the RTO being assessed for the Purchaser)        │
│                                                              │
│ Lookup by RTO code or name  [ 12345  ▼ Search ]              │
│  └ pulls v_tga_audit_snapshot by rto_code → fills below      │
│                                                              │
│ ☐ Not yet on the national register (enter manually)          │
└──────────────────────────────────────────────────────────────┘
```

- Combobox `TargetRtoCombobox` queries `v_tga_audit_snapshot` filtered by `rto_code ilike` or `legal_name ilike` (debounced, top 10 results), shows `rto_code — legal_name`. On select, populate `rtoName`, `rtoNumber`, `cricosCode`, `ceo`, `siteAddress`, `phone`, `email`, `website` from the chosen TGA row (overwriting whatever was pre-filled from the Purchaser).
- Manual checkbox simply skips the lookup; the user types into the snapshot fields below.
- Helper text under the panel: *"These details describe the RTO under review and will appear in the final report. The client commissioning the audit ({tenantName}) remains the Purchaser."*

**b. Suppress the Purchaser auto-fill for DD audits.** In the existing `useEffect` at lines 320-346 that pre-fills snapshot fields from the Purchaser's TGA row: when `selectedCard?.value` is a DD type, leave `rtoName`/`rtoNumber`/`cricosCode`/`ceo`/`siteAddress`/`phone`/`email`/`website` blank so the user explicitly chooses the Target.

**c. Step 2 wording.** Where the modal currently labels the client field `Client *`, render `Client (Purchaser) *` for DD audits — to match the rest of the UI and the memory of the prior "Purchaser" terminology fix.

**d. Step 3 heading.** For DD audits, change the existing Step 3 helper line *"These details are captured at the time of the audit…"* to *"These details describe the **Target RTO** under review and will appear in the report exactly as shown here."*

**e. Validation.** For DD audits, require `rtoName` to be non-empty before allowing Save (currently no per-field validation; add a small inline error and disable the Save button when missing).

### 2. Audit header & report surfaces (read-only display)

The header already shows the Purchaser as the client. We add a Target RTO line where the audit header / report identifies the audit subject.

- **`src/pages/AuditWorkspaceNew.tsx`** (header strip, immediately under the breadcrumb): for DD audits, render a small inline pill:

  ```text
  Purchaser: {client_name}        Target RTO: {snapshot_rto_name} ({snapshot_rto_number})
  ```

  Only shown when `audit.audit_type` starts with `due_diligence`. If `snapshot_rto_name` is null, show a muted "Target RTO not set — edit snapshot details to add".

- **`src/components/audit/workspace/ReportTab.tsx`**: in the report header block, for DD audits, replace the single client line with a two-row block — `Purchaser: …` and `Target RTO: …` (Name, RTO #, CRICOS if present). Non-DD audits unchanged.

- **`src/components/audit/AuditTypeBadge.tsx`** / DD listing rows in `src/pages/AuditsAssessments.tsx`: where each audit row shows the client name, append `→ {snapshot_rto_name}` for DD types when present. Keeps the dashboard scannable.

### 3. Editing after creation

The Overview tab already exposes the snapshot fields for editing post-creation (existing behaviour). No change needed there — the same `snapshot_rto_*` fields are now the Target RTO fields for DD audits.

### What this does NOT change

- No DB migrations. `client_audits.snapshot_*` columns are reused.
- No change to `subject_tenant_id` semantics — it remains the Purchaser/commissioning client.
- No change to the existing Purchaser auto-fill behaviour for non-DD audit types (CHC, Mock Audit, etc.).
- No change to the AI / report generators beyond the visible header tweak in ReportTab.

### Verification

1. Open New Audit → pick a Purchaser → choose **RTO Due Diligence**. Step 3 shows the new "Target RTO" panel at the top; the snapshot fields below are blank.
2. In the Target RTO combobox, type `41020` → selects "Vivacity Coaching & Consulting" → snapshot fields auto-populate with that RTO's TGA data.
3. Save → audit row appears with Purchaser name and `→ Target RTO name` suffix on the dashboard.
4. Open the saved DD audit → header shows both `Purchaser: …` and `Target RTO: …` pills. Report tab header shows the same two-row block.
5. Open a CHC audit (non-DD) → no "Target RTO" panel; Purchaser auto-fill still pre-populates snapshot fields as today.
6. Try Save on a DD audit with empty Target RTO Name → Save disabled with inline error.

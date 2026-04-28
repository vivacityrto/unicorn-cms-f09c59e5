# Due Diligence — Combined: Target RTO Snapshot Relabel + TGA Lookup by RTO Number

This plan integrates the two prior agreed changes into a single implementation pass.

## Goals
1. Make it visually obvious on the Overview tab and final Report that the snapshot is the **Target RTO** (not the Purchaser) for Due Diligence audits.
2. Let auditors auto-fill the Target RTO snapshot from training.gov.au by typing the RTO Number and clicking **Lookup TGA**.

## Reuse (no new infrastructure)
- Edge function `tga-rto-preview` (already deployed) → returns legal_name, ABN, web_address, registration dates, and a full `raw_snapshot` with TGA `addresses[]` and `contacts[]`.
- Existing `TargetRtoCombobox` (name search) stays as-is.

## Changes

### 1. New helper — `src/lib/tga/lookupTargetRto.ts`
Single async `lookupTargetRtoByCode(code: string)`:
- Validates `^\d{4,6}$`.
- Calls `supabase.functions.invoke('tga-rto-preview', { body: { rtoId: code } })`.
- Maps response into the snapshot shape:
  - `rto_name` ← `data.legal_name` (fallback `data.trading_name`)
  - `rto_number` ← `data.code`
  - `website` ← `data.web_address`
  - `site_address` ← principal/head-office address from `raw_snapshot.addresses` (prefer `type === "Principal"`, else first current; format `street1, suburb STATE postcode`)
  - `phone` / `email` ← from `raw_snapshot.contacts` (prefer Principal Executive Officer)
  - `ceo` ← name of Principal Executive Officer contact, if present
- CRICOS code is NOT returned by this endpoint and stays manual.
- Returns `{ ok, data?, error? }`.

### 2. New shared component — `src/components/audit/TgaRtoLookupRow.tsx`
Compact row used in both the modal and the Overview snapshot editor:
- RTO Number input (4–6 digits, inline validation).
- **Lookup TGA** button (cyan primary) with loading state.
- `onResult(snapshot)` callback fires with the mapped fields.
- Toasts: 404 → "RTO {code} not found on training.gov.au"; other errors → message.

### 3. `src/components/audit/NewAuditModal.tsx` — Step 3 Target RTO panel
Inside the existing `isDueDiligence` panel, **above** the `TargetRtoCombobox`:
- Render `<TgaRtoLookupRow />`.
- On result: if any target field already has user input, show a confirm "Overwrite manual entries?" toast (Replace / Keep). Otherwise fill blank fields directly.
- Existing combobox remains as the secondary "search by name" path.
- Keep the conditional "Target RTO Name / Number *" labels already in place.

### 4. `src/components/audit/workspace/OverviewTab.tsx`
- Compute `isDueDiligence = audit.audit_type === 'due_diligence' || audit.audit_type === 'due_diligence_combined'`.
- **Card title**: `"Target RTO Snapshot"` (DD) vs `"Client Details Snapshot"` (non-DD).
- **Helper text** (DD only): `"These details describe the Target RTO being assessed and appear in the final report."`
- **Read-only label map** (DD): `"RTO Name" → "Target RTO Name"`, `"RTO Number" → "Target RTO Number"`. Other labels unchanged.
- **Edit-mode auto-generated labels**: special-case `snapshot_rto_name` / `snapshot_rto_number` to render with the "Target" prefix when DD.
- **Edit mode (DD only)**: render `<TgaRtoLookupRow />` at the top of the edit form so a snapshot can be refreshed/repaired post-creation. Same overwrite-confirmation behaviour.

### 5. `src/components/audit/workspace/ReportTab.tsx`
- Apply the same DD-conditional relabel to the snapshot RTO Name / RTO Number rows (≈ lines 158, 176) so the released report reads "Target RTO Name / Target RTO Number" for DD audits. Non-DD unchanged.

## Out of scope
- No DB / RLS / schema changes.
- No edge function changes.
- CRICOS code lookup (separate TGA endpoint) — manual entry remains.
- `AuditWorkspaceNew.tsx` sub-header — already shows "Purchaser → Target RTO" framing.

## Verification
1. **Create DD audit** → Step 3 → enter `40888` → **Lookup TGA** → fields fill (legal name, address, website, phone, email); CRICOS stays blank.
2. Invalid code (`12`) → inline validation blocks request.
3. Non-existent code (`99999`) → toast "RTO 99999 not found on training.gov.au".
4. Existing DD audit → Overview → Edit snapshot → Lookup row visible; with manual edits present → confirm-before-overwrite prompt.
5. Overview card title reads **"Target RTO Snapshot"** with **"Target RTO Name / Number"** for DD; non-DD audits (CHC, Mock) unchanged.
6. Released DD report → Report tab shows **"Target RTO Name / Number"**.

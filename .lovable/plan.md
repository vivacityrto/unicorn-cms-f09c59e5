

## Goal
Replace the free-text "Training Products in Scope" textarea in New Audit modal Step 2 with a searchable, grouped multi-select populated from `tenant_rto_scope` for the selected client.

## Investigation
<lov-tool-use id="toolu_vrtx_018LEN8EfwjzWBrd6fuMKoCz" name="code--search_files" integration-id="code" data="{\"query\": \"training_products\", \"include_patterns\": \"src/components/audit/**\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_017mBPpgdje8gKJKXUVK3Jzb" name="code--search_files" integration-id="code" data="{\"query\": \"NewAuditModal\", \"include_patterns\": \"src/**\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01H6iEZV8FFEDZP9sx8tPg7c" name="code--search_files" integration-id="code" data="{\"query\": \"training_products\", \"include_patterns\": \"src/**\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01WyL1utk6JYuLKxE66tvT2p" name="code--search_files" integration-id="code" data="{\"query\": \"NewAuditModal\", \"include_patterns\": \"src/**\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_014YmLS1YsyhoMSf6KswW1xi" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/audit/NewAuditModal.tsx\", \"lines\": \"1-100\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Y5mySTVoVwfjinGRECEusQ" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/audit/NewAuditModal.tsx\", \"lines\": \"200-450\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01NsoYW8VZr7rMtna8bNdPrA" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/audit/NewAuditModal.tsx\", \"lines\": \"450-575\"}">
</lov-tool-use>
I have enough context. The `useTenantRtoScope` hook already exists and returns the right data shape.

<lov-plan>

## Plan: Scope-aware multi-select for Training Products in New Audit modal

### Component: `ScopeMultiSelect`
New file: `src/components/audit/ScopeMultiSelect.tsx`

A combobox-style multi-select built on `Popover` + `Command` (same primitives as Lead Auditor selector area uses Select; we'll use cmdk for searchable behaviour, matching existing `TenantCombobox` pattern).

Props:
- `tenantId: number | null`
- `value: string[]` — selected `code` values
- `onChange: (codes: string[]) => void`

Behaviour:
- Uses `useTenantRtoScope(tenantId)` (already exists), filters client-side to:
  - `status.toLowerCase() === 'current'`
  - `is_superseded === false`
  - `scope_type ∈ ('qualification', 'accreditedCourse', 'skillset')`
- While loading: show skeleton/disabled trigger.
- If zero matching rows: render fallback inline notice + plain text input (comma-separated), wired to same `onChange` (split/join on comma).
- Otherwise render combobox:
  - Trigger button shows count (`3 selected` / `Select training products…`).
  - Popover contains `Command` with `CommandInput` (filters on `code` + `title`).
  - `CommandGroup` per scope_type with humanised heading:
    - `qualification` → Qualifications
    - `skillset` → Skill Sets
    - `accreditedCourse` → Accredited Courses
  - Each group has a "Select all in group" item at top (toggles all group codes).
  - Each `CommandItem` shows `CODE — Title` with a check icon when selected.
- Selected items render as removable `Badge` chips below the trigger; clicking the × removes that code.

### Wire-up: `NewAuditModal.tsx`

Replace lines 474–479 (Training Products section) with:

```tsx
{selectedCard?.value !== 'due_diligence' && (
  <div>
    <Label>Training Products in Scope</Label>
    <ScopeMultiSelect
      tenantId={tenantId}
      value={trainingProductCodes}
      onChange={setTrainingProductCodes}
    />
  </div>
)}
```

State change:
- Replace `trainingProducts: string` (line ~) with `trainingProductCodes: string[]`.
- `resetForm` resets it to `[]`.
- `handleSave` (line 324) becomes:
  ```ts
  training_products: trainingProductCodes.length ? trainingProductCodes : undefined,
  ```

No DB schema changes — `client_audits.training_products` is already `text[]`.

### Files changed
- New: `src/components/audit/ScopeMultiSelect.tsx`
- Edit: `src/components/audit/NewAuditModal.tsx` (state type + Step 2 field + save mapping + reset)

No other Step 2 fields (Lead Auditor, Assisted By, Audit Title, Doc Number) are touched.


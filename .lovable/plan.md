

## Full Plan: TGA Address Transfer with Last Transfer Date

### 1. Database Migration — Add `transfer_date` column

Add a nullable `timestamp with time zone` column to `tenant_addresses`:

```sql
ALTER TABLE public.tenant_addresses
ADD COLUMN transfer_date timestamptz;
```

### 2. Changes to `src/components/client/ClientIntegrationsTab.tsx`

**Heading row layout** (line 767): Replace the plain `<h4>` with a flex row containing:
- Left: "Registered Addresses" heading
- Center-right: "Last transferred: 3 Mar 2026" text (muted, small) — fetched from `tenant_addresses` where `tenant_id` matches and `address_type = 'HO'`, reading the `transfer_date` field
- Far right: "Transfer to Tenant" button

**On component load / when tenant changes**: Query `tenant_addresses` for the HO record's `transfer_date` to display next to the button. Store in local state.

**Transfer function** (`handleTransferAddresses`):
1. Confirmation dialog (destructive variant, warns existing addresses will be replaced)
2. Delete all `tenant_addresses` for the tenant
3. Build and insert address rows with:
   - Address type mapping (first headOffice→HO, first postal→PO, delivery→DS, extras→OT)
   - `suburb` and `state` uppercased
   - `notes`: "Imported from TGA on 3 Mar 2026"
   - `created_by` / `updated_by`: current user ID
   - `transfer_date`: `new Date().toISOString()` on every row
4. Update the displayed last transfer date
5. Toast success/failure

**Display format** for last transfer date:
```
Last transferred: 3 Mar 2026
```
Using `toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })`. If no HO record exists, hide the label.

### Files modified
- **Migration**: new `transfer_date` column on `tenant_addresses`
- **`src/components/client/ClientIntegrationsTab.tsx`**: transfer button, confirm dialog, transfer logic, last transfer date display


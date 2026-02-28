

## Xero Integration Card (Deep-Link Style)

Add a Xero integration card to the Client Integrations tab, following the same pattern as ComplyHub. This is a URL-based integration — no API connection required at this stage.

### What It Does

- Stores two URLs per client (tenant): the **Xero Contact** link and the **Xero Repeating Invoice** link
- Provides "Open in Xero" buttons for quick access
- Fully audit-logged like ComplyHub

### Database Changes

Add two new columns to the `tenants` table:
- `xero_contact_url` (text, nullable)
- `xero_repeating_invoice_url` (text, nullable)

### New Component

Create `src/components/client/XeroCard.tsx` modelled on `ComplyHubCard.tsx`:
- Two URL input fields (Contact URL, Repeating Invoice URL)
- "Open in Xero" buttons when URLs are populated
- Save button with audit log entry (`xero_settings_updated`)
- Xero-branded icon (using a generic receipt/file icon from Lucide)

### Integration Tab Update

Add the `XeroCard` to `ClientIntegrationsTab.tsx` alongside the existing ComplyHub card.

### Future Potential (Not In Scope Now)

For reference, Xero's API supports:
- OAuth2 authentication for live data
- Invoice creation and status tracking
- Bank reconciliation status
- Contact sync
- Repeating invoice management

These could be added later with an edge function and OAuth connector if needed.

---

### Technical Detail

**Migration SQL:**
```sql
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS xero_contact_url text,
  ADD COLUMN IF NOT EXISTS xero_repeating_invoice_url text;
```

**Files to create:**
- `src/components/client/XeroCard.tsx` — mirrors ComplyHubCard pattern (load from tenants, save with audit log)

**Files to edit:**
- `src/components/client/ClientIntegrationsTab.tsx` — import and render `XeroCard` next to `ComplyHubCard`


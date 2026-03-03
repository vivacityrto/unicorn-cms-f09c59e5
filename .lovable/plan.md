

## Plan: Show Asterisk on TGA-Transferred Addresses

### What
Add a `*` indicator after each address that was transferred from TGA (i.e., has a non-null `transfer_date`).

### Changes

**`src/components/client/ClientAddressSection.tsx`**

1. Add `transfer_date: string | null` to the `TenantAddress` interface (line 14-25). The query already fetches `*` so the data is returned, it's just not typed.

2. In the address list rendering (around line 331-339), append ` *` after the formatted address line when `address.transfer_date` is truthy.

### Transfer Verification

The transfer logic in `ClientIntegrationsTab.tsx` already correctly sets `transfer_date: now` on every inserted row during the "Transfer to Tenant" operation (lines 499-501 and 523-525). No changes needed there.


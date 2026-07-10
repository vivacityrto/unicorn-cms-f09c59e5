# Add Client redesign: RTO-first layout + auto-fetch + auto-link TGA

Scope: `src/components/AddTenantDialog.tsx` only (with an optional small addition in `src/lib/tga/lookupTargetRto.ts` for extra preview fields). Kickstart flow (`isKickStart === true`, package_type `regulatory_submission`) stays 100% unchanged — same fields, order, and copy.

## 1. RTO-first layout (non-Kickstart only)

- Remove RTO from its current pairing with ABN (~L539-559). Reposition it **directly after the Package select (~after L479), before Legal Name** — RTO now drives the rest of the form.
- Replace the plain `<Input>` with the existing `TgaRtoLookupRow` (`src/components/audit/TgaRtoLookupRow.tsx`), seeded from `rtoCode`. Its input drives `rtoCode`; the button is enabled only for 4–6 digits (component's own validation). On success (`onResult`), stash the snapshot in a new `confirmedTgaData` state **keyed to the exact `rtoCode` used**; clear it whenever `rtoCode` changes afterward.
- Wrap the control in a **hero card**:
  - 2px gradient border `linear-gradient(135deg, #7130A0, #ED1878)` (Vivacity brand), ~12px radius, surface-colored inner panel.
  - Inside: `RTO Number` label + small pill badge "Auto-fills from TGA", the lookup row, and a helper caption: *"We'll fetch the legal name, trading name, ABN and registration status from training.gov.au — you can still edit anything before saving."*
- **Richer preview** (inside the hero card once `confirmedTgaData` is set): Legal Name, Trading Name, ABN, Status, Org Type.
  - `lookupTargetRtoByCode` flattens legal/trading into one `rto_name` and drops status/organisation_type/abn, so call `supabase.functions.invoke('tga-rto-preview', { body: { rtoId } })` directly in the dialog and capture the richer `data` payload (`legal_name`, `trading_name`, `abn`, `status`, `organisation_type`). Keep `TgaRtoLookupRow`'s input/button shell purely for the visual pattern.
  - Status active/current → cyan/green pill "Currently registered"; otherwise amber pill with the raw status text (never block).
  - **"Use these details"** button: fills Legal Name, Trading Name, and ABN (ABN only if empty). Fields remain editable.
  - **"Try a different number"** button: clears `confirmedTgaData` and refocuses the input.
- Below the hero card: **Legal Name** (full width) → then **Trading Name + ABN** in a `grid-cols-2` row (ABN moves here now that it no longer pairs with RTO).
- **"from TGA" chips** next to Legal Name / Trading Name / ABN labels once filled by "Use these details". Track a `dirtyFields: Set<'legalName'|'tradingName'|'abn'>`; clear the chip for a field the moment the user edits it.
- Lookup failure → inline error under the row, no block on submit.
- **Kickstart path unchanged**: same plain `<Input>` for `rtoCode`, same position, same copy — gated by `!isKickStart` around the new hero card.

## 2. Auto-link + auto-sync inside `createTenant` (~L160-293)

Everything before/after tenant creation stays identical (duplicate check, tenants insert, tenant_identifiers, package RPCs, consultant auto-assign, SharePoint fire-and-forget). After the new tenant `id` is known:

```text
if (!isKickStart && confirmedTgaData?.rto_number === rtoCode.trim()) {
  await supabase.rpc('client_tga_link_set',    { ... })   // await
  await supabase.rpc('client_tga_link_verify', { ... })   // await
  supabase.functions.invoke('tga-rto-sync', {             // fire-and-forget
    body: { tenantId, rtoId: rtoCode }
  }).catch(() => { /* swallow, manual retry via Integrations tab */ })
}
```

- RPC arg shapes mirror `useClientManagement.tsx` (~L482-556) — reference implementation.
- Errors on `client_tga_link_set` / `_verify` surface a non-blocking warning toast (*"Client created — TGA link failed, use Integrations tab"*) but never fail tenant creation or block dialog close.
- Sync invoke is fire-and-forget, same pattern as `provision-tenant-sharepoint-folder` at L265-279.
- Kickstart or unconfirmed lookup → skip entirely, identical to today.

## 3. Visible progress in the dialog footer

Non-Kickstart with confirmed TGA — replace the spinner with a 3-step checklist in the footer while `saving`:

```text
[✓] Creating client
[…] Linking to TGA
[ ] Importing TGA data  (Started — continues in background)
```

- Steps flip as each awaited call resolves; the last flips to "Started — continues in background" immediately after the invoke fires, then the dialog closes.
- Success toast: **"Client created — TGA sync in progress"**.
- Kickstart / no confirmed lookup → identical spinner + "Client created" toast as today, no checklist.

## Technical notes

- Reuse `TgaRtoLookupRow` for the input/button shell only; call `tga-rto-preview` directly for the richer preview payload (status + org type + separate legal/trading/ABN). Optionally extend/export a `TgaRtoPreview` type from `src/lib/tga/lookupTargetRto.ts` if it keeps the dialog cleaner.
- No new edge functions, no new migrations — `client_tga_link_set`, `client_tga_link_verify`, `tga-rto-preview`, `tga-rto-sync` all already exist and are proven by the Integrations tab flow.
- Do NOT touch the SOAP-era `search-organisations` / `get-organisation-details` functions or `docs/training-gov-au-integration.md` — stale/orphaned.
- All changes confined to `src/components/AddTenantDialog.tsx` (plus the small optional helper/type in `src/lib/tga/lookupTargetRto.ts`).

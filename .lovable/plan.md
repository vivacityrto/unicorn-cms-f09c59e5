

## ComplyHub Integration — Deep Link + Manual Tier Field

### Summary
Add two new columns to the `tenants` table (not `tenant_profile`) for ComplyHub integration, and add a ComplyHub card to the Integrations tab on the client detail page.

### Why `tenants` and not `tenant_profile`
The `tenants` table already holds the bulk of tenant metadata (ABN, ACN, LMS, SMS, accounting system, etc.). Adding ComplyHub fields here keeps things consistent and avoids the confusion of a separate 1:1 table. The `tenant_profile` table is a legacy pattern that should ideally be consolidated later.

---

### Step 1 — Database Migration

Add two columns to `public.tenants`:

- `complyhub_url` (text, nullable) — stores the direct link to the tenant's ComplyHub record
- `complyhub_membership_tier` (text, nullable) — stores the membership level (e.g. Free, Essentials, Professional, Enterprise)

No RLS changes needed since existing `tenants` policies already cover read/write access.

### Step 2 — Update TypeScript Types

The `src/integrations/supabase/types.ts` file will auto-regenerate after the migration, making the new columns available via the Supabase client.

### Step 3 — UI: ComplyHub Card on Integrations Tab

Update `src/components/client/ClientIntegrationsTab.tsx` to add a new "ComplyHub" card below the existing SharePoint section:

- **ComplyHub URL field**: Text input for the URL, with a clickable external link icon when a valid URL is saved
- **Membership Tier dropdown**: Select field with options (Free, Essentials, Professional, Enterprise — or whatever tiers ComplyHub uses)
- **Save button**: Persists both fields to the `tenants` table
- **Deep link button**: "Open in ComplyHub" button that opens the saved URL in a new tab (only visible when a URL is saved)

### Step 4 — Audit Logging

Add an audit event when ComplyHub fields are updated, consistent with the existing pattern used for SharePoint settings.

---

### Technical Details

**Files to modify:**
1. Database migration (new columns on `tenants`)
2. `src/components/client/ClientIntegrationsTab.tsx` — add ComplyHub card section

**No new tables, no new RLS policies, no edge functions required.**

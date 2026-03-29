

## Plan: Create `dd_states` Lookup Table and Replace `ctstates` References

### Summary
Create a general-purpose `dd_states` Australian states/territories lookup table (not GTO-specific), populate it from the existing `ctstates` table, and update all code references.

---

### Step 1: Database Migration — Create `dd_states`

```sql
CREATE TABLE public.dd_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

-- Populate from ctstates
INSERT INTO public.dd_states (code, label, description, sort_order)
SELECT 
  lower(replace("Description", ' ', '_')),
  "Description",
  "Description",
  "Seq"
FROM public.ctstates
ORDER BY "Seq";

-- Add a 'National' option for documents applicable to all states
INSERT INTO public.dd_states (code, label, description, sort_order)
VALUES ('national', 'National', 'All States / National', 999);

-- RLS
ALTER TABLE public.dd_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dd_states_select" ON public.dd_states FOR SELECT TO authenticated USING (true);
CREATE POLICY "dd_states_write_sa" ON public.dd_states FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
```

Uses standard `dd_` conventions: UUID `id`, `code`/`label`/`description`/`sort_order`/`is_active` columns — consistent with all other lookup tables.

### Step 2: Update `PackageDetail.tsx`
- Replace `supabase.from("ctstates")` with `supabase.from("dd_states" as any)`
- Update column references from PascalCase (`Code`, `Description`) to snake_case (`code`, `label`)
- Update the state mapping logic accordingly

### Step 3: Update `ManageTenants.tsx`
- Same changes as Step 2 — swap table name and column references

### Step 4: Auto-available in Code Tables Admin
The `dd_states` table will automatically appear in the Code Tables admin page via the `list_code_tables` RPC, making it manageable by SuperAdmins (add/edit/deactivate states).

### Notes
- `ctstates` is **not** deleted — deprecated later as requested
- Only 2 frontend files need updating
- The table is general-purpose and can be referenced by GTO documents, tenant addresses, package state filtering, etc.



# Tag Management System for Notes

## Overview
Create a `dd_note_tags` lookup table following the existing `dd_` code table pattern, allow SuperAdmins to manage tags, and replace the free-text tag input in notes with a controlled dropdown selector.

---

## Step 1: Create the `dd_note_tags` Table

Create a new lookup table matching the pattern used by `dd_address_type` and other `dd_` tables:

- **Columns**: `id` (serial PK), `code` (text, unique, not null), `label` (text, not null), `description` (text, nullable), `is_active` (boolean, default true), `sort_order` (integer, default 0)
- **RLS**: SELECT open to all authenticated users (needed for dropdowns app-wide). INSERT/UPDATE/DELETE restricted to Super Admins via `is_super_admin_safe(auth.uid())`.
- Seed with any existing tags already in use across notes data.

## Step 2: Migrate Existing Free-Text Tags

Run a query to extract all distinct tags currently stored in `notes.tags` arrays and insert them into `dd_note_tags` so no existing data is orphaned.

## Step 3: Add SuperAdmin Management UI

Add `dd_note_tags` to the existing SuperAdmin code tables management interface so it can be discovered and managed (CRUD) through the same pattern used for other `dd_` tables. This means:

- The table will appear in the SuperAdmin code tables list automatically (since it follows the `dd_` prefix convention).
- SuperAdmins can add, edit, deactivate, and soft-delete tags from there.

## Step 4: Replace Free-Text Tag Input with Dropdown

In `ClientStructuredNotesTab.tsx`, replace the current free-text `Input` + "Add" button for tags with a multi-select dropdown that:

- Fetches active tags from `dd_note_tags` (ordered by `sort_order`, then `label`).
- Allows selecting multiple tags from the list.
- Displays selected tags as removable badges (keeping the current badge UI).
- Stores the tag `code` values in the `notes.tags` array (consistent with existing data format).

---

## Technical Details

### Database Migration SQL
```sql
CREATE TABLE public.dd_note_tags (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.dd_note_tags ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (for dropdowns)
CREATE POLICY "dd_note_tags_select" ON public.dd_note_tags
  FOR SELECT TO authenticated USING (true);

-- Only Super Admins can manage
CREATE POLICY "dd_note_tags_manage" ON public.dd_note_tags
  FOR ALL TO authenticated
  USING (public.is_super_admin_safe(auth.uid()))
  WITH CHECK (public.is_super_admin_safe(auth.uid()));
```

### Seed Existing Tags
```sql
INSERT INTO public.dd_note_tags (code, label)
SELECT DISTINCT unnest(tags) AS code, unnest(tags) AS label
FROM public.notes
WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
ON CONFLICT (code) DO NOTHING;
```

### Frontend Changes
- **New hook** `useNoteTags()` -- fetches active tags from `dd_note_tags`, returns `{ tags, loading }`.
- **`ClientStructuredNotesTab.tsx`** -- replace the tag `Input`+`Add` block (lines 582-608) with a multi-select dropdown powered by the hook. Selected tags render as removable badges. The rest of the form logic (saving `tags` array) stays the same.

### Files to Create/Modify
| File | Action |
|------|--------|
| Database migration | Create `dd_note_tags` table + RLS + seed |
| `src/hooks/useNoteTags.ts` | New -- fetch active tags from `dd_note_tags` |
| `src/components/client/ClientStructuredNotesTab.tsx` | Modify -- replace free-text tag input with dropdown selector |



## Work Sub Type Implementation — Full Plan

### 1. Current State

- `dd_work_types` exists with 8 values (general, consultation, document_development, document_review, training, meeting, support, admin)
- `dd_work_sub_type` does **not** exist
- `time_entries`, `active_timers`, `calendar_time_drafts` all have `work_type` (text) but no `work_sub_type` column

### 2. Schema Changes (Migration)

**Create `dd_work_sub_type` table** following existing `dd_work_types` pattern plus a `category` column:

```sql
CREATE TABLE public.dd_work_sub_type (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  category text NOT NULL,       -- 'consultation' or 'document'
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dd_work_sub_type ENABLE ROW LEVEL SECURITY;

-- Read for authenticated
CREATE POLICY "Authenticated users can read dd_work_sub_type"
  ON public.dd_work_sub_type FOR SELECT TO authenticated USING (true);

-- Vivacity staff manage
CREATE POLICY "Vivacity staff can manage dd_work_sub_type"
  ON public.dd_work_sub_type FOR ALL TO authenticated
  USING (public.is_vivacity_staff(auth.uid()))
  WITH CHECK (public.is_vivacity_staff(auth.uid()));
```

**Add `work_sub_type` column to 3 tables:**

```sql
ALTER TABLE public.time_entries ADD COLUMN work_sub_type text;
ALTER TABLE public.active_timers ADD COLUMN work_sub_type text;
ALTER TABLE public.calendar_time_drafts ADD COLUMN work_sub_type text;
```

### 3. Seed Data (via insert tool, not migration)

**Consultation sub types** (category = `consultation`):

| code | label | sort_order |
|------|-------|-----------|
| compliance_health_check | Compliance Health Check | 1 |
| audit_support | Audit Support | 2 |
| rectification_support | Rectification Support | 3 |
| assessment_validation | Assessment Validation | 4 |
| government_funding_support | Government Funding Support | 5 |
| governance_meeting | Governance Meeting | 6 |
| annual_compliance_check | Annual Compliance Check | 7 |
| business_support | Business Support | 8 |
| scope_application_support | Scope Application Support | 9 |
| general_consulting | General Consulting | 10 |

**Document sub types** (category = `document`):

| code | label | sort_order |
|------|-------|-----------|
| tas | TAS | 1 |
| trainer_matrix | Trainer Matrix | 2 |
| dap | DAP | 3 |
| policy_procedure | Policy & Procedure | 4 |
| forms_templates | Forms & Templates | 5 |
| register | Register | 6 |
| evidence | Evidence | 7 |
| other_document | Other Document | 8 |

### 4. UI Filtering Logic

When user selects a work type:
- `consultation` → show sub types where `category = 'consultation'`
- `document_review` or `document_development` → show sub types where `category = 'document'`
- Any other work type → hide sub type selector (field not applicable)

### 5. Code Changes

| File | Change |
|------|--------|
| `AddTimeDialog.tsx` | Fetch `dd_work_sub_type`, add Work Sub Type select below Work Type, filter by category, include in insert payload |
| `TimeLogDrawer.tsx` | Display sub type badge next to work type, add sub type filter option |
| `useTimeTracking.ts` | Pass `work_sub_type` through start/stop timer flows |
| `useSuggestDropdowns.ts` | Add `workSubTypes` query for `dd_work_sub_type` |
| Supabase types | Auto-updated after migration |

### 6. Admin

`dd_work_sub_type` follows the `dd_` prefix and will appear automatically in the Code Tables admin interface for label editing, active/inactive toggle, and sort order management.

### 7. Reporting Impact

- No changes to existing `work_type` column or reports
- New `work_sub_type` column enables grouping/filtering by sub type or combined `work_type + work_sub_type`


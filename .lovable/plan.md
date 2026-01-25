
# Phase 1: Fix Missing Packages

## Objective
Add 16 missing packages from unicorn1 to public.packages (joining on name), include the `document_assurance_period` column, and fix 11 orphaned package_instances.

---

## Step 1.1: Add `document_assurance_period` column to public.packages

```sql
ALTER TABLE public.packages 
  ADD COLUMN IF NOT EXISTS document_assurance_period integer DEFAULT 0;
```

---

## Step 1.2: Insert 16 missing packages

Join on name (case-insensitive, trimmed) to avoid ID mismatch issues:

```sql
INSERT INTO public.packages (name, status, u1_packageid, document_assurance_period, duration_months, created_at)
SELECT 
  u1.name,
  'active',
  u1.id,
  u1.documentassuranceperiod,
  12,
  NOW()
FROM unicorn1.packages u1
LEFT JOIN public.packages p ON LOWER(TRIM(p.name)) = LOWER(TRIM(u1.name))
WHERE p.id IS NULL;
```

---

## Step 1.3: Fix 11 orphaned package_instances

Update package_instances to reference the newly created public.packages IDs:

```sql
UPDATE public.package_instances pi
SET package_id = new_pkg.id
FROM (
  SELECT p.id, u1.id as u1_id
  FROM public.packages p
  JOIN unicorn1.packages u1 ON LOWER(TRIM(p.name)) = LOWER(TRIM(u1.name))
) new_pkg
WHERE pi.package_id = new_pkg.u1_id
  AND NOT EXISTS (SELECT 1 FROM public.packages WHERE id = pi.package_id);
```

---

## Step 1.4: Backfill existing packages with document_assurance_period

```sql
UPDATE public.packages p
SET document_assurance_period = u1.documentassuranceperiod
FROM unicorn1.packages u1
WHERE LOWER(TRIM(p.name)) = LOWER(TRIM(u1.name))
  AND (p.document_assurance_period IS NULL OR p.document_assurance_period = 0);
```

---

## Verification Queries (with Package Names)

### 1. Check for orphaned package_instances (should be 0)
```sql
SELECT 
  pi.id as instance_id,
  pi.package_id as current_package_id,
  pi.tenant_id,
  t.business_name as tenant_name,
  '(NO MATCHING PACKAGE)' as package_name
FROM public.package_instances pi
LEFT JOIN public.packages p ON p.id = pi.package_id
LEFT JOIN public.tenants t ON t.id = pi.tenant_id
WHERE p.id IS NULL AND pi.is_complete = false;
```
**Expected:** 0 rows

---

### 2. Verify all packages were added with correct mappings
```sql
SELECT 
  p.id as public_id,
  p.name as public_name,
  p.u1_packageid,
  u1.id as u1_id,
  u1.name as u1_name,
  CASE WHEN LOWER(TRIM(p.name)) = LOWER(TRIM(u1.name)) THEN 'MATCH' ELSE 'MISMATCH' END as name_status,
  p.document_assurance_period
FROM public.packages p
LEFT JOIN unicorn1.packages u1 ON p.u1_packageid = u1.id
ORDER BY p.name;
```
**Expected:** All rows show 'MATCH' in name_status

---

### 3. Verify package_instances now reference correct packages
```sql
SELECT 
  pi.id as instance_id,
  pi.package_id,
  p.name as public_package_name,
  pi.tenant_id,
  t.business_name as tenant_name,
  pi.is_complete
FROM public.package_instances pi
JOIN public.packages p ON p.id = pi.package_id
LEFT JOIN public.tenants t ON t.id = pi.tenant_id
WHERE pi.is_complete = false
ORDER BY p.name, t.business_name;
```
**Expected:** All active instances show valid package names

---

### 4. Cross-check: Find any unicorn1 packages not in public
```sql
SELECT 
  u1.id as u1_id,
  u1.name as u1_name,
  u1.documentassuranceperiod,
  p.id as public_id,
  p.name as public_name
FROM unicorn1.packages u1
LEFT JOIN public.packages p ON LOWER(TRIM(p.name)) = LOWER(TRIM(u1.name))
WHERE p.id IS NULL;
```
**Expected:** 0 rows (all unicorn1 packages should now exist in public)

---

### 5. Verify document_assurance_period values
```sql
SELECT 
  p.name,
  p.document_assurance_period as public_value,
  u1.documentassuranceperiod as u1_value,
  CASE WHEN p.document_assurance_period = u1.documentassuranceperiod THEN 'MATCH' ELSE 'MISMATCH' END as status
FROM public.packages p
JOIN unicorn1.packages u1 ON LOWER(TRIM(p.name)) = LOWER(TRIM(u1.name))
WHERE u1.documentassuranceperiod > 0
ORDER BY p.name;
```
**Expected:** DD, SH-AR, SK-EC all show 'MATCH' with value 1

---

## Summary

| Step | Action | Records Affected |
|------|--------|-----------------|
| 1.1 | Add column | 1 (document_assurance_period) |
| 1.2 | Insert packages | 16 |
| 1.3 | Fix orphaned instances | 11 |
| 1.4 | Backfill existing packages | Variable |

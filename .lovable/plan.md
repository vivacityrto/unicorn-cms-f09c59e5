

# Remap Legacy Table References: `documents_stages` → `stages`

## The Confusion — Resolved

**`documents_stages`** (75 rows): Legacy table with OLD stage IDs (1–72, 127–139). Only 14 IDs overlap with `stages`, and of those, **13 out of 14 have wrong/mismatched titles**. This table is stale and dangerous to use.

**`stages`** (74 rows, IDs up to 1076+): The authoritative, current stage registry. This is what all code should reference.

**`stage_documents`** (72 rows): Legitimate junction table linking `stages.id` → `documents.id` for template-level allocation. This stays as-is — it's correct and actively used by stage builders.

**Summary**: `documents_stages` must be replaced everywhere with `stages`. `stage_documents` is fine.

---

## Changes Required

### Phase 1: Frontend files — remap `documents_stages` → `stages`, `title` → `name`

**3 files with direct queries:**

| File | What to change |
|------|---------------|
| `src/hooks/useStageAnalytics.tsx` | 5 queries: change table to `stages`, all `.select('... title ...')` → `.select('... name ...')` |
| `src/components/AddExistingStageDialog.tsx` | 1 query: change table + `title` → `name` |
| `src/hooks/useOperationsDashboard.tsx` | 1 FK join: `.from('documents_stages').select('title')` → `.from('stages').select('name')` |

**2 files with FK joins:**

| File | What to change |
|------|---------------|
| `src/hooks/useStageReleases.tsx` | FK join `stage:documents_stages(id, title)` → `stage:stages(id, name)` |
| `src/pages/TimeInbox.tsx` | FK join referencing `documents_stages` → `stages` |

**1 file with scope selector:**

| File | What to change |
|------|---------------|
| `src/components/ask-viv/AskVivScopeSelectorModal.tsx` | Query `documents_stages` → `stages`, `title` → `name` |

### Phase 2: Edge Functions — remap table name + string literals

| File | What to change |
|------|---------------|
| `_shared/ask-viv-fact-builder/data-retrieval.ts` | Query from `stages` instead, `title` → `name` |
| `_shared/ask-viv-fact-builder/fact-derivation.ts` | `source_table` string literals: `"documents_stages"` → `"stages"` |
| `_shared/ask-viv-fact-builder/freshness.ts` | `source_table` string literal |
| `_shared/ask-viv-fact-builder/record-links.ts` | Case match on table name |
| `_shared/ai-brain/fact-builder.ts` | Multiple `source_table` string literals |

### Phase 3: Documentation

| File | What to change |
|------|---------------|
| `docs/stage-registry.md` | Update table name references |
| `.lovable/plan.md` | Clear stale plan content |

### Phase 4: Update memory

Update the `stage-registry-and-template-architecture` and `governance-package-assignments-logic` memories to permanently record that `documents_stages` is deprecated and `stages` is the only authoritative table.

---

## What stays unchanged

- **`stage_documents`** — legitimate junction table, actively used by 7 files for template management. No changes needed.
- **`stages`** table schema — no database changes required.
- **`document_instances` / `stage_instances` / `package_instances`** — operational instance tables, already correctly used.

## Impact

~11 files changed. No database migrations. Edge functions will need redeployment (automatic).


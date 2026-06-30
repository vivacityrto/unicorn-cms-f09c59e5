## Goal
Clear all 29 strict-`tsc` errors across 22 files. `vite build` and `tsgo` already pass — these only fail under strict typecheck.

## Patterns

**A — `Record<string, any|unknown>` payload passed to typed Supabase `.update()` / `.insert()`** (~22 errors)
Files: `PackageDataManager.tsx`, `PackageStagesManager.tsx`, `MeetingAiSummaryPanel.tsx`, `EditNoteDialog.tsx`, `TASContextAssistant.tsx`, `useAddinFeatureFlags.tsx`, `useClientManagement.tsx`, `useClientPackageInstances.tsx`, `useClientTaskInstances.ts`, `useClientWorkboard.tsx` (x2 incl. the `tags: string[]` line), `useDocumentAIAnalysis.tsx` (x2), `useMeetingArtifacts.tsx`, `useMeetingTodos.tsx`, `useProcesses.tsx`, `useRtoTips.tsx`, `useSeatHealth.tsx`, `useStaffTaskInstances.ts` (x2).
Fix: append `as never` to the payload at the call site. Minimal, local, preserves runtime behaviour. Works around Supabase's `RejectExcessProperties` on dynamic record bags.

**B — Audit-log inserts in `client_audit_log` using a non-existent `changes` column** (bugfix, not type-only)
Files: `ComplyHubCard.tsx:68`, `XeroCard.tsx:62`.
Fix: rename the field `changes` → `details` (the existing `Json` column on `client_audit_log`). The `changes` key has always been an unknown column that PostgREST silently dropped, so these audit inserts currently persist a row with no metadata. After the rename, ComplyHub and Xero settings audit entries will start persisting their payload for the first time. PR description should describe this as a bugfix.

**C — Joined-relation shape passed back into typed `.update()`**
Files: `useAuditTemplates.tsx:112`, `useClientManagementData.tsx:640`.
Fix: cast the update payload `as never`. No payload reshaping (minimal diff).

**D — `chart.tsx` Recharts payload typing** (5 errors)
shadcn chart wrapper drift against current Recharts types. Fix at the type layer only:
- Loosen the `ChartTooltipContent` props type: replace `React.ComponentProps<typeof RechartsPrimitive.Tooltip>` with a hand-rolled props shape that exposes `active?: boolean`, `payload?: any[]`, `label?: any`, `labelFormatter?: any`, `formatter?: any`, `color?: string`.
- Replace `Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign">` in `ChartLegendContent` with `{ payload?: any[]; verticalAlign?: 'top' | 'middle' | 'bottom' }`.
Behaviour and rendered DOM unchanged.

## Out of scope
- No runtime/logic changes, no schema changes, no UI changes (except the latent audit-log bugfix in Pattern B).
- No refactor of the typed Supabase wrappers.

## Verification
- `npx tsc --noEmit -p tsconfig.app.json` → 0 errors
- `bunx vite build` → still succeeds

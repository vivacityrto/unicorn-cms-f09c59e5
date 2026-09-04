# Phase 2.6 task-dialog consolidation characterization

**Branch cut:** `origin/main` at `1f8c557f` (PR #592 merged)

**Disposition:** implementation-ready after the Phase 2.5 exit checkpoint; no
runtime changes are included in this packet.

## Candidate

`src/components/AddClientTaskDialog.tsx` and
`src/components/AddStaffTaskDialog.tsx` are each 319 physical lines (638
combined). They have one consumer: `src/pages/PackageDetail.tsx`, which mounts
both dialogs for the selected stage.

The route is `/admin/package/:id` under the ordinary `ProtectedRoute` and
`DashboardLayoutRoute` in `src/routes/dashboardRoutes.tsx`; it is not wrapped
in `requireSuperAdmin` or a `PermissionGate`. A refactor must preserve this
existing access boundary and must not add or remove authorization behavior.

## Confirmed shared behavior

- identical props and form state (`open`, `onOpenChange`, `onSuccess`, numeric
  package/stage IDs, optional edit task);
- identical reset-on-edit/open behavior and rich-text toolbar;
- identical required-name and missing package/stage validation flow;
- identical due-date calculation (`abs` day difference, rounded up);
- identical create/update lifecycle, `order_number: 0` default, success callback,
  close/reset behavior, and loading state;
- identical UI structure, date picker, cancel/save controls, and error handling
  shape.

## Must remain separate

The dialogs write distinct tables:

- `package_client_tasks`: `instructions`, `required_documents`,
  `source_stage_task_id`, and the shared task fields;
- `package_staff_tasks`: `estimated_hours`, `is_mandatory`, `is_recurring`,
  `owner_role`, `source_stage_task_id`, and the shared task fields.

The current dialog uses only the shared subset (`package_id`, `stage_id`,
`name`, `description`, `due_date_offset`, `order_number`). The eventual shared
controller must retain separate typed table adapters and may not merge the two
schemas or infer that client/staff owner semantics are interchangeable.

The remaining behavioral differences are intentional presentation/contract
differences: client-vs-staff table names, titles, labels, placeholders,
validation wording, success/error wording, and DOM IDs.

## Risks discovered before implementation

1. Generated Supabase types define both task `id` columns as `string` UUIDs,
   while both dialog props declare `editTask.id` as `number`. `PackageDetail`
   currently stores task state as `any[]`, masking this mismatch. The refactor
   should correct the local edit-task type to the generated UUID shape without
   changing the runtime query or route contract.
2. Both dialogs use `catch (error: any)`; replacing this must preserve the
   existing fallback error text and toast variant.
3. The due-date calculation treats past dates as positive offsets because it
   uses `Math.abs`; parity tests must pin this behavior before any cleanup.
4. The parent performs `select("*")`, inline deletes, and refresh callbacks.
   Those operations are outside the shared dialog core and must remain outside
   the refactor unless separately scoped.

## Required parity fixtures and verification

Before implementation, add focused tests for both adapters covering:

- create and edit against the correct table;
- name-required and package/stage-required validation;
- due-date offsets, including a past-date input;
- reset/close and `onSuccess` ordering;
- database failure and thrown-error toast fallbacks;
- client/staff labels, DOM IDs, and success/error wording;
- UUID task IDs passed through edit mode unchanged.

The implementation PR must run the full verification contract and an
authenticated Playwright check on `/admin/package/:id` with a real package and
stage, covering both task tabs, read-only dialog open/edit/cancel flows,
refresh/back navigation, and zero unexpected console errors. No test should
create persistent data unless it is explicitly labeled, verified, and cleaned
up through the approved disposable-data procedure.

## Gate

This packet is ready for implementation only after Claude records the Phase
2.5 exit checkpoint. Any discovery involving permissions, tenant binding,
schema changes, RLS, RPCs, or Edge contracts pauses the cohort and moves that
work into a separately aligned RBAC/tenant vertical slice.

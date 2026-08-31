# RBAC v6 — Authorization Implementation and Gate-Streamlining Plan

> **Last updated:** 2026-09-01 · **Reconsider by:** 2026-12-01 · **Confidence:** high on the current-code and live-database findings; medium on the target capability catalogue until Vivacity validates each job seat; low on delivery estimates until the characterization and route-manifest prerequisites are complete.
>
> **Reflects:** `origin/main@853c9e18`, read-only production metadata queries on 2026-09-01, the historical [RBAC v6 gate-closure handoff](../handoffs/rbac-v6-gate-closure-plan.md), and the assumed completed target state of the [codebase optimization plan](codebase-optimization-plan-2026-08-28.md).
>
> **Status:** Implementation plan only. It authorizes no production migration, Edge Function deployment, permission grant, or user-role change. Execute as small PRs. Every schema, RLS, RPC, trigger, or data-backfill PR also requires an audit entry under `docs/audit-log/entries/`.

## 1. Executive decision

Unicorn should not replace its existing RBAC tables with a new authorization product or a large framework. It should evolve the working v5 foundation into a single, target-aware authorization model and progressively route every enforcement point through it.

The intended decision is:

```text
authorize(subject, action, resource, tenant_context) -> allow | deny + reason
```

The model combines:

- **RBAC:** Vivacity job roles provide understandable default capability bundles.
- **Attributes:** active/disabled/archived/system account state and risk classification affect the decision.
- **Relationships:** tenant membership, tenant assignment, ownership, facilitation, or another explicit resource relationship limits the scope.

This is deliberately more precise than “role X may open page Y.” Route and navigation checks remain useful UX controls, but the real security boundary stays in RLS, RPCs, and Edge Functions. Unknown capabilities, missing context, inactive principals, and failed policy lookups deny by default.

The first production outcome is the AJ/CSC access case: grant only the approved Academy, package, and stage actions, for an explicit scope and review period, without granting Super Admin or borrowing an unrelated full job role.

## 2. Why the historical v6 plan needs an implementation overlay

The August v6 handoff correctly identified disconnected route gates, missing Stage features, scattered raw role checks, and duplicated database policy logic. Its direction remains useful. The following statements are now incomplete or stale and must not be copied into implementation tickets:

| Historical statement | Current evidence | Implementation consequence |
|---|---|---|
| The problem is mostly permission coverage | Coverage is only one part. Account-state, tenant scope, resource relationships, and inconsistent semantics are also material | Implement a target-aware policy contract, not just more feature rows |
| Additional `user_roles` are a complete no-code per-user exception mechanism | Only two active grants exist; no normal admin grant/review UI was found; grants add an entire role bundle | Add explicit, time-bound capability grants or named access profiles with reason, approver, expiry, and review |
| `full > limited > owner_only > none` is a valid universal hierarchy | `owner_only` is a relationship/scope, not a lower amount of privilege; Edge code maps `view` and `edit` to the same `limited` threshold | Split action from scope; migrate feature by feature rather than mechanically translating levels |
| 47 routes are hard Super Admin gates | Current source has 40 `requireSuperAdmin` occurrences in `App.tsx`; 11 Academy routes use a separate raw allowlist | Generate route evidence from the canonical route manifest on every change |
| 71 frontend files contain role checks | A rule-focused census finds at least 66 production files with raw role checks and 29 production consumers of `usePermission`; a broader grep returns more candidates because it also catches display logic and tests | Treat all such figures as changing discovery indicators, not acceptance criteria by themselves |
| The matrix is complete enough to connect to routes | Production has 85 active features, 523 role-permission rows, six missing role/feature rows, and no Stage features | Close catalogue/matrix gaps before switching enforcement |
| Active internal roles align with assigned primary roles | `Team Member` is inactive in `dd_unicorn_roles` but remains the primary role of eight internal profiles; one active supplemental grant uses inactive `Bulk Generate Automation` | Resolve legacy-role behavior before an “active roles only” UI or evaluator silently removes access |

This plan preserves the v6 document as historical evidence and becomes the execution source of truth.

## 3. Evidence snapshot

### 3.1 Current source at `853c9e18`

| Surface | Finding |
|---|---|
| Client decision hook | `src/hooks/usePermission.ts` loads the entire role matrix plus the current user's supplemental roles, caches for five minutes, and applies the ordinal level comparison in the browser |
| Static role model | `src/hooks/useRBAC.tsx` contains a second static permission/route model and does not consume DB role permissions or supplemental roles |
| Route guard | `src/components/ProtectedRoute.tsx` supports `requireSuperAdmin`, `allowedRoles`, and `allowVivacityTeam`; it is a UX gate, not a database authorization boundary |
| Disabled-state route check | The separate profile query treats a query error as `disabled: false`; this is fail-open behavior at the route layer |
| Role sources | Role strings also exist in `src/lib/roles/vivacityRoles.ts`, `App.tsx`, tests, and components |
| Permission editor | `RolePermissionsEditor.tsx` edits defaults cell by cell; it does not manage per-user grants, expiry, review, or effective-access explanation |
| Permission mutation Edge Function | `update-role-permission` validates the caller, but its module-level `err()` references `req` outside scope. Repository migrations define table triggers that write a basic audit row transactionally; the Edge Function then writes a second richer row and ignores failure, creating duplicate/inconsistent actor and reason semantics if live matches the migration. P0 must verify the effective live trigger first |
| Shared Edge gate | `_shared/requireCaller.ts` centralizes identity and feature checks, but `view` and `edit` both become `limited`, and broad `orAllow` fallbacks can mix capability and relationship rules |
| Tests | Some route tests still reproduce policy logic in test helpers instead of exercising one production policy source; Playwright can prove navigation behavior but not RLS isolation |

### 3.2 Read-only production metadata on 2026-09-01

| Metric | Observed value |
|---|---:|
| Active permission features | 85 |
| Feature categories | Administration 14, Academy 11, Audits 5, Clients 7, Documents 1, EOS 28, Packages 5, Resource Hub 4, Staff 10 |
| Stage features | 0 |
| `role_permissions` rows | 523 |
| Missing active-role/feature cells | 6, all for `admin.documents.bulk_generate` |
| Active `user_roles` grants | 2 |
| Expired `user_roles` grants | 0 |
| Permission change-log rows | 632 |
| Public RLS policies | 1,966 |
| Policies calling `check_permission` | 3 |
| Policies mentioning Vivacity helpers | 796 |
| Policies embedding role-column logic | 230 |
| Public functions | 669 |
| Functions calling `check_permission` | 8 |
| Functions mentioning Vivacity helpers | 133 |
| Functions embedding role-column logic | 62 |
| Top-level Edge Functions | 200 |
| Edge entrypoints importing/using `requireCaller` | 89 |

These counts are discovery signals, not proof that every match is wrong. A policy may correctly enforce coarse tenant isolation while delegating an action check elsewhere. Each migration slice needs a behavioral classification.

### 3.3 Critical correctness findings

1. `check_permission` excludes archived identities but does not consistently exclude disabled identities.
2. `is_super_admin_safe` does not test disabled state, so a disabled Super Admin can still satisfy helpers that depend on it.
3. The browser's separate disabled query fails open on lookup error and is not a substitute for server-side denial or session revocation.
4. `has_tenant_access_safe` currently treats Vivacity staff as having coarse access to all tenants. That may reflect the consulting operating model, but it is implicit and too broad to stand in for every action.
5. Repository history defines two competing permission-audit writers: an `AFTER` trigger and a manual Edge insert. Under the service role, the trigger may not see the end-user `auth.uid()`, while the manual richer record is not atomic. If confirmed live, a naïve “add an audit RPC” would duplicate rows again.
6. Inactive role-registry entries are not equivalent to unused roles. Live primary and supplemental assignments currently refer to inactive roles.
7. The legacy `check_permission(p_user_id, ...)` is `SECURITY DEFINER` and executable by `authenticated`, so its arbitrary-subject shape must not be copied into v6 and should be retired early after caller inventory.
8. Current generic relationship fallbacks do not uniformly prove active membership, the target tenant, and resource-to-tenant ownership in one decision.
9. Repository deployment configuration contains many Edge Functions with gateway JWT verification disabled. This may be intentional, but source imports alone cannot prove each deployed function has the correct in-body human, webhook, shared-secret, or cron gate.

P0 fixes these before broad gate migration.

### 3.4 Authorization council safety verdict — 2026-09-01

Three independent reviewers examined the plan against current frontend gates, tests, migrations, Edge helpers, RLS mechanics, and Supabase service-role behavior.

| Council seat | Verdict before amendments | Principal blocker |
|---|---|---|
| Authorization/security | Not safe to implement as originally sequenced | Legacy and v6 decisions had no authoritative cutover semantics; combining allows would escalate privilege |
| Supabase/RLS/Edge | Not safe to implement as originally sequenced | Existing audit triggers, permissive-policy `OR` behavior, service-role impersonation reach, and helper dependency blast radius needed explicit handling |
| Frontend/migration/testing | Not safe to implement as originally sequenced | Route gates could open before backing Edge/RPC/RLS enforcement, and required personas were not guaranteed to be reproducible |

The plan below incorporates the council's required safeguards. This is still a plan review, not proof that an eventual implementation is safe. Each vertical slice requires fresh verification against the then-current repository and live schema.

## 4. Research-backed design principles

The design follows these external practices, adapted to Unicorn rather than adopted mechanically:

- [OWASP Authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): least privilege, deny by default, validate authorization on every request, centralize policy, log decisions, and continuously test for privilege creep.
- [OWASP Multi-Tenant Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html): treat a client-supplied tenant ID only as a selector, bind it to current membership or service authorization, scope resource lookups by tenant, and test with the same non-bypass role used by the application.
- [NIST RBAC](https://csrc.nist.gov/projects/role-based-access-control): roles are stable job functions and permissions are operations on protected objects; role hierarchy and separation of duties are valid constraints.
- [NIST SP 800-162](https://csrc.nist.gov/pubs/sp/800/162/upd2/final): subject, object, operation, and environment attributes are appropriate when role alone cannot express the decision.
- [Supabase Custom Claims and RBAC](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac): normalized role/permission data and a centralized authorization function fit RLS. Unicorn should not put its complete dynamic permission set into JWTs because revocation, tenant/resource context, and token freshness still require live checks.
- [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security): RLS is a defense-in-depth boundary; service-role clients bypass it, so every service-role Edge path must perform its own validated subject/action/resource/tenant decision.
- [Google Zanzibar](https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/): a uniform relationship model and consistent decisions are valuable. Unicorn does not need an external Zanzibar/OpenFGA-style service at its current scale; it should borrow the explicit relationship discipline, not the infrastructure.

The Supabase changelog was checked through 2026-08-21. No current change invalidates this plan. Nearby platform facts matter during delivery: new public tables are moving to explicit Data API exposure, tests must continue to use Node 22 or later, and any verification automation using the Management API `logs.all` endpoint must migrate to the replacement `logs` endpoint before its 2026-09-23 removal.

## 5. Target authorization model

### 5.1 Keep five concepts separate

| Concept | Example | Purpose |
|---|---|---|
| Principal state | active, disabled, archived, system | Determines whether the identity may participate at all |
| Job role / seat | CSC, BGT, CET, Integrator, Team Leader, Super Admin | Grants a reviewed default capability bundle |
| Capability / action | `packages.view`, `packages.edit`, `stages.publish`, `academy.enrolments.manage` | States what operation is requested |
| Scope | own, assigned tenants, one tenant, all tenants | States where the action may apply |
| Relationship | tenant member/admin, assignee, owner, facilitator | Proves the principal is related to the target resource |

Do not reuse “is visible in the staff picker” as an authorization predicate. Directory visibility, staff identity, and permission are three separate questions.

### 5.2 Decision contract

Use one vocabulary across React, Edge Functions, RPCs, and RLS:

```ts
type AuthorizationRequest = {
  action: CapabilityKey;
  tenantId?: number;
  resourceType?: ResourceType;
  resourceId?: string | number;
};

type AuthorizationDecision = {
  allowed: boolean;
  reasonCode:
    | "allowed_role_default"
    | "allowed_user_grant"
    | "allowed_relationship"
    | "principal_inactive"
    | "unknown_capability"
    | "missing_context"
    | "scope_mismatch"
    | "insufficient_capability";
  policyVersion: number;
  matchedGrantId?: string;
};
```

Production callers normally consume only `allowed`. An admin-only explain path may return sanitized reason and grant metadata. RLS uses a boolean function; diagnostic detail goes to protected audit/observability channels, not policy error messages.

### 5.3 Capability catalogue rules

1. Use atomic, verb-ended keys: `<resource>.<action>` or `<module>.<resource>.<action>`.
2. Prefer `view`, `create`, `edit`, `delete`, `publish`, `approve`, `assign`, `export`, `manage_access`, or a specific business verb.
3. Do not use `manage` when the consequential sub-actions require different risk or scope.
4. Record resource type, category, description, risk class, delegability, and whether tenant/resource context is mandatory.
5. Unknown or inactive capability keys deny.
6. Hard-SA capabilities are explicitly catalogued, non-delegable, and not editable through the ordinary matrix. Whether Unicorn also needs true break-glass accounts is a separate P1 decision; ordinary daily Super Admin accounts must not silently become the break-glass mechanism.

### 5.4 Scope rules

Recommended scope kinds:

```text
own_resource
assigned_tenants
explicit_tenant
all_tenants
global
```

Scope is not a permission level. `owner_only` becomes `action=edit + scope=own_resource`; `limited` must be interpreted feature by feature. Do not run a universal SQL conversion from the old enum.

The legacy adapter may preserve a context-free legacy decision temporarily. It must never translate `owner_only` into a broad allow when no target resource and tenant context are present. Ambiguous mappings remain legacy-authoritative or deny until their callers supply context.

### 5.5 Decision composition and precedence

Every enforcement layer must implement the same normative ordering:

1. Invalid, disabled, archived, revoked, expired, or disallowed principal class is a hard deny.
2. Unknown/inactive capability or missing required tenant/resource context is a hard deny.
3. A hard-SA capability requires an active approved hard-SA principal; ordinary grants cannot satisfy it.
4. Otherwise, allow only when at least one active role or user grant contains the exact capability **and** its scope and named relationship requirements match the server-resolved target.
5. Multiple active grants are additive only within their individual scopes; their scopes may union, but conditions from different grants may not be mixed to manufacture an allow.
6. User grants are additive exceptions, not explicit-deny records. Global safety denies and hard-SA constraints always take precedence.
7. Inactive roles and machine profiles cannot be newly assigned. Treatment of grandfathered assignments is an explicit migration decision, never an accidental filter.

No layer may invent its own `OR` fallback, privilege-level ordering, or role inheritance. If product needs explicit deny rules later, design their precedence in a separate ADR rather than adding them ad hoc.

### 5.6 Vivacity job-role methodology

The role registry should represent stable seats, not people or one-off projects. The exact bundle for each seat requires product-owner and operational validation; code history is evidence of current behavior, not authority for future access.

| Seat | Planning rule |
|---|---|
| CSC | Default to client-coordination capabilities within assigned/approved tenants; add Academy/package/stage actions only where the workflow requires them |
| BGT | Model the actual bulk-generation duties as capabilities; do not use the BGT label as a generic elevated-access role |
| CET | Catalogue the education/training workflows before assigning permissions; do not infer them from the acronym |
| Integrator | Grant integration and operational coordination actions explicitly; isolate secret/configuration and destructive system controls |
| Team Leader | Use reviewed leadership/approval capabilities, not a blanket “all internal admin” role |
| Super Admin | Reserve for policy administration, hard-SA security/system configuration, and explicitly approved cross-tenant controls; true break-glass, if required, uses separate non-daily accounts |
| Team Member | Decide whether this is a legacy role, an active generic seat, or a migration alias before changing registry behavior; eight current primary assignments prevent silent retirement |
| Automation roles | Treat as machine principals with dedicated, minimum capability profiles; never use them as convenient human supplemental roles |

Where one person occupies multiple real seats, use an approved additional access profile or role bundle. Where the need is temporary or narrower than a full seat, use a time-bound capability grant.

### 5.7 High-risk separation of duties

Classify at least these as non-delegable or approval-controlled until a product/security decision says otherwise:

- permission, role, and grant administration;
- authentication, secrets, system configuration, and external shared credentials;
- destructive tenant lifecycle, seeding, migration, or bulk-delete controls;
- changes to staff privilege or system-account state;
- cross-tenant export or unredacted sensitive-data access;
- audit-log deletion or mutation.

The ordinary role matrix must not be able to grant the capability that edits the matrix itself without an explicit protected workflow.

If true break-glass access is approved, use dedicated non-daily accounts with MFA/reauthentication, short-lived or just-in-time enablement, mandatory reason/ticket, alerting, post-use review, and no self-approval. Possessing `admin.permissions.manage` must never allow a principal to grant itself hard-SA or break-glass status.

### 5.8 Preferred expand/contract data shape

Do not mutate the legacy matrix in place before behavior is mapped. The preferred transition is to add a clear v6 representation, evaluate it in non-authoritative shadow through an adapter, migrate feature slices under the authority states below, then retire legacy columns/tables only after parity evidence.

| Data object | Minimum fields / responsibility |
|---|---|
| `authorization_capabilities` | key, resource type, action, category, description, risk class, delegable flag, required context, active flag |
| `role_capability_grants` | role key, capability key, scope kind, optional scope resolver/profile, active flag |
| `user_capability_grants` | user ID, immutable capability/profile version, scope kind and target, starts/expires, reason, requester, approver, revoked fields |
| `authorization_policy_version` | current version and changed-at marker used to invalidate decision caches |
| Relationship resolvers | reviewed functions for tenant membership/admin, assigned tenant, owner, facilitator, or other named relationships |
| `permission_change_log` | immutable actor, action, target, before/after, reason, request/correlation ID; written atomically with the mutation |

Whether these are new tables or carefully evolved existing tables is a P2 design choice after checking current constraints, grants, policies, triggers, and consumers. The logical separation is required; the exact table count is not.

Prefer a non-exposed/private schema for policy and grant internals. Browser code should receive decisions through narrowly granted wrappers rather than directly reading the grant graph. Enforce database invariants for time ranges, scope/target compatibility, revocation state, principal class, inactive capabilities/roles, and machine-profile assignment.

Named access profiles are immutable and versioned. Expanding a profile creates a new version and an affected-principal preview; it does not silently amplify every existing grant. Role-bundle changes require the same fan-out preview and approval.

### 5.9 Enforcement and batching flow

```text
Route + navigation ──> useAuthorization / authorizeMany ──┐  UX only
Browser data call ───> PostgREST/RPC ──> RLS/current-user ├─> policy evaluator
Edge Function ───────> requireCaller ──> service evaluator ┘      │
                                                                 ├─ principal state
                                                                 ├─ role/user grants
                                                                 ├─ tenant/resource scope
                                                                 └─ named relationships
```

The React layer should not download the complete permission matrix. Provide a batched decision API for the capabilities needed by the current route/layout, and cache only by subject, verified tenant/context, requested capabilities, and policy version. A cache hit never replaces server enforcement for the subsequent data operation.

For browser/RLS use, expose a uniquely named current-user wrapper that derives `auth.uid()`. For Edge use, expose a distinct service-only wrapper; do not overload the two signatures. The service wrapper is only a programming boundary—any Edge Function holding the service role can technically invoke it for any subject—so human endpoints must pass only the ID obtained from the shared verified-token gate, and machine endpoints need dedicated workflow credentials and fixed target scope.

### 5.10 Migration authority and cutover states

Every capability has exactly one authoritative evaluator at a time:

```text
legacy_enforce_v6_shadow -> v6_enforce_legacy_shadow -> v6_only
```

- Shadow decisions never affect the response. Record sanitized four-way comparisons: both allow, both deny, legacy allow/v6 deny (lockout risk), and legacy deny/v6 allow (escalation risk).
- Never combine old and new decisions with `OR` or `AND`.
- Never fall back to an allow when the v6 evaluator errors, returns a partial batch, or lacks context.
- Approve every mismatch before switching authority. Unexpected v6-only allows have a zero-tolerance cutover threshold.
- During transition, freeze permission editing for the migrated slice or dual-write both models in one transaction with one declared source of truth.
- A rollback may restore legacy authority only for a pre-characterized slice and must not restore known fail-open behavior, a revoked grant, or a disabled principal's access.
- Store the authority mode in code/deployment configuration or an equivalently protected, audited control. It is not an ordinary editable permission.

Each capability ships as a vertical slice: inventory every backing path, implement and probe server enforcement, observe parity, then switch route/navigation UX last.

## 6. Assumed post-optimization prerequisites

This plan assumes Claude has implemented the relevant outcomes of the optimization plan. Before RBAC implementation, verify rather than assume that these artifacts exist:

1. A canonical route manifest or route metadata source used by routing and navigation.
2. Feature/module boundaries for Academy, Packages, Stages, Administration, and client surfaces.
3. A split between session identity, profile/account state, tenant membership, and permission data.
4. Shared Edge request/auth helpers with characterization tests.
5. A reliable route inventory and evidence/verification packet generator.
6. A Playwright smoke harness that supports multiple authenticated personas without storing credentials in the repository.

If a prerequisite is absent, add the smallest enabling PR to this program. Do not recreate a second route registry or a second auth abstraction alongside optimization work.

## 7. Delivery plan

Each phase is independently reviewable. “Complete” means its exit gate is evidenced, not merely that code exists.

### P0 — Freeze the baseline and close correctness holes in bounded slices

**Goal:** make existing decisions fail closed and auditable before expanding their reach.

Work:

- **P0.1 inventory/characterization:** generate a versioned inventory of routes, nav entries, raw role checks, `usePermission` calls, public RPCs, effective live RLS policies/functions/triggers/grants/owners, role rows, matrix gaps, assignments, system identities, and helper dependencies from `pg_depend`. For every deployed Edge Function, record deployed state, repository/live parity, `verify_jwt`, human JWT/shared-secret/webhook/cron mode, every action branch, and the first privileged read/write line.
- **P0.2 permission mutation/audit:** inspect the existing `log_permission_change()` trigger and manual Edge insert, then choose exactly one atomic audit owner. The mutation, one immutable audit row, and policy-version increment occur in one transaction with required reason, correlation/idempotency ID, and optimistic expected version. Prefer execution under the validated user JWT so SQL derives `auth.uid()`; if an Edge service client must supply actor identity, bind it to the independently verified caller and document that service-role input is trusted application data.
- **P0.3 active-principal rollout:** add a versioned/shadow `is_active_principal_v6()` decision first. Compare it with existing helpers, classify disabled humans and intentional machine/system principals, then cut over one policy/RPC/helper family at a time. Do not replace a helper referenced by hundreds of policies in one uncharacterized deployment.
- **P0.4 session and frontend state:** implement the approved disable/archive session response, while recognizing that already issued JWTs may remain valid until expiry. Sensitive server decisions still live-check principal state. Frontend lookup failure becomes `access_unavailable`, not “enabled,” a denial redirect, or a dashboard redirect.
- **P0.5 role/matrix decisions:** explicitly seed the six `admin.documents.bulk_generate` gaps as `none`/inactive until separately approved. Decide `Team Member` and the inactive automation grant before filtering. Matrix completeness never means granting access.
- Add regression tests for disabled Super Admin, disabled internal role, archived user, old token after disable, unknown feature, inactive supplemental role, expired grant, duplicate audit prevention, forced audit failure rollback, concurrent edits, retry idempotency, and each active-principal canary family.

Blast radius:

- login and session refresh;
- all helpers that call `is_super_admin_safe` or `is_vivacity_*`;
- Edge Functions using `requireCaller`;
- background jobs intentionally using system identities;
- role-permission admin UI and change-log consumers.

Exit gate:

- no inactive human principal can pass route, RPC, Edge, or RLS test paths;
- one permission mutation produces exactly one complete audit record, and a forced audit failure rolls back the mutation and version bump;
- machine/system paths remain available only through explicitly classified principal types and workflow gates;
- role-registry drift has a recorded product decision and migration path;
- `npm run test:edge-functions`, targeted Vitest, typecheck/build, and direct authenticated allow/deny probes pass.

### P1 — Approve the policy model and compatibility mapping

**Goal:** convert ambiguous levels into reviewed actions and scopes without a big-bang cutover.

Work:

- Write an ADR for the five-concept model and the hard-SA/break-glass policy.
- Export all 85 current features and 523 role rows into a review worksheet or generated Markdown table.
- For every feature, classify current `full`, `limited`, and `owner_only` behavior into atomic actions and scopes. Mark unknown cases; do not guess.
- Add Stage catalogue candidates, at minimum:
  - `stages.view`
  - `stages.create`
  - `stages.edit`
  - `stages.publish`
  - `stages.archive`
  - `stages.analytics.view`
  - `stages.assignment.manage`
- Classify capabilities by risk and delegability.
- Define the job-role defaults with the product owner and a representative of each operating seat.
- Approve the normative composition/precedence rules, machine-principal rules, hard-SA versus true break-glass decision, and self-approval prohibition.
- Create a separately reviewed, versioned golden access matrix owned by product/security. This is the test oracle; generated catalogues prove completeness but do not define their own expected authorization.
- Define an expand/contract mapping and per-capability authority state so legacy `usePermission(feature, level)` continues working while callers migrate. Never adapt `owner_only` without target context.

Blast radius:

- saved matrix values;
- feature-editor labels and ordering;
- any code relying on ordinal comparison;
- documentation that treats `owner_only` as a privilege level.

Exit gate:

- every current feature has an owner, action/scope mapping, and disposition;
- every route and mutation endpoint has a proposed capability;
- no automatic legacy conversion remains ambiguous;
- the golden access matrix and break-glass operating decision have named owners and approval evidence.

### P2 — Build one server-side decision core

**Goal:** create a canonical policy decision function while keeping enforcement points thin.

Work:

- Add normalized capability metadata and grants using an additive expand/contract migration, preferably in a non-exposed schema. New capabilities and grants seed inactive/denied; every non-deny default is a separate approved behavior change.
- Provide two SQL entry points:
  - a uniquely named browser/RLS-safe wrapper deriving the subject from `auth.uid()` and executable only by `authenticated` where required;
  - a differently named service-only wrapper accepting the subject already obtained from verified token handling and executable only by `service_role`.
- Put shared internals behind narrowly granted wrappers. Revoke `PUBLIC` in the same migration, grant exact roles, pin owner, use `SECURITY DEFINER`, `search_path=''`, and full qualification, and assert `proacl`, `prosecdef`, `proconfig`, owner, and exactly one intended signature. Use a versioned function name where replacing an existing signature would create dependency risk.
- Validate active principal first, then capability, target tenant/resource, scope, and relationship.
- Resolve resource-to-tenant ownership inside the trusted boundary and reject a supplied tenant/resource mismatch. Human Edge endpoints pass only the subject derived by `auth.getUser(token)`, never a body/header subject. Machine paths use dedicated per-workflow credentials and fixed capabilities/scope; inventory and retire any use of the broad service-role key as an inbound HTTP secret where feasible.
- Add a sanitized admin-only explanation function and stable reason codes.
- Include a monotonically increasing `policy_version` changed in the same transaction as role/profile/grant/account-state mutations.
- Add a bounded, deduplicating batch-decision function that returns one policy-version snapshot and fails closed on missing or partial entries.
- Inventory callers of arbitrary-subject `check_permission`, move browser callers to a self-only wrapper and Edge callers to the service-only wrapper, then revoke `authenticated` execution on the arbitrary-subject overload as early as dependencies permit. Keep only a bounded legacy adapter for characterized callers.
- Add database checks for expiry after start, scope/target compatibility, revocation state, inactive capabilities/roles, human-versus-machine profile assignment, and idempotency uniqueness.

Do not:

- allow a browser caller to supply another user's ID;
- let service-role possession substitute for authorization;
- accept tenant ID without resolving target ownership/membership;
- return sensitive cross-tenant resource existence in denial details;
- cache positive decisions inside sensitive Edge/RPC/RLS enforcement;
- let two administrators silently overwrite each other or a retry duplicate a mutation/audit row.

Exit gate:

- decision-table tests cover every reason code and scope kind;
- the direct authenticated path cannot impersonate another user;
- unknown action, missing context, cross-tenant target, disabled user, expired grant, and inactive role all deny;
- compatibility decisions match the independently approved golden matrix for characterized cases;
- spoofed subject, spoofed tenant, target-swap, concurrency, stale-version, and retry tests pass.

### P3 — Connect route metadata in shadow mode without widening access

**Goal:** streamline UX gates without changing effective access before backing server boundaries are ready.

Work:

- Add `requiredCapability`, optional context resolver, and risk metadata to the canonical route definition.
- Derive router wrappers, navigation visibility, breadcrumbs, and route inventory from that source.
- Evaluate capability metadata in shadow mode while legacy route gates remain authoritative. Do not remove `requireSuperAdmin`, `allowedRoles`, or `allowVivacityTeam` for a feature until its vertical server slice passes P4/P5/P6 gates.
- Keep an explicit `hardSuperAdmin` marker for reviewed non-delegable routes; make it exceptional and inventory it.
- Define the frontend state machine: unauthenticated, loading, allowed, denied, and access-unavailable. Transport/configuration failure is unavailable, never an allow or an automatic denial redirect.
- Characterize and preserve the current guard ordering and special cases: session/profile recovery, disabled state, Academy-only landing, KPI reviewer, client Admin/User, Vivacity staff, EOS, hard-SA, add-in/Teams shells, and unknown routes. Use dedicated unguarded forbidden and retry destinations to avoid redirect loops.
- Key decision cache by auth-session generation, subject, verified tenant/resource context, canonical action set, and policy version. Cancel and purge it on sign-out, account switch, token refresh, impersonation/client-preview change, or policy-version mismatch. Never reuse placeholder/previous data across identities.
- Ensure deep links and hidden nav use the same route rule.
- Assert that protected layouts, data queries, and side effects do not mount before an allow decision.

Priority route slices:

1. Academy routes currently guarded by `ACADEMY_BUILDER_ROLES`.
2. Package and Stage management routes required by the AJ pilot.
3. Role-permission administration and system controls.
4. Remaining Administration routes.
5. Internal and client feature routes.

Exit gate:

- adding a route requires declaring its access metadata once, but legacy enforcement remains authoritative until a vertical cutover;
- route and nav inventories are generated, with CI failing on unclassified protected routes;
- route tests use the separately approved golden matrix as their oracle, not copied production metadata;
- deterministic browser tests cover deep link, refresh, back/forward, unavailable/retry, logout/account switch, and all current special-case personas;
- no route has been widened in P3.

### P4 — Deliver Stage capabilities and the AJ/CSC pilot

**Goal:** solve the original business case safely and collect operational evidence.

Work:

- Treat every delegated Academy/Package/Stage capability as a complete vertical slice: trace reads, writes, RPCs, storage, Edge Functions, RLS, triggers, jobs, and related effects; implement and directly probe server enforcement first; observe legacy/v6 parity; switch the route/nav gate last.
- Add approved Stage capabilities initially inactive/denied. Activate only the exact pilot grants after the vertical slice passes.
- Define the AJ access profile using exact Academy/package/stage actions.
- Choose and record scope: named tenants, assigned tenants, or global operational scope. Do not infer global access from “internal staff.”
- Require reason, approver, start, expiry/review date, and ticket/audit reference for any user-specific grant.
- Verify actual effective access with the explanation endpoint before the pilot, and prove no backing operation remains unclassified.
- Run the pilot, collect denied-decision logs and user feedback, then decide whether the capability belongs in the CSC default bundle or remains an exception.

AJ pilot negative tests:

- cannot open permission administration, system configuration, destructive lifecycle, or unrelated executive routes;
- cannot mutate a tenant/resource outside the approved scope;
- cannot call the underlying RPC/Edge Function directly when the page is hidden;
- loses access on expiry, disable, archive, or grant revocation;
- cannot gain extra rights through a stale supplemental role or cached decision.

Exit gate:

- the approved workflow succeeds end to end without Super Admin;
- direct negative probes fail at the server boundary;
- the route/nav change was the final enforcement change in each slice;
- no unrelated role bundle was granted;
- an evidence packet records routes, API calls, SQL/RLS results, audit rows, and expiry behavior.

### P5 — Migrate high-risk Edge Functions and RPCs

**Goal:** apply the decision contract where service-role bypass makes application authorization essential.

Work:

- Generate an endpoint authorization manifest covering repository/live deployment parity, deployed state, `verify_jwt`, auth mode, every action branch, action, resource, target-ID source, tenant resolver, relationship rule, machine/human caller, risk class, and first privileged read/write. CI rejects an unclassified new or changed function.
- Prioritize mutations, exports, staff/user administration, Academy/package/stage controls, tenant lifecycle, and functions touching secrets or external systems.
- Replace broad role checks with capability plus target validation.
- Replace generic `orAllow`, `allowTenantMember`, and `allowClientAdmin` use with named, tested relationship policies such as `tenant_admin_of_target` or `assigned_consultant_for_tenant`. A resolver verifies active principal, active membership, correct target tenant role, and canonical resource-to-tenant binding together; existence in `tenant_users` or a global `Admin` string is insufficient.
- Validate all branches/modes of multi-action functions.
- Keep machine-to-machine secret gates separate from human authorization and assign machine-principal capability profiles.
- Update each function's `*.test.mjs` in the same PR and run the configured Edge suite.

Exit gate:

- every high-risk service-role endpoint has a classified subject/action/resource/tenant policy;
- no caller-supplied target ID is trusted without server resolution;
- branch coverage proves every mode crosses the gate before reads/writes;
- skipped/relationship fallback paths are named, bounded, and tested;
- the deployed auth mode agrees with the reviewed endpoint manifest.

### P6 — Migrate RLS and database functions by risk

**Goal:** reduce duplicated role logic while preserving tenant behavior.

Work:

- Inventory effective live `pg_policies`, function definitions, triggers, grants, owners, and API exposure. Migration-text grep is not enough.
- Classify each table: tenant-owned, Vivacity operational, shared reference, system-only, or intentionally public.
- Start with high-risk mutation policies and SECURITY DEFINER RPCs, then sensitive reads, then ordinary reads.
- Preserve coarse tenant isolation and add capability/relationship checks only where needed. Do not turn every policy into one expensive all-purpose function.
- For each table and command, capture the exact current policy and grants, add/test the v6 policy under a distinct name, then remove the legacy permissive policy in the **same transaction** as cutover. PostgreSQL permissive policies combine with `OR`; leaving both active does not tighten access. UPDATE verification covers SELECT visibility, `USING`, and `WITH CHECK`.
- For service-role paths, prove app-layer authorization separately because RLS is bypassed.
- Split statement-stable principal/grant evaluation from row-dependent tenant/resource predicates. Avoid policy recursion; narrowly scoped SECURITY DEFINER lookup helpers must not traverse policies that call them back. Use `(select helper(...))` where Postgres can safely initPlan-cache a non-row-dependent decision.
- Benchmark empty, representative, large-tenant, and bulk-mutation queries with `EXPLAIN (ANALYZE, BUFFERS)` before and after policy changes; index every membership/grant/scope/tenant predicate.
- Sweep all frontend, RPC, function-body, and trigger write paths before constraints or schema changes, per `AGENTS.md`.
- Verify grants as real `authenticated` and tenant personas, never only postgres/service role.

Exit gate:

- schema-derived CI reports every exposed table's classification and RLS state;
- direct cross-tenant SELECT/INSERT/UPDATE/DELETE probes deny for client and scoped-staff personas;
- expected same-tenant and approved cross-tenant operations still succeed;
- policy latency remains within the agreed budget;
- every migration has an audit entry and exact captured rollback/forward-fix artifacts. If cutover reveals authorization widening, prefer an immediate deny/forward fix over restoring a known-broad policy.

### P7 — Add safe delegation and access review

**Goal:** make exceptions operable without whole-role privilege accumulation.

Work:

- Add user capability grants or immutable/versioned named access profiles with capability, scope, target, start, expiry, reason, requester, approver, and revoker. Existing grants pin a profile version; editing a profile never silently changes them.
- Default temporary grants to an expiry; require an explicit justification for non-expiring grants.
- Prevent human assignment of machine/automation profiles.
- Add effective-access preview and “why” output before saving.
- Add review queues for expiring, expired-but-still-effective, inactive-role, dormant, and high-risk grants.
- Make batch permission changes atomic and display their single audit event plus affected cells. Require expected policy version and idempotency/correlation ID; a conflict reloads for review rather than last-write-wins, and a retry cannot duplicate the change.
- Require secondary approval for high-risk delegable grants if the operating model can support it; otherwise keep them non-delegable.
- Prohibit self-approval and human assignment of hard-SA/break-glass or machine profiles through the ordinary workflow.

Exit gate:

- administrators can answer who has a capability, through which role/grant, for which scope, why, and until when;
- revocation and expiry are tested without waiting for long TTLs;
- no grant mutation can succeed without audit evidence;
- role/profile fan-out preview identifies every affected principal before approval;
- quarterly access-review instructions are in the KB.

### P8 — Retire duplicate client policy and raw checks

**Goal:** remove the old parallel systems only after migration evidence exists.

Work:

- Replace raw role checks with `useAuthorization`, semantic relationship hooks, or display-only role labels.
- Remove static `ROLE_PERMISSIONS` and route arrays once no production caller depends on them.
- Retire the legacy level adapter after every feature is mapped.
- Centralize role constants/types generated from or validated against the registry where practical.
- Delete obsolete permission code and tests in the same bounded feature PR, measuring net LOC and cognitive surface.
- Add lint/CI checks for new raw job-role authorization comparisons and unclassified routes/endpoints.

Exit gate:

- one production policy source drives client decisions;
- zero unexplained `requireSuperAdmin`, `allowedRoles`, or authorization-grade raw role comparisons remain;
- copied-policy tests are gone;
- generated inventory and targeted tests pass.

### P9 — Consider minimal JWT claims only after measurement

**Default decision:** do not store the full dynamic capability set, tenant scopes, or supplemental grants in JWTs.

Only pursue a Custom Access Token Hook if measurements show that live decision calls are a meaningful bottleneck. Safe candidate claims are coarse identity hints or an `authorization_version` used for UI/cache invalidation. Server-side sensitive decisions must still validate current account state and target context.

If implemented:

- use `raw_app_meta_data`/server-controlled claims, never user-editable metadata;
- document token staleness and force refresh/revoke on high-risk change;
- keep claims small;
- test old-token behavior after disable, role change, and grant revocation;
- never treat a JWT tenant ID as sufficient proof of current target access.

## 8. Verification strategy

### 8.1 Authorization decision table

Generate tests from data shaped like:

| Principal | State | Role/grant | Action | Target tenant/resource | Relationship | Expected |
|---|---|---|---|---|---|---|
| SA | active | SA | hard-SA action | valid | n/a | allow |
| SA | disabled | SA | any | valid | n/a | deny |
| CSC pilot | active | scoped grant | stages.edit | approved tenant/stage | assigned/explicit | allow |
| CSC pilot | active | scoped grant | stages.edit | other tenant | none | deny |
| CSC | active | no grant | admin.permissions.manage | global | n/a | deny |
| Client Admin | active | tenant membership | members.manage | own tenant | tenant admin | allow |
| Client Admin | active | tenant membership | members.manage | other tenant | none | deny |
| Any | active | unknown/inactive capability | unknown | any | any | deny |
| Automation | active system | machine profile | declared job action | declared tenant | service authorization | allow |
| Human | active | automation role | same action | any | any | deny |

Cover positive, negative, boundary, and stale-cache/token cases. Expected outcomes come from the independently approved golden access matrix, not from production policy code or the generated catalogue. Catalogue generation may fail for missing classification, but it cannot define its own authorization oracle.

### 8.2 Layered verification

| Layer | What it proves | Tool/path |
|---|---|---|
| Pure evaluator/unit | action/scope/relationship semantics and reason codes | Vitest and SQL unit assertions |
| Component | loading/error/denied/allowed UI and effective-access explanation | Testing Library |
| Route/navigation | deep links, redirects, hidden nav, persona-specific UX | Playwright |
| Edge/RPC | direct-call authorization and branch ordering | Node Edge tests plus authenticated HTTP probes |
| RLS | same-tenant allow and cross-tenant denial through deployed request role | REST/RPC calls with real JWT personas; optional Supabase RLS Tester for diagnosis |
| Audit | mutation and audit atomicity, actor, reason, before/after, target | SQL assertions and admin UI |
| Performance | policy/query regression | representative `EXPLAIN ANALYZE` and request timings |

Playwright is necessary but insufficient: a hidden button does not prove a direct REST, RPC, or Edge call is denied.

Require test-sensitivity evidence: deliberately remove or bypass a guard in a controlled test branch/mutation and show that the relevant test fails. The verification packet must distinguish completeness tests, policy-oracle tests, direct boundary probes, and mocked UI-state tests.

### 8.3 Required personas

- active Super Admin;
- disabled Super Admin;
- active CSC with no exception;
- AJ/CSC pilot equivalent with scoped exception;
- Integrator or Team Leader with approved defaults;
- legacy Team Member during migration;
- client Admin in tenant A;
- client User in tenant A;
- client user in tenant B for cross-tenant negatives;
- dedicated machine/system principal.

The repository has no local backend and no guaranteed seeded credentials. Split execution into:

1. deterministic local component/browser tests with a controllable decision API for every state transition;
2. schema-branch or disposable-environment SQL, migration, dependency, pgTAP, write, disable, expiry, and cleanup tests using synthetic multi-tenant fixtures;
3. gated real-backend, real-JWT, preferably read-only smoke tests for personas actually available;
4. production mutation probes only with fresh explicit authority, approved QA tenants/accounts, bounded cleanup, and an audit trail.

Never commit credentials/tokens or rely on staff “View as Client” as proof of client RLS behavior. A missing persona, credential, disposable environment, or required boundary produces an **Inconclusive** result, never Pass. A Supabase branch proves migration mechanics with synthetic data; it does not prove production-data parity, so pair it with read-only production preflight and shadow comparison.

### 8.4 Observability and go/no-go controls

Every enforcement slice defines before rollout:

- baseline and observation window;
- owner and dashboard/query;
- evaluator errors and latency;
- allow/deny counts by action, risk, and reason without high-cardinality resource IDs or unnecessary PII;
- old/new mismatch classes;
- stale-policy-version responses, frontend access-unavailable states, and downstream 401/403 rates;
- zero unexpected v6-only allows, an approved bound for expected-denial mismatches, and explicit stop/rollback thresholds;
- a correlation/request ID carried across UI decision, Edge/RPC, mutation audit, and diagnostic log where applicable;
- the exact rollback or forward-fix command/procedure.

Sample routine allow decisions if volume requires it. Retain high-risk mutation decisions and unexpected denies according to the approved audit/observability policy. Failure to write a configuration-change audit rolls back that change; loss of ordinary decision telemetry should alert but must not automatically cause a system-wide authorization outage unless explicitly required.

## 9. Blast-radius checklist for every implementation PR

Before editing:

- identify route, nav, component, hook, Edge, RPC, RLS, trigger, storage, cron, queue, add-in, and external integration paths;
- query current live policies/functions/grants when the DB boundary changes;
- identify direct browser calls and service-role calls separately;
- record current allowed and denied personas;
- inspect audit entries and commits for the feature since May 2026;
- confirm whether optimization work changed the relevant file boundaries.

Before merging:

- test disabled, archived, expired, inactive-role, unknown-capability, missing-context, and cross-tenant cases;
- test direct API calls, not only UI flows;
- prove every backing path in a delegated capability is classified and server-enforced before changing its route/nav gate;
- verify every multi-action Edge branch crosses auth before mutation;
- verify the deployed Edge auth mode, not only repository source;
- verify permission/audit/version writes are atomic, idempotent, concurrency-safe, and produce exactly one audit row after accounting for triggers;
- verify the capability's single authority mode and review all shadow mismatches; never accept `legacy OR v6` or fallback-to-allow;
- verify cache keys include user, tenant/context, and policy version when decisions are cached;
- verify logout/account/preview-context changes purge prior decision data and partial batch results fail closed;
- verify no service-role test is being presented as RLS proof;
- verify grants, owners, search paths, overload count, and Data API exposure for new/changed SQL objects;
- verify legacy permissive RLS policies are removed atomically with v6 cutover and policy recursion/performance checks pass;
- verify current and legacy roles still in production assignments;
- record unavailable personas/environments as Inconclusive rather than silently reducing the matrix;
- update the route/endpoint/policy inventory and KB;
- attach the evidence packet and rollback/forward-fix notes.

## 10. Claude Code implementation protocol

1. Start every phase from fresh `origin/main` in an isolated worktree and re-read `AGENTS.md`.
2. Re-run the phase inventory; do not trust counts in this dated plan after main advances.
3. Create one bounded PR per enforcement slice. A delegated capability is a vertical slice whose server enforcement lands and is proven before its UI gate. Avoid mixing policy-model schema, broad frontend cleanup, and unrelated feature refactors.
4. Characterize current allowed and denied behavior before changing it.
5. Use additive expand/contract migrations and the explicit authority states in section 5.10. Compatibility code observes or enforces according to the declared state; it never combines decisions or falls back to allow.
6. For schema/RLS/RPC/trigger work, create the required audit entry in the same PR and use the Supabase MCP deployment workflow only with separate explicit authorization.
7. Run targeted tests first, then build, Vitest, Edge tests, route inventory, and Playwright persona tests as applicable.
8. Produce a verification packet containing changed gates, golden-matrix cases, shadow mismatches, test-sensitivity evidence, commands/results, direct allow/deny probes, policy/function/trigger/grant snapshots, performance and observability evidence, rollback procedure, environment limitations, and known residual risks.
9. Stop after PR creation unless the user explicitly asks in that session to merge.

## 11. Documentation and KB updates

Update documentation as part of the relevant phase, not at the end of the program:

- mark the historical v6 handoff as expanded by this plan;
- refresh `docs/kb/codebase-state/route-inventory-by-role.md` from generated route metadata;
- update `docs/kb/pinned/conventions.md` to replace the broad “Vivacity staff ALL” ritual with classified tenant/resource/capability guidance after the policy ADR lands;
- reconcile the stale role matrix in `docs/kb/pinned/conventions.md` with the live role registry and approved seat definitions;
- decide whether `docs/kb/pinned/team-roles.md` describes engineering seats, application RBAC seats, or both; keep those vocabularies explicitly separate;
- add an authorization glossary for principal, role, capability, scope, relationship, policy decision point, enforcement point, and break-glass;
- document the access-grant and quarterly-review procedure;
- add one dated audit entry for every schema, RLS, trigger, RPC, permission backfill, or production grant change;
- preserve historical audit entries unchanged.

## 12. Program metrics

Track outcomes, not only replacement counts:

| Metric | Desired direction |
|---|---|
| Unclassified protected routes/endpoints/tables | to zero |
| Authorization-grade raw role comparisons | to zero except reviewed hard-SA assertions |
| Permission mutations without atomic audit | to zero |
| Permission mutations producing duplicate audit rows | to zero |
| Active assignments to undefined/inactive human roles | to zero or explicitly grandfathered with owner/date |
| High-risk non-expiring user grants | to zero |
| Cross-tenant negative tests per tenant-owned resource class | upward until complete coverage |
| Direct API negative tests for protected mutations | upward until every high-risk path is covered |
| Time to explain a user's effective access | measurable in one admin workflow, not a manual DB investigation |
| Policy decision latency | within an agreed budget established in P2 |
| Duplicate permission/route policy sources | to one canonical model plus thin adapters |
| Unexpected v6-only allows during shadow comparison | exactly zero before cutover |
| Unclassified deployed Edge auth modes or action branches | to zero |
| Capability cutovers where UI changed before server enforcement | exactly zero |

LOC reduction is a secondary benefit expected in P8. Do not trade visible duplication for an opaque generic policy engine that is harder to audit.

## 13. Decisions required from Vivacity before implementation

1. Is every active internal employee intended to have read access to every tenant, or should read/write scopes follow assigned portfolios?
2. What are the authoritative responsibilities of CSC, BGT, CET, Integrator, Team Leader, and the legacy Team Member seat?
3. Which actions must remain hard Super Admin, which may be delegated with approval, and does Unicorn need dedicated true break-glass accounts separate from daily Super Admin use?
4. Should temporary grants require a second approver, or is non-delegability the practical control for high-risk actions?
5. What expiry default and review cadence should apply to user-specific grants?
6. What exact tenant and resource scope should the AJ pilot receive?
7. Should disabled and archived users be signed out immediately from all sessions, and what operational recovery path is required?
8. Who owns quarterly access review and role-catalogue approval?
9. What disposable Supabase environment and persona-credential process is approved for write, expiry, disable, and cross-tenant tests?
10. What mismatch observation window and go/no-go thresholds are acceptable for each risk class?

No phase should silently answer these through code. Record approved answers in the policy ADR and relevant KB procedure.

## 14. Definition of program completion

RBAC v6 is complete when:

- Unicorn has one documented authorization vocabulary and one canonical server decision path;
- every protected route and navigation item is classified from canonical metadata;
- every high-risk Edge/RPC/RLS path independently enforces subject, action, target tenant/resource, and required relationship;
- each migrated capability has one authoritative evaluator, zero unapproved shadow mismatches, and a tested rollback/forward-fix procedure;
- disabled, archived, expired, inactive, unknown, missing-context, and cross-tenant cases fail closed;
- Vivacity job roles are reviewed default bundles, not scattered string checks;
- narrow, time-bound exceptions can be granted, explained, audited, reviewed, and revoked without assigning Super Admin or an unrelated whole role;
- the AJ/CSC workflow succeeds only within its approved capabilities and scope;
- direct API and RLS negative tests accompany Playwright UX verification;
- permission/grant/profile changes are concurrency-safe and atomically produce one audit row plus one policy-version change;
- duplicate static RBAC sources and ambiguous legacy levels are retired;
- KB current-state docs, conventions, grant procedures, and audit history agree with the shipped system.

## 15. Council amendment ledger

| Council finding | Severity | Incorporated safeguard |
|---|---|---|
| UI gate could open before server enforcement | Critical | Sections 5.10, P3, and P4 require a vertical slice and route/nav cutover last |
| Legacy/v6 combination was undefined | Critical | Section 5.10 defines one authority, shadow comparison, no `OR`/`AND`, and no fallback-to-allow |
| Existing trigger plus manual audit writer can duplicate/inconsistently attribute changes | High | P0.2 requires live trigger reconciliation, one audit owner, and exactly-one/rollback tests |
| Shared active-principal helper replacement could lock out humans or jobs | High | P0.1/P0.3 require dependency inventory, principal classification, shadow comparison, and batched canary cutover |
| Source imports do not prove deployed Edge auth | High | P0.1/P5 require a deployed auth-mode/branch manifest and CI classification |
| Arbitrary-subject evaluator and service role enable confused-deputy misuse | High | Sections 5.9/P2 use distinct wrappers, exact grants, verified-token subjects, and early revocation of browser access to the legacy overload |
| Generic tenant/admin fallbacks are not target-bound | High | P2/P5 require canonical resource-to-tenant resolution and named active relationship predicates |
| Concurrent permissive RLS policies widen through `OR` | High | P6 requires same-transaction legacy-policy removal for each table/command cutover |
| All-purpose per-row evaluator risks recursion and latency | High | P6 separates stable and row-dependent checks, requires indexes/initPlan-safe calls, and benchmarks representative/bulk plans |
| Frontend cache can leak prior-user/context allows or redirect on transport failure | High | P3 defines the five-state UI contract, cache identity/context/version keys, purge events, and unguarded retry/forbidden destinations |
| Tests could mirror production policy and pass tautologically | High | P1/8 require a separately approved golden matrix and test-sensitivity evidence |
| Required Playwright personas are not guaranteed | High | Section 8.3 splits deterministic, disposable, and gated real-JWT evidence; missing boundaries are Inconclusive |
| Mutable profiles, retries, and concurrent admins can silently amplify/overwrite access | High | Sections 5.8/P2/P7 require immutable versions, fan-out preview, idempotency, optimistic concurrency, and atomic version/audit updates |
| Daily SA versus true break-glass was ambiguous | High | Sections 5.3/5.7/P1 require an explicit operating decision, non-daily controls if used, and no self-grant/self-approval |
| Rollout lacked stop criteria and usable diagnostics | Medium-high | Section 8.4 defines correlation, mismatch/latency/error signals, thresholds, owners, observation windows, and exact recovery procedures |

Council approval means these safeguards are present in the plan. It does not waive phase-specific review, production authorization, or direct negative-path evidence.

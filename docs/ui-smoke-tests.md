# UI Smoke Test Matrix

This document defines the manual smoke test workflow for catching layout and pop-up regressions across roles and viewports.

## Quick Links

- **QA Smoke Page**: `/admin/qa/smoke` — Quick links to all test screens
- **QA Responsive Harness**: `/admin/qa/responsive` — Component-level testing
- **UI Definition of Done**: `docs/ui-definition-of-done.md`

---

## Roles Under Test

| Role | Access Level | Key Screens |
|------|--------------|-------------|
| **Super Admin** | Full system access | All screens, all admin functions |
| **Team Leader** | Vivacity staff, operational management | EOS, clients, content management |
| **Team Member** | Vivacity staff, execution focus | EOS core, assigned work |
| **Client Admin** | Tenant admin | Tenant dashboard, users, documents |
| **Client User** | Standard user | Documents, assigned tasks |

---

## Viewports Under Test

| Width | Device Class | Priority |
|-------|--------------|----------|
| **320px** | Small mobile | Critical |
| **375px** | iPhone SE/mini | Critical |
| **768px** | Tablet portrait | High |
| **1024px** | Tablet landscape / small laptop | High |
| **1280px** | Desktop | Standard |

---

## Smoke Test Matrix

### Core Screens

| Screen | Route | Roles | Check Items |
|--------|-------|-------|-------------|
| Dashboard / Work | `/` | All | Cards readable, actions visible, no horizontal scroll |
| Profile Settings | `/settings/profile` | All | Form fields visible, save button accessible |
| Manage Users | `/admin/users` | Super Admin, Team Leader | Table readable, invite modal opens, filters work |
| Manage Tenants | `/admin/tenants` | Super Admin | Cards/table readable, create modal opens |
| Documents Portal | `/documents` | All | List renders, filters stack on mobile |
| EOS Overview | `/eos` | Vivacity Staff | Dashboard cards, quick actions visible |
| EOS Meetings | `/eos/meetings` | Vivacity Staff | Meeting list, create modal, detail drawer |
| EOS Rocks | `/eos/rocks` | Vivacity Staff | Rock cards, status badges readable |
| EOS To-Dos | `/eos/todos` | Vivacity Staff | To-do list, checkbox accessible |
| EOS Issues | `/eos/issues` | Vivacity Staff | Issue list, priority badges visible |

### Modal Flows

| Modal | Trigger Screen | Roles | Check Items |
|-------|----------------|-------|-------------|
| Create User / Invite | Manage Users | Super Admin, Team Leader | Form fields visible, submit button accessible, no viewport overflow |
| Edit User | Manage Users | Super Admin, Team Leader | Pre-filled form, long email/name display |
| Create Tenant | Manage Tenants | Super Admin | All fields visible, validation errors readable |
| Create Meeting | EOS Meetings | Vivacity Staff | Date picker accessible, participant selector works |
| Create Rock | EOS Rocks | Vivacity Staff | Form scrolls if needed, submit visible |
| Confirm Dialog | Various | All | Text readable, buttons accessible, ESC closes |

---

## Per-Cell Verification Checklist

For each (Role × Viewport × Screen) combination:

### Layout
- [ ] No horizontal page scroll
- [ ] Primary content readable (not clipped)
- [ ] Actions/buttons visible and tappable (44px min)
- [ ] Sidebar collapses correctly (mobile)

### Typography
- [ ] Labels wrap, not truncate (unless with tooltip)
- [ ] Long names/emails handled correctly
- [ ] Error messages readable

### Modals/Drawers
- [ ] Opens within viewport
- [ ] Body scrolls if content exceeds height
- [ ] Footer actions visible (sticky)
- [ ] Close button accessible
- [ ] ESC key works

### Tables
- [ ] Cards show on mobile
- [ ] Key columns visible at each breakpoint
- [ ] Actions reachable

---

## Test Execution Workflow

### 1. Pre-Release Smoke Test

Before each release:

1. Open `/admin/qa/smoke`
2. Note current role badge
3. For each screen link:
   - Click viewport presets: 375, 768, 1280
   - Open associated modals
   - Check against matrix
4. Log any issues found

### 2. Role Switching

To test different roles:

1. **Super Admin**: Use primary dev account
2. **Team Leader**: Create/use test account with Team Leader role
3. **Team Member**: Create/use test account with Team Member role
4. **Client Admin**: Impersonate or use test tenant admin
5. **Client User**: Impersonate or use test tenant user

### 3. Quick Pass vs Full Pass

| Pass Type | Viewports | Screens | When |
|-----------|-----------|---------|------|
| Quick | 375, 1280 | Dashboard, key modal | Every PR |
| Standard | 375, 768, 1280 | All core screens | Pre-release |
| Full | All 5 | All screens + modals | Major release |

---

## Evidence Capture

### Screenshot Naming Convention

```
{date}_{role}_{screen}_{viewport}.png
```

Examples:
- `2024-01-15_superadmin_manage-users_375.png`
- `2024-01-15_teamleader_eos-meetings_1280.png`

### Minimum Evidence Set

For each release, capture:

| Role | Viewport | Screens |
|------|----------|---------|
| Super Admin | 375, 1280 | Dashboard, Manage Users, EOS Overview |
| Team Leader | 375, 1280 | Dashboard, EOS Meetings |
| Client Admin | 375, 1280 | Dashboard, Documents (when available) |

### Storage Location

Store in: `docs/evidence/smoke-tests/{YYYY-MM}/`

Or shared drive: `QA/Smoke Tests/{Release Version}/`

---

## Dev Mode Warnings

In development only, the app automatically checks for:

1. **Horizontal overflow**: `document.body.scrollWidth > window.innerWidth`
2. **Modal overflow**: Modal content exceeding 85vh without scroll
3. **Touch target violations**: Buttons/inputs < 44px

Warnings appear in console with:
- Current route
- Current user role
- Viewport width
- Measured values

To enable verbose logging, set `localStorage.setItem('QA_VERBOSE', 'true')`.

---

## Known Exceptions

Some screens have intentional behaviour that may trigger warnings:

| Screen | Behaviour | Reason |
|--------|-----------|--------|
| EOS Org Chart | Horizontal scroll | Large chart requires panning |
| PDF Viewer | Fixed width | Document rendering |
| Data Export | Wide table | Intentional for copy/paste |

---

## Updating This Document

When adding new screens:

1. Add row to Core Screens table
2. Add modal flows if applicable
3. Update minimum evidence set if critical
4. Test at 375px before merge

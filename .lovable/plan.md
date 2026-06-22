### Fix invite-user edge function skip_email routing for Vivacity staff

**File:** `supabase/functions/invite-user/index.ts`

**Change:** In the `skip_email` block (around line 425), update the `v_relationship_role` resolution logic so that Vivacity internal invites (`invite_as === 'VIVACITY'`) default to `null` instead of `'user'`.

**Before:**
```typescript
let v_relationship_role: RelationshipRole;
const isVivacityTarget = payload.invite_as === 'VIVACITY';
if (payload.relationship_role) {
  v_relationship_role = payload.relationship_role;
} else if (payload.unicorn_role === 'Admin') {
  v_relationship_role = 'primary_contact';
} else {
  v_relationship_role = 'user';
}
```

**After:**
```typescript
let v_relationship_role: RelationshipRole | null;
const isVivacityTarget = payload.invite_as === 'VIVACITY';
if (payload.relationship_role) {
  v_relationship_role = payload.relationship_role;
} else if (isVivacityTarget) {
  v_relationship_role = null;
} else if (payload.unicorn_role === 'Admin') {
  v_relationship_role = 'primary_contact';
} else {
  v_relationship_role = 'user';
}
```

**Why:** Existing Vivacity team members have `relationship_role = null` in `tenant_users`. The frontend uses this `null` to route users to the Vivacity admin dashboard. Defaulting to `'user'` was incorrectly routing newly invited Vivacity staff to the Academy client portal.

**Out of scope:**
- Normal (non-skip_email) invite path — already correctly uses `payload.relationship_role ?? null`.
- UI components, other edge functions, the switch statement, or the `isVivacityTarget` override block below this assignment.

**Verification:** After deployment, invite a Vivacity user via the skip_email path and confirm they land on the admin dashboard, not the Academy portal.
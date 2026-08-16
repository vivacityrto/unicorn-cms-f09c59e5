/**
 * Allowlist discipline for every service-role (or JWT) write into public.users.
 *
 * The three RESTRICTIVE RLS policies on public.users
 * (users_no_privilege_escalation, users_contact_fields_protected,
 * users_staff_edit_scope_restrict) only apply to the `authenticated` role.
 * A service-role UPDATE bypasses them, so every edge-function write must
 * name permitted columns explicitly — never spread an unfiltered request body.
 *
 * Self-edit columns are the profile / contact fields a user may change on
 * their own row. They align with public.users and with the columns
 * user_staff_safe_fields_only_changed() treats as non-privileged
 * (full_name, job_title, phone — plus updated_at, which is server-set).
 * Privilege columns stay out of both lists and are 403'd for non-admins.
 */

export const PROTECTED_USER_FIELDS = [
  "is_vivacity_internal",
  "global_role",
  "superadmin_level",
  "tenant_id",
  "unicorn_role",
  "user_type",
  "archived",
] as const;

export const ALLOWED_SELF_FIELDS = [
  "first_name",
  "last_name",
  "full_name",
  "preferred_name",
  "title",
  "job_title",
  "bio",
  "biography",
  "timezone",
  "mobile_phone",
  "phone",
  "phone_number",
  "personal_email",
  "personal_phone",
  "street_address",
  "street_number_and_name",
  "po_box",
  "po_box_address",
  "suburb",
  "postcode",
  "country",
  "avatar_url",
  "avatar_path",
  "avatar_updated_at",
  "linkedin",
  "linkedin_url",
  "booking_url",
  "website",
  "communication_pref",
  "working_days",
  "working_hours",
  "away_message",
  "availability_note",
  "public_holiday_region",
  "cover_user_id",
  "leave_from",
  "leave_until",
] as const;

/**
 * Admin additions on top of self-edit fields.
 * Privilege columns that belong on update-user-role (superadmin_level,
 * tenant_id, is_vivacity_internal, global_role) are intentionally absent —
 * even a manage-permission caller cannot set them through update-user-profile.
 * user_type / unicorn_role / archived stay here because ManageUsers already
 * sends them through this function.
 */
export const ALLOWED_ADMIN_FIELDS = [
  ...ALLOWED_SELF_FIELDS,
  "email",
  "user_type",
  "unicorn_role",
  "archived",
  "is_csc",
  "disabled",
  "staff_team",
  "staff_teams",
] as const;

export const ALLOWED_ROLE_UPDATE_FIELDS = [
  "unicorn_role",
  "user_type",
  "tenant_id",
  "staff_team",
  "staff_teams",
  "superadmin_level",
] as const;

export type ProfileUpdateFailure = {
  ok: false;
  status: number;
  code: string;
  detail: string;
};

export type ProfileUpdateSuccess = {
  ok: true;
  updates: Record<string, unknown>;
};

export type ProfileUpdateDecision = ProfileUpdateFailure | ProfileUpdateSuccess;

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

export function findProtectedFieldsInBody(body: Record<string, unknown>): string[] {
  return PROTECTED_USER_FIELDS.filter((key) => hasOwn(body, key));
}

export function pickAllowedUserColumns(
  body: Record<string, unknown>,
  allowed: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => allowed.includes(key)),
  );
}

export function buildAllowlistedProfileUpdates(
  body: Record<string, unknown>,
  opts: { isSelf: boolean; hasManagePermission: boolean },
): Record<string, unknown> {
  const source = opts.isSelf && !opts.hasManagePermission
    ? ALLOWED_SELF_FIELDS
    : ALLOWED_ADMIN_FIELDS;
  const updates = pickAllowedUserColumns(body, source);
  if (typeof updates.email === "string") {
    updates.email = updates.email.trim().toLowerCase();
  }
  return updates;
}

/**
 * Decide whether a profile write may proceed, and which columns it may touch.
 * Callers must not write to public.users unless this returns ok: true.
 */
export function authorizeAndBuildProfileUpdate(args: {
  callerId: string;
  targetUserUuid: string;
  hasManagePermission: boolean;
  isClientAdmin: boolean;
  body: Record<string, unknown>;
}): ProfileUpdateDecision {
  const isSelf = args.callerId === args.targetUserUuid;

  if (!isSelf && !args.hasManagePermission && !args.isClientAdmin) {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      detail: "You don't have permission to edit this user",
    };
  }

  const protectedPresent = findProtectedFieldsInBody(args.body);
  if (!args.hasManagePermission && protectedPresent.length > 0) {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      detail: `Cannot modify protected fields: ${protectedPresent.join(", ")}`,
    };
  }

  return {
    ok: true,
    updates: buildAllowlistedProfileUpdates(args.body, {
      isSelf,
      hasManagePermission: args.hasManagePermission,
    }),
  };
}

/**
 * Apply a profile update only after the allowlist / privilege gate passes.
 * `updateRow` is not invoked on 403 — the row stays unchanged.
 */
export async function applyUsersProfileUpdate<T>(args: {
  callerId: string;
  targetUserUuid: string;
  hasManagePermission: boolean;
  isClientAdmin: boolean;
  body: Record<string, unknown>;
  updateRow: (userUuid: string, updates: Record<string, unknown>) => Promise<T>;
}): Promise<
  | (ProfileUpdateSuccess & { result: T })
  | ProfileUpdateFailure
> {
  const decision = authorizeAndBuildProfileUpdate(args);
  if (!decision.ok) return decision;
  const result = await args.updateRow(args.targetUserUuid, decision.updates);
  return { ok: true, updates: decision.updates, result };
}

/**
 * Role-admin writes (update-user-role). Reject privilege columns that are
 * not part of this function's explicit contract, even for a manage-permission
 * caller — those belong on a dedicated, reviewed path.
 */
export function authorizeRoleUpdateBody(
  body: Record<string, unknown>,
): ProfileUpdateDecision {
  const sneaky = PROTECTED_USER_FIELDS.filter(
    (key) =>
      !(ALLOWED_ROLE_UPDATE_FIELDS as readonly string[]).includes(key) &&
      hasOwn(body, key),
  );
  if (sneaky.length > 0) {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      detail: `Cannot modify protected fields: ${sneaky.join(", ")}`,
    };
  }
  return {
    ok: true,
    updates: pickAllowedUserColumns(body, ALLOWED_ROLE_UPDATE_FIELDS),
  };
}

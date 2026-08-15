/**
 * Canonical caller gate for Unicorn edge functions.
 *
 * Every user-JWT function should go through this helper instead of
 * hand-rolled unicorn_role / global_role / is_vivacity_internal /
 * role_type checks. Authorization is `check_permission` — the same
 * RPC the UI (`usePermission`) and RLS policies use.
 *
 * Super Admin always passes inside check_permission. Feature keys and
 * their role grants live in permission_features / role_permissions;
 * see the "Edge-function authorisation" section of the repo README.
 *
 * Usage:
 * ```ts
 * import { requireCaller, FeatureKeys } from "../_shared/requireCaller.ts";
 *
 * const caller = await requireCaller(req, admin, {
 *   featureKey: FeatureKeys.staffInternal,
 * });
 * if (!caller.ok) return caller.response;
 * const { user } = caller;
 * ```
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders as defaultCorsHeaders } from "./cors.ts";

export const FeatureKeys = {
  staffInternal: "staff.internal",
  staffSharepoint: "staff.sharepoint.use",
  staffEmailSend: "staff.email.send",
  staffDocumentsGenerate: "staff.documents.generate",
  staffAi: "staff.ai.use",
  staffResearch: "staff.research.use",
  staffMeetings: "staff.meetings.use",
  staffXeroView: "staff.billing.xero_view",
  staffTga: "staff.integrations.tga",
  staffAddin: "staff.addin.use",
  adminPermissions: "admin.permissions.manage",
  adminUnicorn1: "admin.migration.unicorn1",
  adminTestingSeed: "admin.testing.seed",
  adminVector: "admin.vector.manage",
  adminXeroConnect: "admin.integrations.xero_connect",
  auditsExportPack: "audits.export_pack",
  adminEmailTemplates: "admin.email_templates.manage",
  adminSystemConfig: "admin.system_config.manage",
  adminTeamUsers: "admin.team_users.manage",
  adminInvites: "admin.invites.manage",
  adminCohortSend: "admin.cohort.send",
  adminBroadcastSend: "admin.broadcast.send",
  adminDocumentsBulkGenerate: "admin.documents.bulk_generate",
  clientsCreate: "clients.create",
  academyBuilderEdit: "academy.builder.edit",
  auditsReport: "audits.report",
} as const;

export type FeatureKey = (typeof FeatureKeys)[keyof typeof FeatureKeys] | (string & {});

export type RequireCallerSuccess = {
  ok: true;
  user: { id: string; email?: string };
  /** 'permission' = check_permission passed; 'fallback' = orAllow passed. */
  via: "permission" | "fallback";
};

export type RequireCallerFailure = {
  ok: false;
  response: Response;
};

export type RequireCallerResult = RequireCallerSuccess | RequireCallerFailure;

export type ErrorStyle = "error" | "ok-code";

export type RequireCallerOptions = {
  featureKey: FeatureKey;
  minLevel?: "full" | "limited";
  headers?: Record<string, string>;
  errorStyle?: ErrorStyle;
  unauthorizedMessage?: string;
  forbiddenMessage?: string;
  /**
   * Extra allow path evaluated only when check_permission is false.
   * Used for staff-OR-tenant-admin / staff-OR-tenant-member surfaces.
   */
  orAllow?: (ctx: {
    userId: string;
    admin: SupabaseClient;
  }) => Promise<boolean>;
};

function jsonBody(
  style: ErrorStyle,
  status: number,
  code: string,
  message: string,
): Record<string, unknown> {
  if (style === "ok-code") {
    return { ok: false, code, detail: message };
  }
  return { error: message };
}

function jsonResponse(
  headers: Record<string, string>,
  style: ErrorStyle,
  status: number,
  code: string,
  message: string,
): Response {
  return new Response(JSON.stringify(jsonBody(style, status, code, message)), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * True when the caller has an active tenant_users row for tenantId.
 * Intended for requireCaller({ orAllow }) on staff-OR-member email surfaces.
 */
export async function allowTenantMember(
  admin: SupabaseClient,
  userId: string,
  tenantId: number,
): Promise<boolean> {
  const { data } = await admin
    .from("tenant_users")
    .select("id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}

/**
 * True when the caller's unicorn_role is client Admin (tenant-admin path).
 * Does not consult check_permission — pair with a staff feature key via orAllow.
 */
export async function allowClientAdmin(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("users")
    .select("unicorn_role")
    .eq("user_uuid", userId)
    .maybeSingle();
  return data?.unicorn_role === "Admin";
}

export async function checkPermission(
  admin: SupabaseClient,
  userId: string,
  featureKey: FeatureKey,
  minLevel: "full" | "limited" = "full",
): Promise<boolean> {
  const { data, error } = await admin.rpc("check_permission", {
    p_user_id: userId,
    p_feature_key: featureKey,
    p_min_level: minLevel,
  });
  if (error) {
    console.error("[requireCaller] check_permission failed", {
      userId,
      featureKey,
      error: error.message,
    });
    return false;
  }
  return data === true;
}

/**
 * Resolve the Bearer caller and require check_permission(featureKey).
 * Returns either `{ ok: true, user }` or `{ ok: false, response }` ready to return.
 */
export async function requireCaller(
  req: Request,
  admin: SupabaseClient,
  options: RequireCallerOptions,
): Promise<RequireCallerResult> {
  const headers = options.headers ?? defaultCorsHeaders;
  const style = options.errorStyle ?? "error";
  const minLevel = options.minLevel ?? "full";

  const token = extractBearerToken(req);
  if (!token) {
    return {
      ok: false,
      response: jsonResponse(
        headers,
        style,
        401,
        "UNAUTHORIZED",
        options.unauthorizedMessage ?? "Missing Authorization",
      ),
    };
  }

  const { data: authData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !authData?.user) {
    return {
      ok: false,
      response: jsonResponse(
        headers,
        style,
        401,
        "UNAUTHORIZED",
        options.unauthorizedMessage ?? "Unauthorized",
      ),
    };
  }

  const user = { id: authData.user.id, email: authData.user.email };
  return requireCallerByUserId(admin, user, options, headers, style, minLevel);
}

/**
 * Same gate as requireCaller, for callers already resolved (add-in JWT,
 * forwarded userClient.auth.getUser, etc.).
 */
export async function requireCallerByUserId(
  admin: SupabaseClient,
  user: { id: string; email?: string },
  options: RequireCallerOptions,
  headers: Record<string, string> = defaultCorsHeaders,
  style: ErrorStyle = "error",
  minLevel: "full" | "limited" = "full",
): Promise<RequireCallerResult> {
  const allowed = await checkPermission(
    admin,
    user.id,
    options.featureKey,
    options.minLevel ?? minLevel,
  );

  if (!allowed && options.orAllow) {
    try {
      if (await options.orAllow({ userId: user.id, admin })) {
        return { ok: true, user, via: "fallback" };
      }
    } catch (err) {
      console.error("[requireCaller] orAllow failed", err);
    }
  }

  if (!allowed) {
    return {
      ok: false,
      response: jsonResponse(
        headers,
        style,
        403,
        "FORBIDDEN",
        options.forbiddenMessage ?? "Forbidden",
      ),
    };
  }

  return { ok: true, user, via: "permission" };
}

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
 * Two call shapes:
 *
 * ```ts
 * // Options form (orAllow, custom messages, injected admin client)
 * const caller = await requireCaller(req, admin, {
 *   featureKey: FeatureKeys.staffInternal,
 *   headers: corsHeaders(req),
 * });
 * if (!caller.ok) return caller.response;
 *
 * // Convenience form (builds the service-role client internally)
 * const caller = await requireCaller(req, "admin.team_users.manage", "full");
 * if (caller instanceof Response) return caller;
 * ```
 *
 * Bearer tokens are accepted only as exactly `Bearer <token>` (two parts).
 * Never base64-decode a JWT to read claims.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";
import {
  constantTimeEqual,
  parseBearerToken,
} from "./requireCaller-helpers.ts";

export {
  allowlistFromAppBaseUrl,
  constantTimeEqual,
  parseBearerToken,
} from "./requireCaller-helpers.ts";

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

export type PermissionMinLevel = "full" | "limited" | "edit" | "view";

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

export function corsHeadersFor(
  req: Request,
  extraAllowHeaders: string[] = [],
): Record<string, string> {
  const headers = { ...corsHeaders(req) };
  if (extraAllowHeaders.length > 0 && headers["Access-Control-Allow-Headers"]) {
    const existing = headers["Access-Control-Allow-Headers"]
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    headers["Access-Control-Allow-Headers"] = [...new Set([...existing, ...extraAllowHeaders])].join(", ");
  }
  return headers;
}

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

function convenienceJson(req: Request, status: number, body: unknown, extraAllowHeaders?: string[]): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req, extraAllowHeaders), "Content-Type": "application/json" },
  });
}

/** @deprecated Use parseBearerToken — same two-part Bearer rule. */
export function extractBearerToken(req: Request): string | null {
  return parseBearerToken(req.headers.get("Authorization") ?? req.headers.get("authorization"));
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
 * Same gate as requireCaller, for callers already resolved (add-in JWT,
 * forwarded userClient.auth.getUser, etc.).
 */
export async function requireCallerByUserId(
  admin: SupabaseClient,
  user: { id: string; email?: string },
  options: RequireCallerOptions,
  headers: Record<string, string> = {},
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

async function requireCallerWithOptions(
  req: Request,
  admin: SupabaseClient,
  options: RequireCallerOptions,
): Promise<RequireCallerResult> {
  const style = options.errorStyle ?? "error";
  const headers = options.headers ?? corsHeaders(req);
  const token = parseBearerToken(
    req.headers.get("Authorization") ?? req.headers.get("authorization"),
  );
  if (!token) {
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

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData?.user) {
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

  return requireCallerByUserId(
    admin,
    { id: callerData.user.id, email: callerData.user.email },
    options,
    headers,
    style,
    options.minLevel ?? "full",
  );
}

async function requireCallerConvenience(
  req: Request,
  featureKey: FeatureKey,
  minLevel: PermissionMinLevel = "full",
): Promise<{ userId: string } | Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return convenienceJson(req, 500, { error: "Server misconfigured" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const gated = await requireCallerWithOptions(req, admin, {
    featureKey,
    minLevel: minLevel === "edit" || minLevel === "view" || minLevel === "limited"
      ? "limited"
      : "full",
  });
  if (!gated.ok) return gated.response;
  return { userId: gated.user.id };
}

export async function requireCaller(
  req: Request,
  featureKey: FeatureKey,
  minLevel?: PermissionMinLevel,
): Promise<{ userId: string } | Response>;
export async function requireCaller(
  req: Request,
  admin: SupabaseClient,
  options: RequireCallerOptions,
): Promise<RequireCallerResult>;
export async function requireCaller(
  req: Request,
  adminOrFeatureKey: SupabaseClient | FeatureKey,
  optionsOrMinLevel?: RequireCallerOptions | PermissionMinLevel,
): Promise<RequireCallerResult | { userId: string } | Response> {
  if (typeof adminOrFeatureKey === "string") {
    return requireCallerConvenience(
      req,
      adminOrFeatureKey,
      typeof optionsOrMinLevel === "string" ? optionsOrMinLevel : "full",
    );
  }
  return requireCallerWithOptions(
    req,
    adminOrFeatureKey,
    optionsOrMinLevel as RequireCallerOptions,
  );
}

/**
 * Machine-to-machine gate: constant-time compare of a request header against
 * a Deno.env secret. Rejects when the secret is unset or the header is missing
 * or mismatched. Never logs the secret or the provided value.
 */
export function requireSharedSecret(
  req: Request,
  envKey: string,
  headerName = "x-worker-secret",
  extraAllowHeaders: string[] = [],
): { ok: true } | Response {
  const expected = Deno.env.get(envKey) ?? "";
  const provided = req.headers.get(headerName) ?? "";
  if (!expected || !constantTimeEqual(provided, expected)) {
    return convenienceJson(req, 401, { error: "Unauthorized" }, extraAllowHeaders);
  }
  return { ok: true };
}

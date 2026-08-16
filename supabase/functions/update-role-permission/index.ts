import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCaller, FeatureKeys } from "../_shared/requireCaller.ts";

type Permission = "full" | "limited" | "owner_only" | "none";
const VALID_PERMISSIONS: Permission[] = ["full", "limited", "owner_only", "none"];

interface Body {
  feature_key?: string;
  role?: string;
  new_permission?: Permission;
  reason?: string;
}

function json(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function err(status: number, code: string, detail?: string) {
  return json(req, status, { ok: false, code, ...(detail ? { detail } : {}) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const caller = await requireCaller(req, supabase, {
      featureKey: FeatureKeys.adminPermissions,
      headers: corsHeaders(req),
      errorStyle: "ok-code",
      unauthorizedMessage: "Missing bearer token",
      forbiddenMessage: "Super Admin (Vivacity internal) required",
    });
    if (!caller.ok) return caller.response;
    const callerId = caller.user.id;

    // 3. Parse + validate body
    let body: Body;
    try {
      body = await req.json();
    } catch {
      return err(400, "INVALID_JSON", "Request body must be valid JSON");
    }

    const { feature_key, role, new_permission, reason } = body;
    const missing: string[] = [];
    if (!feature_key) missing.push("feature_key");
    if (!role) missing.push("role");
    if (!new_permission) missing.push("new_permission");
    if (missing.length) {
      return err(400, "MISSING_FIELDS", `Missing: ${missing.join(", ")}`);
    }

    if (!VALID_PERMISSIONS.includes(new_permission as Permission)) {
      return err(
        400,
        "INVALID_PERMISSION",
        `new_permission must be one of: ${VALID_PERMISSIONS.join(", ")}`,
      );
    }

    // 4. Hard guard: cannot restrict Super Admin
    if (role === "Super Admin" && new_permission !== "full") {
      return err(
        400,
        "CANNOT_RESTRICT_SUPER_ADMIN",
        "Super Admin role must always have 'full' permission",
      );
    }

    // 5. Validate role dynamically via dd_unicorn_roles
    const { data: roleRow, error: roleErr } = await supabase
      .from("dd_unicorn_roles")
      .select("value")
      .eq("value", role!)
      .eq("is_active", true)
      .maybeSingle();
    if (roleErr) {
      return err(500, "ROLE_LOOKUP_FAILED", roleErr.message);
    }
    if (!roleRow) {
      return err(400, "INVALID_ROLE", `Role '${role}' is not a valid active role`);
    }

    // 6. Validate feature_key
    const { data: featureRow, error: featureErr } = await supabase
      .from("permission_features")
      .select("feature_key")
      .eq("feature_key", feature_key!)
      .eq("is_active", true)
      .maybeSingle();
    if (featureErr) {
      return err(500, "FEATURE_LOOKUP_FAILED", featureErr.message);
    }
    if (!featureRow) {
      return err(404, "FEATURE_NOT_FOUND", `Feature '${feature_key}' not found or inactive`);
    }

    // 7. Read current level
    const { data: existing, error: existingErr } = await supabase
      .from("role_permissions")
      .select("level")
      .eq("feature_key", feature_key!)
      .eq("role", role!)
      .maybeSingle();
    if (existingErr) {
      return err(500, "READ_CURRENT_FAILED", existingErr.message);
    }
    const old_permission: Permission | null = (existing?.level as Permission) ?? null;

    // 8. Upsert role_permissions (DB column is `level`)
    const { error: upsertErr } = await supabase
      .from("role_permissions")
      .upsert(
        {
          feature_key,
          role,
          level: new_permission,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "feature_key,role" },
      );
    if (upsertErr) {
      return err(500, "UPSERT_FAILED", upsertErr.message);
    }

    // 9. Audit log to permission_change_log (generic audit schema:
    //    entity / entity_id / action / before / after / actor_uuid / reason)
    const { error: logErr } = await supabase
      .from("permission_change_log")
      .insert({
        entity: "role_permissions",
        entity_id: `${feature_key}::${role}`,
        action: old_permission === null ? "insert" : "update",
        before: old_permission === null ? null : { feature_key, role, level: old_permission },
        after: { feature_key, role, level: new_permission },
        actor_uuid: callerId,
        reason: reason ?? null,
      });
    if (logErr) {
      console.error("permission_change_log insert failed:", logErr);
    }

    return json(req, 200, {
      ok: true,
      feature_key,
      role,
      old_permission,
      new_permission,
    });
  } catch (e) {
    console.error("update-role-permission unhandled error:", e);
    return err(500, "INTERNAL_ERROR", (e as Error)?.message ?? String(e));
  }
});

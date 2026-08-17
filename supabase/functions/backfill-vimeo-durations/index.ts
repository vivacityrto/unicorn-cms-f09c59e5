import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_APP_ORIGIN = "https://unicorn-cms.au";
const MAX_BATCH_SIZE = 200;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const appOrigin = new URL(Deno.env.get("APP_BASE_URL") ?? DEFAULT_APP_ORIGIN).origin;
  const allowed = new Set([appOrigin, DEFAULT_APP_ORIGIN, "https://www.unicorn-cms.au", "http://localhost:8080", "http://127.0.0.1:8080"]);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin && allowed.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function bearerToken(req: Request): string | null {
  const [scheme, token, ...extra] = (req.headers.get("Authorization") ?? "").trim().split(/\s+/);
  return scheme?.toLowerCase() === "bearer" && token && extra.length === 0 ? token : null;
}

function vimeoId(url: string | null): string | null {
  return url?.match(/vimeo[.]com[/](?:video[/])?([0-9]+)/)?.[1] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const token = bearerToken(req);
  if (!token) return json(req, { error: "Authentication required" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json(req, { error: "Invalid or expired token" }, 401);
  const { data: profile } = await supabase.from("users").select("unicorn_role, state").eq("user_uuid", user.id).maybeSingle();
  if (profile?.unicorn_role !== "Super Admin" || profile.state === "inactive" || profile.state === "suspended") {
    return json(req, { error: "Super Admin access required" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const requestedBatchSize = Number(body?.batchSize);
  const batchSize = Number.isInteger(requestedBatchSize) ? Math.min(Math.max(requestedBatchSize, 1), MAX_BATCH_SIZE) : MAX_BATCH_SIZE;
  const vimeoToken = Deno.env.get("VIMEO_ACCESS_TOKEN");
  if (!vimeoToken) return json(req, { error: "Vimeo integration is not configured" }, 503);

  const { data: videos, error: videosError } = await supabase
    .from("training_videos")
    .select("id, vimeo_url")
    .is("duration_seconds", null)
    .limit(batchSize);
  if (videosError) return json(req, { error: "Could not load videos" }, 500);

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  for (const video of videos ?? []) {
    const id = vimeoId(video.vimeo_url);
    if (!id) { skipped++; continue; }
    try {
      const response = await fetch(`https://api.vimeo.com/videos/${id}`, {
        headers: { Authorization: `Bearer ${vimeoToken}`, Accept: "application/vnd.vimeo.*+json;version=3.4" },
      });
      if (!response.ok) { errors++; continue; }
      const payload = await response.json();
      if (!Number.isFinite(payload?.duration) || payload.duration < 0) { skipped++; continue; }
      const { error } = await supabase.from("training_videos").update({ duration_seconds: Math.round(payload.duration) }).eq("id", video.id);
      if (error) errors++; else updated++;
    } catch { errors++; }
  }

  const { count } = await supabase.from("training_videos").select("id", { count: "exact", head: true }).is("duration_seconds", null);
  return json(req, { updated, skipped, errors, remaining_null: count ?? 0 });
});

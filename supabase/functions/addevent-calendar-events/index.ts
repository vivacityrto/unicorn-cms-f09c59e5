/**
 * addevent-calendar-events
 *
 * Returns the upcoming events from Vivacity's public AddEvent calendar so the
 * client portal / staff / Academy calendar pages can offer a "Download calendar
 * (PDF)" button. The calendar is embedded from addevent.com in a cross-origin
 * iframe, so the browser cannot read its events; this function reads the
 * calendar's public landing page server-side instead and parses it.
 *
 * Reads the public HTML, not the AddEvent API (no API key is available), so
 * the parser is strict and this function fails loudly rather than returning an
 * empty or guessed result. See _shared/addevent-calendar-parser.ts.
 *
 * Auth: any signed-in staff member (`staff.internal`) or any user with a
 * tenant_users row (client portal users). The upstream URL is a fixed constant;
 * nothing from the request ever reaches the outbound fetch.
 *
 * Meeting join links on the page are never returned.
 *
 * Responses:
 *   200 { events, skipped, fetched_at }
 *   502 { error, code }  code: parse_empty | parse_unexpected_format | upstream_unavailable
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { FeatureKeys, requireCaller } from "../_shared/requireCaller.ts";
import {
  AddEventParseError,
  parseAddEventCalendarHtml,
  type ParseResult,
} from "../_shared/addevent-calendar-parser.ts";

const ADDEVENT_CALENDAR_URL = "https://www.addevent.com/calendar/DE347781";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CachedResult {
  fetchedAt: number;
  result: ParseResult;
}

// Per-instance cache so repeated clicks do not hit AddEvent every time.
let cache: CachedResult | null = null;

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

async function fetchCalendarHtml(): Promise<string> {
  const res = await fetch(ADDEVENT_CALENDAR_URL, {
    headers: {
      Accept: "text/html",
      "User-Agent": "UnicornCMS/1.0 (+https://unicorn-cms.au)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`AddEvent responded with HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_HTML_BYTES) throw new Error("AddEvent response was larger than expected");
  const html = await res.text();
  if (html.length > MAX_HTML_BYTES) throw new Error("AddEvent response was larger than expected");
  return html;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json(req, 405, { error: "Method not allowed" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const caller = await requireCaller(req, admin, {
    featureKey: FeatureKeys.staffInternal,
    headers: corsHeaders(req),
    unauthorizedMessage: "Unauthorized",
    forbiddenMessage: "Forbidden",
    // Client portal users: any active tenant membership.
    orAllow: async ({ userId, admin: db }) => {
      const { data } = await db
        .from("tenant_users")
        .select("id")
        .eq("user_id", userId)
        .limit(1);
      return !!data && data.length > 0;
    },
  });
  if (!caller.ok) return caller.response;

  try {
    const now = Date.now();
    if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
      const html = await fetchCalendarHtml();
      cache = { fetchedAt: now, result: parseAddEventCalendarHtml(html, new Date(now)) };
    }
    return json(req, 200, {
      events: cache.result.events,
      skipped: cache.result.skipped,
      fetched_at: new Date(cache.fetchedAt).toISOString(),
    });
  } catch (error) {
    if (error instanceof AddEventParseError) {
      console.error("[addevent-calendar-events] parse failure:", error.code, error.message);
      return json(req, 502, {
        error: "The events calendar could not be read right now. Please try again later or contact Vivacity.",
        code: error.code,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[addevent-calendar-events] upstream failure:", message);
    return json(req, 502, {
      error: "The events calendar is temporarily unavailable. Please try again in a few minutes.",
      code: "upstream_unavailable",
    });
  }
});

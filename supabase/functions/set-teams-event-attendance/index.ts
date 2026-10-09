/**
 * set-teams-event-attendance
 *
 * Records, by hand, whether ONE person attended a Teams webinar that was
 * registered through Unicorn (the Events registry in the Contact Directory).
 *
 * The browser sends only an event id, one directory key (`user:12`,
 * `contact:5`) and a boolean. The event must already exist in Unicorn's
 * registration batches. The person is re-resolved server-side: if they hold a
 * registration row for the event their stored identity is used, otherwise
 * they are looked up in the directory and recorded as a walk-in (attended but
 * never registered through Unicorn). `walk_in` is decided here, never trusted
 * from the browser.
 *
 * POST { event_id: string, member_key: string, attended: boolean }
 * 200  { attendance: { member_key, attended, walk_in } }
 */
import { corsHeadersFor, requireCaller } from "../_shared/requireCaller.ts";
import {
  createAdminClient,
  errorResponse,
  jsonResponse,
  parseEventId,
  teamsEventsCallerOptions,
  writeAudit,
} from "../_shared/teams-events/server.ts";
import { loadMembersByKeys } from "../_shared/teams-events/group-resolution.ts";
import { parseMemberKey } from "../_shared/teams-events/membership.ts";
import { normaliseEmail } from "../_shared/teams-events/emails.ts";

const AUDIT_ACTION = "teams_event_attendance.marked";

interface Identity {
  tenantId: number;
  tenantUserId: number | null;
  tenantContactId: number | null;
  firstName: string | null;
  lastName: string | null;
  normalisedEmail: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return errorResponse(req, 405, "method_not_allowed", "Method not allowed");

  const admin = createAdminClient();
  if (!admin) return errorResponse(req, 500, "server_misconfigured", "Server misconfigured");

  const caller = await requireCaller(req, admin, teamsEventsCallerOptions(req));
  if (!caller.ok) return caller.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const eventId = parseEventId(body?.event_id);
  const memberKey = typeof body?.member_key === "string" ? body.member_key : "";
  const parsedKey = parseMemberKey(memberKey);
  if (!eventId || !parsedKey || typeof body?.attended !== "boolean") {
    return errorResponse(
      req,
      400,
      "invalid_request",
      "event_id, member_key (user:<id> / contact:<id>) and attended (true/false) are required",
    );
  }
  const attended = body.attended;

  // Only events registered through Unicorn have a registry entry.
  const { data: batch, error: batchError } = await admin
    .from("teams_event_registration_batches")
    .select("id")
    .eq("event_type", "webinar")
    .eq("graph_event_id", eventId)
    .limit(1)
    .maybeSingle();
  if (batchError) return errorResponse(req, 500, "event_lookup_failed", "Could not check the event.");
  if (!batch) return errorResponse(req, 404, "event_not_found", "That event has no registrations in Unicorn.");

  const sourceColumn = parsedKey.memberType === "user" ? "tenant_user_id" : "tenant_contact_id";

  // 1. Someone with a registration row for this event keeps the identity stored there.
  const { data: itemRows, error: itemError } = await admin
    .from("teams_event_registration_items")
    .select("tenant_id, tenant_user_id, tenant_contact_id, first_name, last_name, normalised_email, result_status")
    .eq("event_type", "webinar")
    .eq("graph_event_id", eventId)
    .eq(sourceColumn, parsedKey.memberId)
    .in("result_status", ["registered", "invited", "cancelled"])
    .not("normalised_email", "is", null)
    .limit(5);
  if (itemError) return errorResponse(req, 500, "person_lookup_failed", "Could not look the person up.");
  const items = (itemRows ?? []) as Array<{
    tenant_id: number;
    tenant_user_id: number | null;
    tenant_contact_id: number | null;
    first_name: string | null;
    last_name: string | null;
    normalised_email: string;
    result_status: string;
  }>;
  const live = items.find((i) => i.result_status === "registered" || i.result_status === "invited");
  const known = live ?? items[0];

  let identity: Identity | null = known
    ? {
      tenantId: known.tenant_id,
      tenantUserId: known.tenant_user_id,
      tenantContactId: known.tenant_contact_id,
      firstName: known.first_name,
      lastName: known.last_name,
      normalisedEmail: known.normalised_email,
    }
    : null;

  // 2. Otherwise resolve them from the directory (a walk-in).
  if (!identity) {
    const loaded = await loadMembersByKeys(admin, [memberKey]);
    if (!loaded.ok) return errorResponse(req, 500, "person_lookup_failed", "Could not look the person up.");
    const person = loaded.members[0];
    if (!person) return errorResponse(req, 404, "person_not_found", "That person is no longer in the directory.");
    const email = normaliseEmail(person.email);
    if (!email) {
      return errorResponse(req, 422, "no_email", "That person has no valid email on file, so attendance cannot be recorded.");
    }
    identity = {
      tenantId: person.tenantId,
      tenantUserId: person.memberType === "user" ? person.memberId : null,
      tenantContactId: person.memberType === "contact" ? person.memberId : null,
      firstName: person.firstName,
      lastName: person.lastName,
      normalisedEmail: email,
    };
  }

  // A walk-in holds no live registration for this event under this email.
  const { count: liveCount, error: liveError } = await admin
    .from("teams_event_registration_items")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "webinar")
    .eq("graph_event_id", eventId)
    .eq("normalised_email", identity.normalisedEmail)
    .in("result_status", ["registered", "invited"]);
  if (liveError) return errorResponse(req, 500, "person_lookup_failed", "Could not look the person up.");
  const walkIn = (liveCount ?? 0) === 0;

  const { error: writeError } = await admin.from("teams_event_attendance").upsert(
    {
      event_type: "webinar",
      graph_event_id: eventId,
      normalised_email: identity.normalisedEmail,
      tenant_id: identity.tenantId || null,
      tenant_user_id: identity.tenantUserId,
      tenant_contact_id: identity.tenantContactId,
      first_name: identity.firstName,
      last_name: identity.lastName,
      attended,
      walk_in: walkIn,
      marked_by_user_id: caller.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_type,graph_event_id,normalised_email" },
  );
  if (writeError) return errorResponse(req, 500, "attendance_write_failed", "Could not save attendance.");

  await writeAudit(admin, {
    action: AUDIT_ACTION,
    actorUserId: caller.user.id,
    batchId: eventId,
    entityType: "teams_event",
    // Ids and flags only: who they are stays in the secured attendance table.
    details: { event_type: "webinar", graph_event_id: eventId, member_key: memberKey, attended, walk_in: walkIn },
  });

  return jsonResponse(req, 200, { attendance: { member_key: memberKey, attended, walk_in: walkIn } });
});

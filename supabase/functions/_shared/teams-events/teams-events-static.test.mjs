/**
 * Static source-pattern guards for the Teams event registration feature.
 *
 * Deno isn't available locally, so these assert the security- and
 * correctness-critical shape of the Edge Functions and the migration directly
 * from source — in the same style as the other *.test.mjs gates in this
 * directory. Behavioural logic is covered by teams-events.node-test.ts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const functionsDir = join(here, "..", "..");
const read = (...parts) => readFileSync(join(functionsDir, ...parts), "utf8");

const FUNCTIONS = [
  "list-teams-events",
  "preview-teams-event-group",
  "register-teams-webinar-group",
  "get-teams-event-batch",
  "retry-teams-event-failures",
  "cancel-teams-event-registrations",
  "set-teams-event-attendance",
];

describe("every Teams event function is gated server-side", () => {
  for (const name of FUNCTIONS) {
    test(`${name} calls requireCaller with the teams_events permission before any work`, () => {
      const src = read(name, "index.ts");
      assert.match(src, /requireCaller\(req, admin, teamsEventsCallerOptions\(req\)\)/);
      assert.match(src, /if \(!caller\.ok\) return caller\.response;/);
      // The gate must come before the first Graph or database read.
      const gate = src.indexOf("requireCaller(req, admin");
      for (const work of ["createGraphFromEnv(", "admin.from(", "resolveGroupForEvent("]) {
        const at = src.indexOf(work);
        if (at !== -1) assert.ok(gate < at, `${work} runs before the auth gate in ${name}`);
      }
    });

    test(`${name} never logs tokens, secrets or request bodies`, () => {
      const src = read(name, "index.ts");
      assert.doesNotMatch(src, /console\.(log|info|debug)\(/);
      assert.doesNotMatch(src, /console\.\w+\([^)]*(token|secret|authorization|body)/i);
    });
  }

  test("the permission key is the one the migration seeds", () => {
    assert.match(read("_shared", "requireCaller.ts"), /teamsEventsManageRegistrations: "teams_events\.manage_registrations"/);
    assert.match(read("_shared", "teams-events", "server.ts"), /FeatureKeys\.teamsEventsManageRegistrations/);
  });
});

describe("register-teams-webinar-group", () => {
  const src = read("register-teams-webinar-group", "index.ts");

  test("requires and verifies a preview token bound to the caller, event and group", () => {
    assert.match(src, /verifyPreviewToken\(/);
    assert.match(src, /uid: caller\.user\.id/);
    assert.match(src, /preview_expired/);
  });

  test("re-resolves the group server-side and rejects a changed membership", () => {
    assert.match(src, /resolveGroupForEvent\(admin/);
    assert.match(src, /fingerprint !== verified\.claims\.membershipHash/);
    assert.match(src, /memberCount !== verified\.claims\.memberCount/);
    assert.match(src, /membership_changed/);
  });

  test("takes only ids from the browser — never member lists, emails or counts", () => {
    assert.doesNotMatch(src, /body\??\.(members|member_ids|emails|contacts|count|total)/);
    assert.match(src, /body\?\.event_id/);
    assert.match(src, /body\?\.group_id/);
  });

  test("event-only additions and skips arrive as validated keys only and are re-resolved server-side", () => {
    assert.match(src, /parseMemberKeys\(body\?\.extra_member_keys, MAX_EVENT_EXTRAS\)/);
    assert.match(src, /parseMemberKeys\(body\?\.skipped_member_keys, MAX_EVENT_SKIPS\)/);
    assert.match(src, /extraKeys: extras\.keys/);
    assert.match(src, /skippedKeys: skips\.keys/);
    assert.doesNotMatch(src, /body\??\.(extras|skipped|extra_members|skipped_members)\b/);
  });

  test("records where each person came from and audits counts only", () => {
    assert.match(src, /inclusion: m\.member\.inclusion \?\? "group"/);
    assert.match(src, /added_for_event_count/);
    assert.match(src, /skipped_for_event_count/);
  });

  test("stops before processing when the event has required registration questions", () => {
    assert.match(src, /listRegistrationQuestions\(/);
    assert.match(src, /required_questions/);
  });

  test("relies on the live-lock unique index and releases only stale locks", () => {
    assert.match(src, /UNIQUE_VIOLATION/);
    assert.match(src, /releaseStaleLock\(/);
    assert.match(src, /batch_in_progress/);
  });

  test("is rate limited and returns 202 after persisting the batch", () => {
    assert.match(src, /isRateLimited\(admin/);
    assert.match(src, /jsonResponse\(req, 202,/);
    assert.match(src, /runInBackground\(runBatch\(/);
  });

  test("audits start with counts and ids only (no contact list, no emails)", () => {
    assert.match(src, /action: "teams_event_registration\.batch_started"/);
    assert.doesNotMatch(src, /details:[^}]*email/);
  });
});

describe("retry-teams-event-failures", () => {
  const src = read("retry-teams-event-failures", "index.ts");

  test("never retries invalid-contact failures and only touches failed rows", () => {
    assert.match(src, /NON_RETRYABLE_ITEM_CATEGORIES/);
    assert.match(src, /\.eq\("result_status", "failed"\)/);
    assert.match(src, /\.not\("error_code", "in"/);
  });

  test("claims the batch atomically and refuses a fresh live batch", () => {
    assert.match(src, /\.in\("status", SETTLED_STATUSES\)/);
    assert.match(src, /BATCH_STALE_MS/);
    assert.match(src, /batch_in_progress/);
  });
});

describe("cancel-teams-event-registrations", () => {
  const src = read("cancel-teams-event-registrations", "index.ts");

  test("takes only an event id and validated directory keys, and caps the batch", () => {
    assert.match(src, /parseEventId\(body\?\.event_id\)/);
    assert.match(src, /parseMemberKeys\(body\?\.member_keys, MAX_CANCEL_PEOPLE\)/);
    assert.match(src, /MAX_CANCEL_PEOPLE = 50/);
    assert.doesNotMatch(src, /body\??\.(emails?|registration_ids?|registrations)\b/);
  });

  test("resolves people from the database, then matches and cancels by email", () => {
    assert.match(src, /loadMembersByKeys\(admin, people\.keys\)/);
    assert.match(src, /planCancellations\(/);
    assert.match(src, /cancelRegistration\(eventId, registrationId\)/);
  });

  test("one refusal never stops the others, and local rows are only marked cancelled for settled people", () => {
    assert.match(src, /mapWithLimit\(plan, CANCEL_CONCURRENCY/);
    assert.match(src, /result_status: "cancelled"/);
    assert.match(src, /\.in\("result_status", \["registered", "invited"\]\)/);
    assert.match(src, /o\.status === "cancelled" \|\| o\.status === "not_registered"/);
  });

  test("is rate limited and audits counts only", () => {
    assert.match(src, /RATE_LIMIT_REQUESTS/);
    assert.match(src, /rate_limited/);
    assert.match(src, /cancelled_count: counts\.cancelled/);
    assert.doesNotMatch(src, /details:[^}]*email/);
  });
});

describe("migration 20261009030000_teams_event_items_cancelled_status", () => {
  const sql = readFileSync(
    join(functionsDir, "..", "migrations", "20261009030000_teams_event_items_cancelled_status.sql"),
    "utf8",
  );

  test("only widens the status check to add 'cancelled'", () => {
    const code = sql.replace(/--.*$/gm, "");
    assert.match(code, /DROP CONSTRAINT teams_event_items_status_check/);
    assert.match(code, /'excluded', 'duplicate', 'failed', 'cancelled'/);
    assert.doesNotMatch(code, /\b(INSERT|UPDATE|DELETE|DROP TABLE|TRUNCATE)\b/i);
  });

  test("keeps cancelled rows out of the success-uniqueness index so people can register again", () => {
    const base = readFileSync(
      join(functionsDir, "..", "migrations", "20261008010000_teams_event_registration_foundation.sql"),
      "utf8",
    );
    assert.match(base, /uq_teams_event_items_event_email_success[\s\S]*WHERE result_status IN \('registered', 'invited'\)/);
  });

  test("documents rollback", () => {
    assert.match(sql, /ROLLBACK/);
  });
});

describe("preview-teams-event-group", () => {
  const src = read("preview-teams-event-group", "index.ts");
  test("writes nothing — preview is read-only", () => {
    assert.doesNotMatch(src, /\.(insert|update|upsert|delete)\(/);
  });
  test("validates event-only keys the same way as register and reports skips separately", () => {
    assert.match(src, /parseMemberKeys\(body\?\.extra_member_keys, MAX_EVENT_EXTRAS\)/);
    assert.match(src, /parseMemberKeys\(body\?\.skipped_member_keys, MAX_EVENT_SKIPS\)/);
    assert.match(src, /skipped: skipped\.length/);
  });
  test("blocks on mandatory questions and mints a signed token", () => {
    assert.match(src, /questionsCheck/);
    assert.match(src, /signPreviewToken\(/);
  });
});

describe("Graph client hygiene", () => {
  const client = read("_shared", "teams-events", "graph-client.ts");
  test("credentials come only from credentials.ts (reused MICROSOFT_* app, optional TEAMS_EVENTS_* override)", () => {
    const server = read("_shared", "teams-events", "server.ts");
    const credentials = read("_shared", "teams-events", "credentials.ts");
    assert.match(server, /resolveTeamsGraphCredentials\(/);
    assert.doesNotMatch(client + server, /MICROSOFT_(CLIENT_ID|CLIENT_SECRET|TENANT_ID)|TEAMS_EVENTS_(CLIENT|TENANT)/);
    assert.match(credentials, /MICROSOFT_TENANT_ID/);
    assert.match(credentials, /TEAMS_EVENTS_CLIENT_SECRET/);
  });
  test("never logs", () => {
    assert.doesNotMatch(client, /console\./);
  });
});

describe("migration 20261008010000_teams_event_registration_foundation", () => {
  const sql = readFileSync(
    join(functionsDir, "..", "migrations", "20261008010000_teams_event_registration_foundation.sql"),
    "utf8",
  );

  test("seeds the RBAC feature: Super Admin full, everyone else none", () => {
    assert.match(sql, /'teams_events\.manage_registrations'/);
    assert.match(sql, /\('teams_events\.manage_registrations', 'Super Admin', 'full'\)/);
    for (const role of ["Team Leader", "Integrator", "BGT", "CSC", "CET"]) {
      assert.match(sql, new RegExp(`\\('teams_events\\.manage_registrations', '${role}', 'none'\\)`));
    }
  });

  test("enables RLS on both tables with SELECT-only, permission-gated policies", () => {
    assert.match(sql, /ALTER TABLE public\.teams_event_registration_batches ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /ALTER TABLE public\.teams_event_registration_items ENABLE ROW LEVEL SECURITY/);
    assert.equal((sql.match(/CREATE POLICY/g) ?? []).length, 2);
    assert.doesNotMatch(sql, /FOR (INSERT|UPDATE|DELETE|ALL)/);
    assert.match(sql, /check_permission\(\(SELECT auth\.uid\(\)\), 'teams_events\.manage_registrations', 'full'\)/);
  });

  test("browser roles are read-only at the privilege level too", () => {
    assert.match(sql, /REVOKE ALL ON public\.teams_event_registration_batches FROM anon, authenticated/);
    assert.match(sql, /REVOKE ALL ON public\.teams_event_registration_items FROM anon, authenticated/);
    assert.match(sql, /GRANT SELECT ON public\.teams_event_registration_items TO authenticated/);
    assert.doesNotMatch(sql, /GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated/);
  });

  test("enforces idempotency and the live lock in the database", () => {
    assert.match(sql, /uq_teams_event_batches_live_lock[\s\S]*WHERE status IN \('queued', 'processing'\)/);
    assert.match(sql, /uq_teams_event_items_event_email_success[\s\S]*\(event_type, graph_event_id, normalised_email\)[\s\S]*'registered', 'invited'/);
    assert.match(sql, /uq_teams_event_items_batch_email/);
  });

  test("never stores a join URL in plaintext", () => {
    assert.match(sql, /graph_join_url_encrypted/);
    assert.doesNotMatch(sql, /join_url\s+text/i);
  });

  test("documents rollback", () => {
    assert.match(sql, /ROLLBACK:/);
  });
});

describe("migration 20261009010000_teams_events_grant_integrator_bgt", () => {
  const sql = readFileSync(
    join(functionsDir, "..", "migrations", "20261009010000_teams_events_grant_integrator_bgt.sql"),
    "utf8",
  );

  test("lifts only Integrator and BGT, only from 'none', only for the Teams events feature", () => {
    assert.match(sql, /UPDATE public\.role_permissions\s+SET level = 'full'/);
    assert.match(sql, /feature_key = 'teams_events\.manage_registrations'/);
    assert.match(sql, /role IN \('Integrator', 'BGT'\)/);
    assert.match(sql, /AND level = 'none'/);
    for (const untouched of ["Super Admin", "Team Leader", "CSC", "CET"]) {
      assert.doesNotMatch(sql.replace(/--.*$/gm, ""), new RegExp(untouched));
    }
  });

  test("never inserts or deletes and documents rollback", () => {
    const code = sql.replace(/--.*$/gm, "");
    assert.doesNotMatch(code, /\b(INSERT|DELETE|DROP|ALTER)\b/i);
    assert.match(sql, /ROLLBACK:/);
  });
});

describe("set-teams-event-attendance", () => {
  const src = read("set-teams-event-attendance", "index.ts");

  test("takes only an event id, one validated directory key and a strict boolean", () => {
    assert.match(src, /parseEventId\(body\?\.event_id\)/);
    assert.match(src, /parseMemberKey\(memberKey\)/);
    assert.match(src, /typeof body\?\.attended !== "boolean"/);
    assert.doesNotMatch(src, /body\??\.(walk_in|email|emails|first_name|last_name)/);
  });

  test("only events registered through Unicorn, and walk-in is decided server-side", () => {
    assert.match(src, /teams_event_registration_batches/);
    assert.match(src, /event_not_found/);
    assert.match(src, /const walkIn = \(liveCount \?\? 0\) === 0;/);
    assert.match(src, /\.in\("result_status", \["registered", "invited"\]\)/);
  });

  test("upserts one row per event and person, and audits ids and flags only", () => {
    assert.match(src, /onConflict: "event_type,graph_event_id,normalised_email"/);
    assert.match(src, /teams_event_attendance\.marked/);
    assert.doesNotMatch(src, /details: \{[^}]*(email|first_name|last_name)/);
  });
});

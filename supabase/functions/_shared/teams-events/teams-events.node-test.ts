import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { normaliseEmail } from "./emails.ts";
import { classifyMembers, membershipFingerprint, type ResolvedMember } from "./membership.ts";
import { signPreviewToken, verifyPreviewToken, type PreviewClaims } from "./preview-token.ts";
import {
  computeWindow,
  graphDateTimeToUtc,
  selectUpcomingWebinars,
  type GraphWebinar,
} from "./event-window.ts";
import { classifyGraphError, sanitiseMessage } from "./graph-errors.ts";
import { createTeamsGraphClient, encodeGraphId } from "./graph-client.ts";
import { processItems, type ItemOutcome } from "./processor.ts";
import { countStatuses, deriveBatchStatus, toBatchTotals } from "./batch-status.ts";
import { resolveTeamsGraphCredentials } from "./credentials.ts";

// ── emails ───────────────────────────────────────────────────────────────
describe("normaliseEmail", () => {
  test("trims and lowercases", () => {
    assert.equal(normaliseEmail("  Amanda.Hardy@Example.COM "), "amanda.hardy@example.com");
  });
  test("rejects invalid, empty and non-string values", () => {
    for (const bad of ["", "   ", "no-at-sign", "a@b", "a b@c.com", null, undefined, 42, "a@b@c.com"]) {
      assert.equal(normaliseEmail(bad), null, String(bad));
    }
  });
});

// ── membership ───────────────────────────────────────────────────────────
const member = (over: Partial<ResolvedMember>): ResolvedMember => ({
  memberType: "user",
  memberId: 1,
  tenantId: 10,
  firstName: "Amanda",
  lastName: "Hardy",
  email: "amanda@example.com",
  sourceStatus: "active",
  ...over,
});

describe("classifyMembers", () => {
  test("reports eligible, inactive, invalid, missing name, missing record and duplicates", () => {
    const result = classifyMembers([
      member({ memberId: 1 }),
      member({ memberId: 2, email: "AMANDA@example.com " }), // duplicate (user)
      member({ memberType: "contact", memberId: 3, email: "amanda@example.com" }), // duplicate (contact)
      member({ memberId: 4, email: "b@example.com", sourceStatus: "disabled" }),
      member({ memberId: 5, email: "b@example.com", sourceStatus: "archived" }),
      member({ memberId: 6, email: "not-an-email" }),
      member({ memberId: 7, email: "c@example.com", lastName: null }),
      member({ memberId: 8, email: "d@example.com", firstName: "  " }),
      member({ memberId: 9, email: "e@example.com", sourceStatus: "missing" }),
      member({ memberId: 10, email: "f@example.com" }),
    ]);

    assert.deepEqual(result.counts, { total: 10, eligible: 2, excluded: 6, duplicate: 2 });
    const byId = (id: number, type = "user") =>
      result.members.find((m) => m.member.memberId === id && m.member.memberType === type)!;
    assert.equal(byId(1).kind, "eligible");
    assert.equal(byId(2).kind, "duplicate");
    assert.equal(byId(3, "contact").kind, "duplicate");
    assert.equal(byId(4).kind === "excluded" && byId(4).reason, "inactive");
    assert.equal(byId(5).kind === "excluded" && byId(5).reason, "inactive");
    assert.equal(byId(6).kind === "excluded" && byId(6).reason, "invalid_email");
    assert.equal(byId(7).kind === "excluded" && byId(7).reason, "missing_name");
    assert.equal(byId(8).kind === "excluded" && byId(8).reason, "missing_name");
    assert.equal(byId(9).kind === "excluded" && byId(9).reason, "missing_record");
    assert.equal(byId(10).kind, "eligible");
  });

  test("a user wins over a contact with the same email regardless of input order", () => {
    const result = classifyMembers([
      member({ memberType: "contact", memberId: 1, email: "x@example.com" }),
      member({ memberType: "user", memberId: 99, email: "x@example.com" }),
    ]);
    const kept = result.members.find((m) => m.kind === "eligible")!;
    assert.equal(kept.member.memberType, "user");
    const dup = result.members.find((m) => m.kind === "duplicate")!;
    assert.equal(dup.kind === "duplicate" && dup.duplicateOf, "user:99");
  });

  test("an excluded row never claims the email", () => {
    const result = classifyMembers([
      member({ memberId: 1, email: "x@example.com", sourceStatus: "disabled" }),
      member({ memberType: "contact", memberId: 2, email: "x@example.com" }),
    ]);
    assert.equal(result.counts.eligible, 1);
    assert.equal(result.counts.duplicate, 0);
  });

  test("fingerprint is order-independent and changes with membership", async () => {
    const a = await membershipFingerprint([
      { memberType: "user", memberId: 1 },
      { memberType: "contact", memberId: 2 },
    ]);
    const b = await membershipFingerprint([
      { memberType: "contact", memberId: 2 },
      { memberType: "user", memberId: 1 },
    ]);
    const c = await membershipFingerprint([{ memberType: "user", memberId: 1 }]);
    assert.equal(a, b);
    assert.notEqual(a, c);
  });
});

// ── preview token ────────────────────────────────────────────────────────
describe("preview token", () => {
  const claims: PreviewClaims = {
    uid: "user-1",
    eventType: "webinar",
    eventId: "evt@tenant",
    groupId: 7,
    memberCount: 184,
    membershipHash: "abc",
    exp: 2_000_000_000,
  };
  const expected = { uid: "user-1", eventType: "webinar" as const, eventId: "evt@tenant", groupId: 7 };
  const now = 1_900_000_000;

  test("round-trips", async () => {
    const token = await signPreviewToken(claims, "secret");
    const result = await verifyPreviewToken(token, "secret", expected, now);
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.claims.memberCount, 184);
  });

  test("rejects a different secret, tampered payload, expiry and mismatches", async () => {
    const token = await signPreviewToken(claims, "secret");
    assert.deepEqual(await verifyPreviewToken(token, "other", expected, now), { ok: false, reason: "bad_signature" });

    const [payload, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ ...claims, memberCount: 5 })).replace(/=+$/, "");
    assert.deepEqual(await verifyPreviewToken(`${forged}.${sig}`, "secret", expected, now), {
      ok: false,
      reason: "bad_signature",
    });
    assert.ok(payload.length > 0);

    assert.deepEqual(await verifyPreviewToken(token, "secret", expected, claims.exp + 1), {
      ok: false,
      reason: "expired",
    });
    for (const wrong of [
      { ...expected, uid: "user-2" },
      { ...expected, eventId: "other" },
      { ...expected, groupId: 8 },
      { ...expected, eventType: "meeting" as const },
    ]) {
      assert.deepEqual(await verifyPreviewToken(token, "secret", wrong, now), { ok: false, reason: "mismatch" });
    }
  });

  test("rejects malformed input", async () => {
    for (const bad of [undefined, null, "", "nodot", "a.b.c", "!!!.???"]) {
      const r = await verifyPreviewToken(bad, "secret", expected, now);
      assert.equal(r.ok, false);
    }
    assert.equal((await verifyPreviewToken("x.y", "", expected, now)).ok, false);
  });

  test("refuses to sign without a secret", async () => {
    await assert.rejects(() => signPreviewToken(claims, ""));
  });
});

// ── event window ─────────────────────────────────────────────────────────
describe("event window", () => {
  const now = new Date("2026-10-08T00:00:00.000Z");
  const webinar = (id: string, startUtc: string, over: Partial<GraphWebinar> = {}): GraphWebinar => ({
    id,
    status: "published",
    displayName: id,
    startDateTime: { dateTime: startUtc.replace("Z", ""), timeZone: "UTC" },
    endDateTime: { dateTime: startUtc.replace("Z", ""), timeZone: "UTC" },
    ...over,
  });

  test("converts AUS Eastern wall-clock time to UTC across DST", () => {
    // 20 Oct 2026, 10:00 AEDT (UTC+11) → 19 Oct 23:00 UTC
    const aedt = graphDateTimeToUtc({ dateTime: "2026-10-20T10:00:00.0000000", timeZone: "AUS Eastern Standard Time" });
    assert.equal(aedt?.utc.toISOString(), "2026-10-19T23:00:00.000Z");
    assert.equal(aedt?.assumed, false);
    // 20 Jul 2026, 10:00 AEST (UTC+10) → 00:00 UTC
    const aest = graphDateTimeToUtc({ dateTime: "2026-07-20T10:00:00", timeZone: "AUS Eastern Standard Time" });
    assert.equal(aest?.utc.toISOString(), "2026-07-20T00:00:00.000Z");
  });

  test("unknown zones are assumed UTC and flagged; junk is rejected", () => {
    const r = graphDateTimeToUtc({ dateTime: "2026-10-20T10:00:00", timeZone: "Mars Standard Time" });
    assert.equal(r?.utc.toISOString(), "2026-10-20T10:00:00.000Z");
    assert.equal(r?.assumed, true);
    assert.equal(graphDateTimeToUtc({ dateTime: "garbage" }), null);
    assert.equal(graphDateTimeToUtc(undefined), null);
  });

  test("window is now..now+14d inclusive; boundaries and outside excluded", () => {
    const events = selectUpcomingWebinars(
      [
        webinar("past", "2026-10-07T23:59:59Z"),
        webinar("now", "2026-10-08T00:00:00Z"),
        webinar("today", "2026-10-08T05:00:00Z"),
        webinar("day14-exact", "2026-10-22T00:00:00Z"),
        webinar("day14-plus", "2026-10-22T00:00:01Z"),
        webinar("far", "2027-01-01T00:00:00Z"),
      ],
      now,
    );
    assert.deepEqual(events.map((e) => e.id), ["now", "today", "day14-exact"]);
    const { from, to } = computeWindow(now);
    assert.equal(to.getTime() - from.getTime(), 14 * 24 * 3600 * 1000);
  });

  test("excludes draft, cancelled and unusable events, sorts ascending", () => {
    const events = selectUpcomingWebinars(
      [
        webinar("b", "2026-10-12T00:00:00Z"),
        webinar("draft", "2026-10-10T00:00:00Z", { status: "draft" }),
        webinar("cancelled", "2026-10-10T00:00:00Z", { status: "canceled" }),
        webinar("a", "2026-10-09T00:00:00Z"),
        { id: "", status: "published", startDateTime: { dateTime: "2026-10-09T00:00:00", timeZone: "UTC" } },
        { id: "nostart", status: "published" },
      ],
      now,
    );
    assert.deepEqual(events.map((e) => e.id), ["a", "b"]);
  });

  test("maps organiser details", () => {
    const [event] = selectUpcomingWebinars(
      [webinar("a", "2026-10-09T00:00:00Z", { createdBy: { user: { id: "u1", displayName: "Dave" } } })],
      now,
    );
    assert.equal(event.organiserId, "u1");
    assert.equal(event.organiserName, "Dave");
  });
});

// ── graph errors ─────────────────────────────────────────────────────────
describe("classifyGraphError", () => {
  const body = (code: string, message: string) => ({ error: { code, message } });
  test("maps statuses to the brief's categories", () => {
    assert.equal(classifyGraphError(429, null).category, "throttling");
    assert.equal(classifyGraphError(429, null).retryable, true);
    assert.equal(classifyGraphError(503, null).category, "temporary_failure");
    assert.equal(classifyGraphError(0, null).retryable, true);
    assert.equal(classifyGraphError(401, null).category, "auth_or_consent");
    assert.equal(classifyGraphError(401, null).retryable, false);
    assert.equal(
      classifyGraphError(403, body("Forbidden", "No application access policy found for this app")).category,
      "organiser_access_policy",
    );
    assert.equal(classifyGraphError(403, body("Forbidden", "Insufficient privileges")).category, "auth_or_consent");
    assert.equal(classifyGraphError(404, null).category, "event_unavailable");
    assert.equal(classifyGraphError(409, null).category, "duplicate");
    assert.equal(classifyGraphError(400, body("BadRequest", "Required question answers are missing")).category, "required_answers_missing");
    assert.equal(classifyGraphError(400, body("BadRequest", "Invalid email address")).category, "invalid_contact_data");
    assert.equal(classifyGraphError(400, body("BadRequest", "The webinar is closed")).category, "event_unavailable");
    assert.equal(classifyGraphError(418, null).category, "unknown");
  });

  test("never echoes the raw Graph message", () => {
    const e = classifyGraphError(400, body("BadRequest", "Invalid email bob@secret.example Bearer abc.def.ghi"));
    assert.ok(!e.message.includes("bob@secret.example"));
    assert.ok(!e.message.includes("Bearer"));
  });

  test("sanitiseMessage redacts credentials and caps length", () => {
    const dirty = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123 client_secret=hunter2&x=1";
    const clean = sanitiseMessage(dirty);
    assert.ok(!clean.includes("eyJhbGci"));
    assert.ok(!clean.includes("hunter2"));
    assert.equal(sanitiseMessage("x".repeat(1000)).length, 300);
    assert.equal(sanitiseMessage(undefined), "");
  });
});

// ── graph client (mocked Graph) ──────────────────────────────────────────
type Call = { url: string; method: string; headers: Record<string, string>; body: string | undefined };

function mockGraph(handler: (call: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body === undefined ? undefined : String(init.body),
    };
    calls.push(call);
    return handler(call, calls.length);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const tokenResponse = () =>
  new Response(JSON.stringify({ access_token: "tok-123", expires_in: 3600 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const isToken = (c: Call) => c.url.includes("login.microsoftonline.com");
const config = { tenantId: "tenant-1", clientId: "client-1", clientSecret: "s3cr3t-value" };

describe("createTeamsGraphClient", () => {
  test("lists webinars across pages and refuses off-Graph nextLinks", async () => {
    const { fetchImpl, calls } = mockGraph((c) => {
      if (isToken(c)) return tokenResponse();
      if (c.url.endsWith("/solutions/virtualEvents/webinars")) {
        return json(200, {
          value: [{ id: "a" }],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/solutions/virtualEvents/webinars?page=2",
        });
      }
      return json(200, { value: [{ id: "b" }], "@odata.nextLink": "https://evil.example/steal" });
    });
    const client = createTeamsGraphClient(config, { fetch: fetchImpl, sleep: async () => {} });
    const result = await client.listWebinars();
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && result.webinars.map((w) => w.id), ["a", "b"]);
    assert.ok(!calls.some((c) => c.url.includes("evil.example")));
    // token is requested once and reused
    assert.equal(calls.filter(isToken).length, 1);
    assert.equal(calls.find((c) => !isToken(c))!.headers.Authorization, "Bearer tok-123");
  });

  test("registers with the app-only payload and treats 204 as success without an id", async () => {
    const { fetchImpl, calls } = mockGraph((c) => (isToken(c) ? tokenResponse() : json(204, null)));
    const client = createTeamsGraphClient(config, { fetch: fetchImpl, sleep: async () => {} });
    const result = await client.registerWebinarAttendee("evt-1@tenant-1", {
      firstName: "Amanda",
      lastName: "Hardy",
      email: "amanda@example.com",
    });
    assert.deepEqual(result, { ok: true, registrationId: null, attempts: 1 });
    const post = calls.find((c) => c.method === "POST" && !isToken(c))!;
    assert.ok(post.url.endsWith("/webinars/evt-1@tenant-1/registrations"));
    assert.deepEqual(JSON.parse(post.body!), {
      firstName: "Amanda",
      lastName: "Hardy",
      email: "amanda@example.com",
      preferredTimezone: "AUS Eastern Standard Time",
      preferredLanguage: "en-AU",
    });
  });

  test("honours Retry-After on 429 then succeeds, reporting attempts", async () => {
    const sleeps: number[] = [];
    let posts = 0;
    const { fetchImpl } = mockGraph((c) => {
      if (isToken(c)) return tokenResponse();
      posts++;
      return posts === 1 ? json(429, {}, { "retry-after": "7" }) : json(204, null);
    });
    const client = createTeamsGraphClient(config, { fetch: fetchImpl, sleep: async (ms) => void sleeps.push(ms) });
    const result = await client.registerWebinarAttendee("e", { firstName: "A", lastName: "B", email: "a@b.co" });
    assert.deepEqual(sleeps, [7000]);
    assert.deepEqual(result, { ok: true, registrationId: null, attempts: 2 });
  });

  test("caps transient retries and uses exponential back-off without Retry-After", async () => {
    const sleeps: number[] = [];
    const { fetchImpl } = mockGraph((c) => (isToken(c) ? tokenResponse() : json(503, {})));
    const client = createTeamsGraphClient(config, { fetch: fetchImpl, sleep: async (ms) => void sleeps.push(ms) });
    const result = await client.registerWebinarAttendee("e", { firstName: "A", lastName: "B", email: "a@b.co" });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.category, "temporary_failure");
    assert.equal(result.attempts, 3);
    assert.deepEqual(sleeps, [1000, 2000]);
  });

  test("does not retry permanent errors", async () => {
    let posts = 0;
    const { fetchImpl } = mockGraph((c) => {
      if (isToken(c)) return tokenResponse();
      posts++;
      return json(403, { error: { code: "Forbidden", message: "No application access policy found for this app" } });
    });
    const client = createTeamsGraphClient(config, { fetch: fetchImpl, sleep: async () => {} });
    const result = await client.registerWebinarAttendee("e", { firstName: "A", lastName: "B", email: "a@b.co" });
    assert.equal(posts, 1);
    assert.equal(!result.ok && result.error.category, "organiser_access_policy");
    assert.equal(result.attempts, 1);
  });

  test("refreshes the token once on 401", async () => {
    let tokens = 0;
    let gets = 0;
    const { fetchImpl } = mockGraph((c) => {
      if (isToken(c)) {
        tokens++;
        return tokenResponse();
      }
      gets++;
      return gets === 1 ? json(401, {}) : json(200, { id: "evt" });
    });
    const client = createTeamsGraphClient(config, { fetch: fetchImpl, sleep: async () => {} });
    const result = await client.getWebinar("evt");
    assert.equal(result.ok, true);
    assert.equal(tokens, 2);
  });

  test("token failures surface an AADSTS code only — never the secret or description", async () => {
    const { fetchImpl } = mockGraph(() =>
      json(401, {
        error: "invalid_client",
        error_description: "AADSTS7000215: Invalid client secret provided. Trace ID: abc Correlation ID: def s3cr3t-value",
      })
    );
    const client = createTeamsGraphClient(config, { fetch: fetchImpl, sleep: async () => {} });
    const result = await client.listWebinars();
    assert.equal(result.ok, false);
    const serialised = JSON.stringify(result);
    assert.ok(serialised.includes("AADSTS7000215"));
    assert.ok(!serialised.includes("s3cr3t-value"));
    assert.ok(!serialised.includes("Trace ID"));
    assert.equal(!result.ok && result.error.category, "auth_or_consent");
  });

  test("network failure on token acquisition is retryable, not a credential error", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("network down");
    }) as typeof fetch;
    const client = createTeamsGraphClient(config, { fetch: fetchImpl, sleep: async () => {} });
    const result = await client.listWebinars();
    assert.equal(!result.ok && result.error.category, "temporary_failure");
    assert.equal(!result.ok && result.error.retryable, true);
  });

  test("question listing flags required questions", async () => {
    const { fetchImpl, calls } = mockGraph((c) =>
      isToken(c)
        ? tokenResponse()
        : json(200, {
          value: [
            { id: "1", displayName: "Company", isRequired: true },
            { id: "2", displayName: "Notes", isRequired: false },
          ],
        })
    );
    const client = createTeamsGraphClient(config, { fetch: fetchImpl, sleep: async () => {} });
    const result = await client.listRegistrationQuestions("evt@t");
    assert.deepEqual(result.ok && result.questions.map((q) => q.isRequired), [true, false]);
    assert.ok(calls.some((c) => c.url.endsWith("/webinars/evt@t/registrationConfiguration/questions")));
  });

  test("encodeGraphId keeps @ literal", () => {
    assert.equal(encodeGraphId("a b@c"), "a%20b@c");
  });
});

// ── processor ────────────────────────────────────────────────────────────
describe("processItems", () => {
  const ok = (): ItemOutcome => ({ kind: "registered", registrationId: null, attempts: 1 });
  const fail = (category: "invalid_contact_data" | "organiser_access_policy"): ItemOutcome => ({
    kind: "failed",
    attempts: 1,
    error: { category, retryable: false, status: 400, code: category, message: "x" },
  });

  test("continues after individual failures and persists every outcome", async () => {
    const seen: Array<[number, string]> = [];
    const summary = await processItems(
      [1, 2, 3, 4, 5],
      async (n) => (n % 2 === 0 ? fail("invalid_contact_data") : ok()),
      { concurrency: 2, onOutcome: async (n, o) => void seen.push([n, o.kind]) },
    );
    assert.equal(summary.processed, 5);
    assert.equal(summary.deferred, 0);
    assert.deepEqual(seen.sort((a, b) => a[0] - b[0]), [
      [1, "registered"],
      [2, "failed"],
      [3, "registered"],
      [4, "failed"],
      [5, "registered"],
    ]);
  });

  test("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    await processItems(
      Array.from({ length: 20 }, (_, i) => i),
      async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 2));
        active--;
        return ok();
      },
      { concurrency: 4, onOutcome: async () => {} },
    );
    assert.ok(peak <= 4, `peak concurrency was ${peak}`);
    assert.ok(peak > 1);
  });

  test("event-level breaker fails the remainder without calling Graph", async () => {
    let workerCalls = 0;
    const outcomes: ItemOutcome[] = [];
    const summary = await processItems(
      Array.from({ length: 10 }, (_, i) => i),
      async () => {
        workerCalls++;
        return fail("organiser_access_policy");
      },
      { concurrency: 1, breakerThreshold: 3, onOutcome: async (_i, o) => void outcomes.push(o) },
    );
    assert.equal(workerCalls, 3);
    assert.equal(summary.shortCircuited, 7);
    assert.equal(outcomes.length, 10);
    assert.ok(outcomes.every((o) => o.kind === "failed"));
    assert.equal(outcomes[9].kind === "failed" && outcomes[9].attempts, 0);
  });

  test("a success resets the breaker; per-person failures never trip it", async () => {
    let calls = 0;
    const summary = await processItems(
      Array.from({ length: 12 }, (_, i) => i),
      async (n) => {
        calls++;
        if (n % 3 === 2) return ok(); // success every third resets the streak
        return fail(n < 6 ? "organiser_access_policy" : "invalid_contact_data");
      },
      { concurrency: 1, breakerThreshold: 3, onOutcome: async () => {} },
    );
    assert.equal(calls, 12);
    assert.equal(summary.shortCircuited, 0);
  });

  test("stops at the deadline and leaves the rest deferred", async () => {
    let clock = 0;
    const summary = await processItems(
      [1, 2, 3, 4, 5, 6],
      async () => {
        clock += 10;
        return ok();
      },
      { concurrency: 1, deadlineAtMs: 25, now: () => clock, onOutcome: async () => {} },
    );
    assert.equal(summary.processed, 3);
    assert.equal(summary.deferred, 3);
  });

  test("a throwing worker becomes a recorded failure; a throwing persister is counted", async () => {
    const outcomes: ItemOutcome[] = [];
    const summary = await processItems(
      [1, 2],
      async (n) => {
        if (n === 1) throw new Error("boom");
        return ok();
      },
      {
        concurrency: 1,
        onOutcome: async (_i, o) => {
          outcomes.push(o);
          if (outcomes.length === 2) throw new Error("db down");
        },
      },
    );
    assert.equal(outcomes[0].kind, "failed");
    assert.equal(summary.persistErrors, 1);
    assert.equal(summary.processed, 2);
  });
});

// ── credentials ──────────────────────────────────────────────────────────
describe("resolveTeamsGraphCredentials", () => {
  const reader = (env: Record<string, string>) => (name: string) => env[name];
  const shared = { MICROSOFT_TENANT_ID: "t1", MICROSOFT_CLIENT_ID: "c1", MICROSOFT_CLIENT_SECRET: "s1" };
  const dedicated = {
    TEAMS_EVENTS_TENANT_ID: "t2",
    TEAMS_EVENTS_CLIENT_ID: "c2",
    TEAMS_EVENTS_CLIENT_SECRET: "s2",
  };

  test("reuses the existing MICROSOFT_* app by default", () => {
    assert.deepEqual(resolveTeamsGraphCredentials(reader(shared)), {
      tenantId: "t1",
      clientId: "c1",
      clientSecret: "s1",
      source: "microsoft",
    });
  });

  test("a complete TEAMS_EVENTS_* set takes precedence", () => {
    const result = resolveTeamsGraphCredentials(reader({ ...shared, ...dedicated }));
    assert.equal(result?.source, "teams_events");
    assert.equal(result?.clientId, "c2");
  });

  test("a partly set TEAMS_EVENTS_* trio is not configured — never mixed with the shared app", () => {
    assert.equal(
      resolveTeamsGraphCredentials(reader({ ...shared, TEAMS_EVENTS_CLIENT_ID: "c2" })),
      null,
    );
  });

  test("returns null when nothing (or only part of the shared set) is configured", () => {
    assert.equal(resolveTeamsGraphCredentials(reader({})), null);
    assert.equal(resolveTeamsGraphCredentials(reader({ MICROSOFT_CLIENT_ID: "c1", MICROSOFT_TENANT_ID: "t1" })), null);
    assert.equal(resolveTeamsGraphCredentials(reader({ ...shared, MICROSOFT_CLIENT_SECRET: "   " })), null);
  });
});

// ── batch status ─────────────────────────────────────────────────────────
describe("batch totals and status", () => {
  test("totals follow the documented definitions", () => {
    const counts = countStatuses([
      "registered", "registered", "invited", "already_processed", "excluded", "excluded",
      "duplicate", "failed", "pending", "bogus",
    ]);
    assert.deepEqual(toBatchTotals(counts), {
      eligible_count: 6,
      submitted_count: 4,
      success_count: 3,
      skipped_count: 4,
      failure_count: 1,
    });
  });

  test("status derivation", () => {
    const c = (over: Record<string, number>) => ({ ...countStatuses([]), ...over });
    assert.equal(deriveBatchStatus(c({ pending: 1, registered: 4 })), "processing");
    assert.equal(deriveBatchStatus(c({ registered: 4, excluded: 2 })), "completed");
    assert.equal(deriveBatchStatus(c({})), "completed");
    assert.equal(deriveBatchStatus(c({ registered: 3, failed: 1 })), "completed_with_errors");
    assert.equal(deriveBatchStatus(c({ already_processed: 3, failed: 1 })), "completed_with_errors");
    assert.equal(deriveBatchStatus(c({ failed: 4 })), "failed");
  });
});

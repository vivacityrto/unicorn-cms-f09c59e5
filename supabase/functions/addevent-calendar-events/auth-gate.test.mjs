/**
 * Source-level checks for addevent-calendar-events.
 *
 * The function fetches a third-party page on behalf of signed-in users, so the
 * properties that matter are: the caller gate runs before any outbound fetch,
 * the outbound URL is a fixed constant (no request input reaches it), and
 * failures are explicit rather than an empty 200.
 *
 * Run: node --test supabase/functions/addevent-calendar-events/auth-gate.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "index.ts"), "utf8");
const config = readFileSync(join(here, "..", "..", "config.toml"), "utf8");

describe("addevent-calendar-events", () => {
  it("imports and calls requireCaller before the outbound fetch", () => {
    assert.match(src, /import \{[^}]*requireCaller[^}]*\} from "\.\.\/_shared\/requireCaller\.ts"/);
    const gate = src.indexOf("await requireCaller(");
    const fetchCall = src.indexOf("await fetchCalendarHtml()");
    assert.ok(gate > 0 && fetchCall > 0, "gate and fetch both present");
    assert.ok(gate < fetchCall, "gate runs before fetch");
    assert.match(src, /if \(!caller\.ok\) return caller\.response;/);
  });

  it("allows staff or any tenant member, and nothing broader", () => {
    assert.match(src, /featureKey: FeatureKeys\.staffInternal/);
    assert.match(src, /\.from\("tenant_users"\)/);
    assert.match(src, /orAllow:/);
  });

  it("only ever fetches the fixed AddEvent calendar URL", () => {
    assert.match(src, /const ADDEVENT_CALENDAR_URL = "https:\/\/www\.addevent\.com\/calendar\/DE347781";/);
    const fetches = src.match(/\bfetch\(/g) ?? [];
    assert.equal(fetches.length, 1);
    assert.match(src, /fetch\(ADDEVENT_CALENDAR_URL,/);
  });

  it("never reads request body, query string or headers into the outbound call", () => {
    assert.doesNotMatch(src, /req\.json\(|req\.text\(|new URL\(req\.url|searchParams/);
  });

  it("bounds the outbound request by time and size", () => {
    assert.match(src, /AbortSignal\.timeout\(FETCH_TIMEOUT_MS\)/);
    assert.match(src, /MAX_HTML_BYTES/);
  });

  it("fails with an explicit 502 and a code rather than an empty 200", () => {
    assert.match(src, /json\(req, 502,/);
    assert.match(src, /code: error\.code/);
    assert.match(src, /code: "upstream_unavailable"/);
  });

  it("does not log or return meeting join links", () => {
    assert.doesNotMatch(src, /teams\.microsoft|zoom\.us/i);
  });

  it("is registered in config.toml with in-function auth", () => {
    assert.match(config, /\[functions\.addevent-calendar-events\]\s*\nverify_jwt = false/);
  });
});

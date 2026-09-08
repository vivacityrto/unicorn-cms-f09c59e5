/**
 * Regression checks for sync-outlook-calendar's create-event/cancel-event
 * actions - the outbound Outlook calendar invite capability added for L10 #10
 * (docs/kb/reference/l10-real-bugs-found-2026-09-04.md).
 *
 * Run: node --test supabase/functions/sync-outlook-calendar/auth-gate.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "index.ts"),
  "utf8",
);

describe("sync-outlook-calendar create-event/cancel-event auth gate", () => {
  it("gates create-event and cancel-event behind the same auth+token checks as every other action", () => {
    const authHeaderIdx = src.indexOf("const authHeader = req.headers.get");
    const tokenFetchIdx = src.indexOf("Get OAuth token");
    const refreshIdx = src.indexOf("Refresh token if needed");
    const createIdx = src.indexOf("action === 'create-event'");
    const cancelIdx = src.indexOf("action === 'cancel-event'");
    assert.ok(authHeaderIdx >= 0 && tokenFetchIdx >= 0 && refreshIdx >= 0 && createIdx >= 0 && cancelIdx >= 0);
    assert.ok(authHeaderIdx < tokenFetchIdx, "auth header check runs before token fetch");
    assert.ok(tokenFetchIdx < refreshIdx, "token fetch runs before refresh");
    assert.ok(refreshIdx < createIdx, "create-event only runs after auth+token+refresh");
    assert.ok(refreshIdx < cancelIdx, "cancel-event only runs after auth+token+refresh");
  });

  it("uses the refreshed accessToken (not a raw stored token) for both outbound Graph calls", () => {
    assert.match(src, /POST',\s*headers:\s*\{\s*\n\s*Authorization:\s*`Bearer \$\{accessToken\}`/);
    assert.match(src, /method:\s*'DELETE',\s*headers:\s*\{\s*Authorization:\s*`Bearer \$\{accessToken\}`/);
  });

  it("cancel-event verifies the calendar_events row belongs to the calling user before deleting anything in Outlook", () => {
    const lookupIdx = src.indexOf("select('id, provider_event_id, user_id')");
    const ownerCheckIdx = src.indexOf("calendarEventRow.user_id !== user.id");
    const deleteIdx = src.indexOf("method: 'DELETE'");
    assert.ok(lookupIdx >= 0 && ownerCheckIdx >= 0 && deleteIdx >= 0);
    assert.ok(lookupIdx < ownerCheckIdx, "row is looked up before the ownership check");
    assert.ok(ownerCheckIdx < deleteIdx, "ownership check runs before the Graph DELETE call");
  });

  it("create-event never pre-inserts a placeholder calendar_events row before the Graph call succeeds", () => {
    const createBlockStart = src.indexOf("if (action === 'create-event')");
    const createBlockEnd = src.indexOf("if (action === 'cancel-event')");
    const createBlock = src.slice(createBlockStart, createBlockEnd);
    const graphCallIdx = createBlock.indexOf("https://graph.microsoft.com/v1.0/me/events'");
    const insertIdx = createBlock.indexOf(".insert({");
    assert.ok(graphCallIdx >= 0 && insertIdx >= 0);
    assert.ok(graphCallIdx < insertIdx, "the local calendar_events insert happens after the Graph POST succeeds, not before");
  });

  it("surfaces a distinguishable insufficient_scope error code on a Graph 403, for both create and cancel", () => {
    const matches = [...src.matchAll(/error_code:\s*'insufficient_scope'/g)];
    assert.ok(matches.length >= 2, "expected an insufficient_scope response in both create-event and cancel-event");
  });
});

/**
 * Static guardrail test for support-ticket-ai-draft (AGENTS.md "Edge Function
 * security guardrails"). Deno is not available locally, so these assert the
 * shape of index.ts: auth before any database access, a one-key request
 * allowlist, a single atomic claim, minimal data to the model, and a failure
 * path that leaves the ticket usable.
 *
 * Run: node --test supabase/functions/support-ticket-ai-draft/auth-gate.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "index.ts"), "utf8");
const draft = readFileSync(join(dir, "draft.ts"), "utf8");

// Strip comments so assertions only see code.
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("support-ticket-ai-draft auth and input gate", () => {
  it("authenticates (verifyAuth) before any database access", () => {
    const auth = code.indexOf("verifyAuth(");
    const firstDb = code.search(/\.from\(/);
    assert.ok(auth > -1, "must call verifyAuth");
    assert.ok(firstDb > -1);
    assert.ok(auth < firstDb, "verifyAuth must come before the first .from()");
  });

  it("rejects anything but exactly one ticket_id key, validated as a UUID", () => {
    assert.match(code, /keys\.length !== 1 \|\| keys\[0\] !== "ticket_id"/);
    assert.match(code, /UUID_RE\.test\(ticketId\)/);
  });

  it("never reads tenant or identity values from the request body", () => {
    assert.ok(!/body\.(tenant|client|reporter|title|type|urgency)/.test(code));
    assert.ok(!/raw as Record<string, unknown>\)\.(tenant|client)/.test(code));
  });

  it("checks reporter-or-staff ownership and answers non-owners as not found", () => {
    assert.match(code, /ticket\.reporter_id !== user\.id && !isStaff/);
    assert.match(code, /404, "NOT_FOUND"/);
  });

  it("claims the ticket atomically, once, from 'pending'", () => {
    assert.match(code, /\.update\(\{ ai_state: "drafting" \}\)[\s\S]*?\.eq\("ai_state", "pending"\)/);
  });

  it("only writes drafted values while the claim is still held", () => {
    assert.match(code, /\.update\(patch\)[\s\S]*?\.eq\("ai_state", "drafting"\)/);
  });

  it("stores the AI summary as a staff-only ai_draft message with no author", () => {
    assert.match(code, /kind: "ai_draft",\s*staff_only: true/);
    assert.match(code, /author_id: null/);
  });

  it("falls back to a failed state (fields untouched) on any error or empty draft", () => {
    assert.match(code, /ai_state: "failed"/);
    assert.ok((code.match(/return await fail\(\)/g) ?? []).length >= 4);
  });

  it("sends the model only the subject and the first message text", () => {
    assert.match(code, /buildUserPrompt\(hasSubject \? ticket\.title : null, first\.body\)/);
    // Nothing identifying is interpolated into the prompt call.
    const promptCall = code.match(/buildUserPrompt\([^)]*\)/)?.[0] ?? "";
    assert.ok(!/tenant|email|profile|user\./.test(promptCall));
  });

  it("forces the draft tool, has a deadline, and passes an abort signal", () => {
    assert.match(code, /tool_choice: \{ type: "tool", name: DRAFT_TOOL\.name \}/);
    assert.match(code, /withTimeout\(/);
    assert.match(code, /signal: controller\.signal/);
  });

  it("logs failure classes only, never message text", () => {
    assert.ok(!/console\.(log|error)\([^)]*first\.body/.test(code));
    assert.ok(!/console\.(log|error)\([^)]*message/i.test(code));
  });

  it("treats the client message as data in the system prompt", () => {
    assert.match(draft, /untrusted data/);
    assert.match(draft, /never an instruction/);
  });

  it("restricts the tool's type and urgency to enums", () => {
    assert.match(draft, /enum: \["bug", "request", "question", "other"\]/);
    assert.match(draft, /enum: \["low", "medium", "high", "critical"\]/);
  });
});

# Audit: 2026-11-18 — scorecard-viv-insight

**Trigger:** Carl asked for an AI read of the scorecard numbers (what is behind a number and what to do), built on the Anthropic API or Ask Viv, user friendly for non-technical readers.
**Scope:** one new Edge Function, `scorecard-insight`, a shared prompt and validation module, a front-end panel and button. No migration, no schema, RLS or data change.
**Status:** PR open (stacked on the why-this-number PR). **Not deployed.** Merging deploys the function through the repository's Edge Function workflow, so it needs Carl's go-ahead, and it needs the `ANTHROPIC_API_KEY` function secret, which is the one Ask Viv already uses (not checked from here).

## What it does

- Staff press "Ask Viv" on a measure. The function reads that measure, its last eight weeks of numbers and, for the automatic client measures, the weekly client snapshot, then asks Claude for a structured read (headline, what may be behind it, up to four actions with an owner or CSC, one thing to watch).
- Read-only. It writes nothing and creates nothing; a person decides what to do. The answer is held in the browser for the session so reopening does not spend another call.

## Security shape

- `requireCaller` with `staff.ai.use` runs before the body, the database or the AI is touched. In `config.toml` as `verify_jwt = false` with in-function auth, like `summarise-rock-notes`.
- The only caller input is a validated measure id and a Monday week key. Everything the model sees is read server-side with the service role.
- Data sent to the AI: measure name, description, numbers, owner and CSC names, business (client) names and counts, certificate counts by course and client. Not sent: learner names, email addresses, free-text notes.
- The model must answer through a forced tool call; the output is validated and length-capped before it is returned, and an unusable answer returns a generic error. Raw upstream errors are not passed back. A 45-second timeout bounds the call.
- The prompt tells the model to use only the given facts, mark any reason as "possibly", and not to invent clients or causes. The panel says the text was written by AI and can be wrong.

## Evidence

- `supabase/functions/_shared/scorecard-insight.node-test.ts` (13 tests): prompt content, client and certificate fact sections, output validation and caps.
- `supabase/functions/scorecard-insight/auth-gate.test.mjs` (8 tests): gate before everything, validated input, no writes, one AI call through the shared client, no learner or email data, validated output, timeout, config entry.
- Front-end tests for the panel (idle, asking, result, error and retry, ask once) and the deck button.
- Typecheck clean; lint ratchet clean.

## Not verified

- The function has not been run against the live Anthropic API or deployed, so the quality of real answers is unseen.
- `npm run test:edge` has one failure, in `support-ticket-ai-draft/migration-shape.test.mjs` ("gives clients no UPDATE right on tickets"). It fails identically on `origin/main` and is unrelated to this change.

## Rollback

Remove the function (or revert the PR); nothing else depends on it. The button then shows the function's error message.

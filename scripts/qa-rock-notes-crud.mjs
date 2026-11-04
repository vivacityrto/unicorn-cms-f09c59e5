#!/usr/bin/env node
// One-row, authenticated QA verification of the Rock Notes CRUD RLS policies.
// It consumes storage states produced by e2e/auth-setup.mjs after real logins;
// it never creates or resets users and never uses a service-role key.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

export const QA_PROJECT_REF = "qfpxvumcrnzrjyvqkicq";
export const QA_PROJECT_URL = `https://${QA_PROJECT_REF}.supabase.co`;
export const QA_FIXTURE_TENANT_ID = 20;
export const QA_FIXTURE_TENANT_SLUG = "qa-e2e-demo-tenant";
const AUTH_STATE_ORIGIN = "http://localhost:8080";

const PERSONAS = {
  author: {
    stateFile: "tom-csc.json",
    email: "tom_qa_20260913_seed_01_csc@example.qa",
    role: "Team Member",
  },
  nonAuthor: {
    stateFile: "tom-integrator.json",
    email: "tom_qa_20260913_seed_01_integrator@example.qa",
    role: "Integrator",
  },
  superAdmin: {
    stateFile: "qa-superadmin.json",
    email: "qa-e2e-superadmin@example.qa",
    role: "Super Admin",
  },
};

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateQaConfig(env) {
  if (env.QA_SUPABASE_PROJECT_REF !== QA_PROJECT_REF) {
    throw new Error(`Refusing QA Rock Notes test: expected project ref ${QA_PROJECT_REF}`);
  }
  if (env.VITE_SUPABASE_URL !== QA_PROJECT_URL) {
    throw new Error(`Refusing QA Rock Notes test: expected URL ${QA_PROJECT_URL}`);
  }
  if (typeof env.VITE_SUPABASE_PUBLISHABLE_KEY !== "string" || !env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()) {
    throw new Error("Refusing QA Rock Notes test: QA publishable key is missing");
  }
  if (!/^\d+-\d+$/.test(env.QA_ROCK_NOTES_TEST_RUN_ID ?? "")) {
    throw new Error("Refusing QA Rock Notes test: run id must be <workflow-run>-<attempt>");
  }
  return {
    url: QA_PROJECT_URL,
    publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    runId: env.QA_ROCK_NOTES_TEST_RUN_ID,
  };
}

export function authStorageKey(projectRef = QA_PROJECT_REF) {
  return `sb-${projectRef}-auth-token`;
}

export function readAuthSession(storageState, persona, projectRef = QA_PROJECT_REF) {
  if (!record(storageState) || !Array.isArray(storageState.origins)) {
    throw new Error(`Invalid Playwright storage state for ${persona}`);
  }
  const origin = storageState.origins.find(item => record(item) && item.origin === AUTH_STATE_ORIGIN);
  const token = origin?.localStorage?.find(item => record(item) && item.name === authStorageKey(projectRef));
  if (typeof token?.value !== "string") {
    throw new Error(`No QA auth session found for ${persona}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(token.value);
  } catch {
    throw new Error(`Invalid QA auth session data for ${persona}`);
  }
  const session = record(parsed) && record(parsed.currentSession) ? parsed.currentSession : parsed;
  if (!record(session) || typeof session.access_token !== "string" || typeof session.refresh_token !== "string") {
    throw new Error(`Incomplete QA auth session for ${persona}`);
  }
  return { access_token: session.access_token, refresh_token: session.refresh_token };
}

export function isRlsDenied(result) {
  return !result?.error && Array.isArray(result?.data) && result.data.length === 0;
}

function errorCode(error) {
  const code = typeof error?.code === "string" ? error.code : "request-failed";
  const status = Number.isInteger(error?.status) ? ` HTTP ${error.status}` : "";
  return `${code}${status}`;
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : "unknown failure";
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-token]");
}

function requireSuccess(result, label) {
  if (result?.error) throw new Error(`${label} failed (${errorCode(result.error)})`);
  return result.data;
}

function expectOneRow(data, label) {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(`${label} did not affect exactly one row`);
  }
  return data[0];
}

function readId(value, label) {
  if (!record(value) || typeof value.id !== "string") throw new Error(`${label} returned no id`);
  return value.id;
}

function readNoteId(value) {
  if (!record(value) || typeof value.note_id !== "string") throw new Error("add_rock_note returned no note id");
  return value.note_id;
}

function quarterDetails(now = new Date()) {
  const year = now.getUTCFullYear();
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  const dueDate = new Date(Date.UTC(year, quarter * 3, 0)).toISOString().slice(0, 10);
  return { quarterYear: year, quarterNumber: quarter, dueDate };
}

async function clientFromState({ statePath, persona, config }) {
  let storageState;
  try {
    storageState = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    throw new Error(`Could not read the authorized QA login state for ${persona}`);
  }
  const session = readAuthSession(storageState, persona);
  const client = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const set = await client.auth.setSession(session);
  if (set.error) throw new Error(`Authorized QA login state was rejected for ${persona} (${errorCode(set.error)})`);
  const auth = await client.auth.getUser();
  if (auth.error || !auth.data.user) throw new Error(`Could not verify QA identity for ${persona} (${errorCode(auth.error)})`);
  if (auth.data.user.email?.toLowerCase() !== PERSONAS[persona].email) {
    throw new Error(`Wrong QA account in storage state for ${persona}`);
  }
  const profileResult = await client
    .from("users")
    .select("unicorn_role, is_vivacity_internal, disabled, archived")
    .eq("user_uuid", auth.data.user.id)
    .single();
  const profile = requireSuccess(profileResult, `Read ${persona} role`);
  if (profile.unicorn_role !== PERSONAS[persona].role || profile.is_vivacity_internal !== true || profile.disabled || profile.archived) {
    throw new Error(`QA account ${persona} is not an active internal ${PERSONAS[persona].role} persona`);
  }
  return { client, user: auth.data.user };
}

async function addNote(client, rockId, body) {
  const result = await client.rpc("add_rock_note", {
    p_rock_id: rockId,
    p_body: body,
    p_meeting_id: null,
    p_source: "typed",
  });
  return readNoteId(requireSuccess(result, "add_rock_note"));
}

async function cleanup({ author, superAdmin, title, runId, noteBodies, rockId, createAttempted }) {
  if (!rockId && createAttempted) {
    const lookup = await author.client
      .from("eos_rocks")
      .select("id")
      .eq("tenant_id", QA_FIXTURE_TENANT_ID)
      .eq("title", title)
      .limit(2);
    const rows = requireSuccess(lookup, "Recover the run-scoped Rock id");
    if (rows.length > 1) throw new Error(`More than one synthetic Rock matches run ${runId}; leaving all rows untouched`);
    if (rows.length === 1) rockId = rows[0].id;
  }
  if (!rockId) return null;

  const notesResult = await superAdmin.client
    .from("eos_rock_notes")
    .select("id, body")
    .eq("rock_id", rockId);
  const notes = requireSuccess(notesResult, "Read the synthetic Rock's remaining notes");
  const owned = notes.filter(note => noteBodies.has(note.body));
  const unexpected = notes.filter(note => !noteBodies.has(note.body));
  if (unexpected.length > 0) {
    throw new Error(`Synthetic Rock ${title} contains a note outside this run; leaving it and the Rock untouched`);
  }

  for (const note of owned) {
    const deleted = await superAdmin.client
      .from("eos_rock_notes")
      .delete()
      .eq("id", note.id)
      .eq("rock_id", rockId)
      .select("id");
    expectOneRow(requireSuccess(deleted, "Delete this run's synthetic note"), "Synthetic note cleanup");
  }

  const rockDelete = await superAdmin.client.from("eos_rocks").delete().eq("id", rockId).select("id");
  expectOneRow(requireSuccess(rockDelete, "Delete this run's synthetic Rock"), "Synthetic Rock cleanup");

  const rockCheck = await superAdmin.client.from("eos_rocks").select("id").eq("id", rockId);
  if (requireSuccess(rockCheck, "Postflight Rock check").length !== 0) {
    throw new Error(`Synthetic Rock ${title} remains after cleanup`);
  }
  const noteCheck = await superAdmin.client.from("eos_rock_notes").select("id").eq("rock_id", rockId);
  if (requireSuccess(noteCheck, "Postflight note check").length !== 0) {
    throw new Error(`Synthetic notes for ${title} remain after cleanup`);
  }
  const eventsResult = await superAdmin.client
    .from("eos_rock_events")
    .select("action, actor_user_id, rock_title")
    .eq("rock_id", rockId)
    .order("created_at", { ascending: true });
  const events = requireSuccess(eventsResult, "Postflight Rock event check");
  if (events.length !== 2 || events[0].action !== "created" || events[1].action !== "deleted" || events.some(event => event.rock_title !== title)) {
    throw new Error(`Expected the synthetic Rock's two durable audit events for run ${runId}`);
  }
  return { rockId, eventCount: events.length };
}

async function run() {
  const config = validateQaConfig(process.env);
  const stateDirectory = resolve(process.cwd(), "playwright", ".auth");
  const [author, nonAuthor, superAdmin] = await Promise.all([
    clientFromState({ statePath: resolve(stateDirectory, PERSONAS.author.stateFile), persona: "author", config }),
    clientFromState({ statePath: resolve(stateDirectory, PERSONAS.nonAuthor.stateFile), persona: "nonAuthor", config }),
    clientFromState({ statePath: resolve(stateDirectory, PERSONAS.superAdmin.stateFile), persona: "superAdmin", config }),
  ]);

  const title = `[QA TEST ONLY] Rock Notes CRUD ${config.runId}`;
  const authorNoteBody = `[QA TEST ONLY] Rock Notes CRUD ${config.runId} :: author-delete`;
  const superAdminNoteBody = `[QA TEST ONLY] Rock Notes CRUD ${config.runId} :: super-admin-delete`;
  // Edits stay inside this run-scoped allowlist so cleanup can never touch
  // an unexpected note, while still recognizing every body this test writes.
  const noteBodies = new Set([
    authorNoteBody,
    superAdminNoteBody,
    `${authorNoteBody} :: author-edited`,
    `${authorNoteBody} :: super-admin-edited`,
  ]);
  const tenantResult = await author.client.from("tenants").select("id, slug").eq("id", QA_FIXTURE_TENANT_ID).single();
  const tenant = requireSuccess(tenantResult, "Verify the QA fixture tenant");
  if (tenant.slug !== QA_FIXTURE_TENANT_SLUG) throw new Error("Refusing fixture: QA tenant id 20 is not the expected E2E demo tenant");

  const preflight = await author.client
    .from("eos_rocks")
    .select("id")
    .eq("tenant_id", QA_FIXTURE_TENANT_ID)
    .eq("title", title)
    .limit(2);
  if (requireSuccess(preflight, "Preflight synthetic Rock lookup").length !== 0) {
    throw new Error(`A Rock with this run's synthetic label already exists; no fixture was changed (${config.runId})`);
  }
  const notePreflight = await author.client.from("eos_rock_notes").select("id").in("body", [...noteBodies]).limit(2);
  if (requireSuccess(notePreflight, "Preflight synthetic note lookup").length !== 0) {
    throw new Error(`A note with this run's synthetic label already exists; no fixture was changed (${config.runId})`);
  }
  const eventPreflight = await author.client.from("eos_rock_events").select("id").eq("rock_title", title).limit(2);
  if (requireSuccess(eventPreflight, "Preflight synthetic event lookup").length !== 0) {
    throw new Error(`Audit events with this run's synthetic label already exist; no fixture was changed (${config.runId})`);
  }

  let rockId;
  let createAttempted = false;
  let cleanupResult;
  let operationError;
  try {
    const quarter = quarterDetails();
    createAttempted = true;
    const createResult = await author.client.rpc("upsert_rock_with_parenting", {
      p_payload: {
        title,
        description: `Synthetic QA verification fixture only; run ${config.runId}. No business deliverable.`,
        issue: null,
        outcome: null,
        milestones: null,
        rock_level: "company",
        rock_type: "general",
        function_id: null,
        owner_id: author.user.id,
        parent_rock_id: null,
        client_tenant_id: null,
        quarter_year: quarter.quarterYear,
        quarter_number: quarter.quarterNumber,
        due_date: quarter.dueDate,
        tenant_id: QA_FIXTURE_TENANT_ID,
        status: "on_track",
        priority: 1,
      },
    });
    rockId = readId(requireSuccess(createResult, "Create the single synthetic QA Rock"), "Rock creation");

    const authorDeleteNote = await addNote(author.client, rockId, authorNoteBody);
    const superAdminDeleteNote = await addNote(author.client, rockId, superAdminNoteBody);

    const authorNote = await author.client
      .from("eos_rock_notes")
      .select("id, body, created_by, rock_status, milestones_complete, milestones_total")
      .eq("id", authorDeleteNote)
      .single();
    const authorNoteRow = requireSuccess(authorNote, "Read the note created by the author");
    if (authorNoteRow.created_by !== author.user.id || authorNoteRow.rock_status !== "on_track") {
      throw new Error("add_rock_note did not preserve the authenticated author and Rock snapshot");
    }

    const authorEdit = await author.client
      .from("eos_rock_notes")
      .update({ body: `${authorNoteBody} :: author-edited` })
      .eq("id", authorDeleteNote)
      .select("id, body, edited_at, created_by");
    const authorEditedRow = expectOneRow(requireSuccess(authorEdit, "Author edit"), "Author edit");
    if (!authorEditedRow.edited_at || authorEditedRow.created_by !== author.user.id) {
      throw new Error("Author edit did not timestamp the body-only change or preserve authorship");
    }

    const deniedUpdate = await nonAuthor.client
      .from("eos_rock_notes")
      .update({ body: "[QA TEST ONLY] unauthorized non-author update" })
      .eq("id", authorDeleteNote)
      .select("id, body");
    if (!isRlsDenied(deniedUpdate)) throw new Error("Non-author update was not denied by RLS");
    const deniedDelete = await nonAuthor.client
      .from("eos_rock_notes")
      .delete()
      .eq("id", authorDeleteNote)
      .select("id");
    if (!isRlsDenied(deniedDelete)) throw new Error("Non-author delete was not denied by RLS");

    const superAdminEdit = await superAdmin.client
      .from("eos_rock_notes")
      .update({ body: `${authorNoteBody} :: super-admin-edited` })
      .eq("id", authorDeleteNote)
      .select("id, body, edited_at, created_by");
    const superAdminEditedRow = expectOneRow(requireSuccess(superAdminEdit, "Super Admin edit"), "Super Admin edit");
    if (!superAdminEditedRow.edited_at || superAdminEditedRow.created_by !== author.user.id) {
      throw new Error("Super Admin edit did not timestamp the body-only change or preserve authorship");
    }

    const superAdminDelete = await superAdmin.client
      .from("eos_rock_notes")
      .delete()
      .eq("id", authorDeleteNote)
      .select("id");
    expectOneRow(requireSuccess(superAdminDelete, "Super Admin delete"), "Super Admin delete");

    const authorDelete = await author.client
      .from("eos_rock_notes")
      .delete()
      .eq("id", superAdminDeleteNote)
      .select("id");
    expectOneRow(requireSuccess(authorDelete, "Author delete"), "Author delete");
  } catch (error) {
    operationError = error;
  } finally {
    try {
      cleanupResult = await cleanup({ author, superAdmin, title, runId: config.runId, noteBodies, rockId, createAttempted });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown cleanup failure";
      console.error(`Synthetic QA fixture may remain; its label is "${title}". ${detail}`);
      throw new Error(`QA Rock Notes test cleanup failed for run ${config.runId}; preserve and inspect the labeled fixture before rerunning`);
    }
  }

  if (operationError) {
    throw new Error(`QA Rock Notes role verification failed for run ${config.runId}: ${safeMessage(operationError)}; synthetic rows were cleaned where safe`);
  }
  if (!cleanupResult) throw new Error(`QA Rock Notes fixture was not created for run ${config.runId}`);
  console.log(`QA Rock Notes RLS verification passed for ${config.runId}: 1 synthetic Rock, 2 notes, 3 active role sessions; Rock/note rows cleaned, ${cleanupResult.eventCount} audit events preserved.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  run().catch(error => {
    console.error(`QA Rock Notes RLS verification failed: ${safeMessage(error)}.`);
    process.exitCode = 1;
  });
}

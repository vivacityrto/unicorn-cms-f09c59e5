/**
 * summarise-rock-notes
 *
 * Writes a short AI summary of a Rock's notes (and of the notes on the Rocks beneath it) and
 * suggests up to three To-Dos. The summary is stored as history in eos_rock_note_summaries so
 * the next meeting can see it; the notes remain the record, the summary is a convenience.
 * Nothing is created from the suggestions here: a person confirms each To-Do in the app.
 *
 * Auth: Vivacity staff only (`staff.ai.use`), checked before anything is read. The Rock id is the
 * only caller input used; everything the model sees is read server-side with the service role.
 *
 * Body: { rock_id: uuid, force?: boolean }
 * Responses:
 *   200 { summary: {...row}, cached: boolean }
 *   400 { error }   missing/invalid rock_id, or no notes to summarise
 *   404 { error }   Rock not found
 *   429 / 402       AI gateway rate limit / credits
 *   502 { error }   AI did not return a usable summary
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { FeatureKeys, requireCaller } from "../_shared/requireCaller.ts";
import {
  SUMMARY_TOOL,
  SYSTEM_PROMPT,
  buildUserPrompt,
  parseSummary,
  selectNotes,
  type PromptNote,
} from "../_shared/rock-notes-summary.ts";

const MODEL = "google/gemini-3-flash-preview";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUMMARY_COLUMNS = "id, rock_id, summary, status_signal, suggested_todos, notes_through, note_count, rocks_included, model, generated_at";

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { error: "Method not allowed" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const caller = await requireCaller(req, admin, {
    featureKey: FeatureKeys.staffAi,
    headers: corsHeaders(req),
    unauthorizedMessage: "Unauthorized",
    forbiddenMessage: "Forbidden",
  });
  if (!caller.ok) return caller.response;

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.error("[summarise-rock-notes] LOVABLE_API_KEY is not configured");
    return json(req, 502, { error: "The AI service is not configured." });
  }

  let body: { rock_id?: unknown; force?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: "Send a JSON body with rock_id" });
  }
  const rockId = typeof body.rock_id === "string" ? body.rock_id : "";
  if (!UUID.test(rockId)) {
    return json(req, 400, { error: "rock_id must be a valid id" });
  }
  const force = body.force === true;

  try {
    const { data: rock, error: rockError } = await admin
      .from("eos_rocks")
      .select("id, tenant_id, title, description, status, due_date, rock_level, archived_at")
      .eq("id", rockId)
      .maybeSingle();
    if (rockError) throw rockError;
    if (!rock) return json(req, 404, { error: "Rock not found" });

    // The Rock plus the Rocks beneath it (Team Rocks, then Individual Rocks), so a Company or
    // Team Rock's summary reflects the work delivering it.
    const { data: children, error: childrenError } = await admin
      .from("eos_rocks")
      .select("id, title, rock_level")
      .eq("parent_rock_id", rockId)
      .is("archived_at", null);
    if (childrenError) throw childrenError;
    const childIds = (children ?? []).map((r) => r.id);
    let grandchildren: { id: string; title: string }[] = [];
    if (childIds.length > 0) {
      const { data, error } = await admin
        .from("eos_rocks")
        .select("id, title")
        .in("parent_rock_id", childIds)
        .is("archived_at", null);
      if (error) throw error;
      grandchildren = data ?? [];
    }
    const titleById = new Map<string, string>([
      [rock.id, rock.title],
      ...(children ?? []).map((r) => [r.id, r.title] as [string, string]),
      ...grandchildren.map((r) => [r.id, r.title] as [string, string]),
    ]);

    const { data: noteRows, error: notesError } = await admin
      .from("eos_rock_notes")
      .select("rock_id, body, rock_status, created_at")
      .in("rock_id", [...titleById.keys()])
      .order("created_at", { ascending: false })
      .limit(200);
    if (notesError) throw notesError;
    if (!noteRows || noteRows.length === 0) {
      return json(req, 400, { error: "There are no notes to summarise yet." });
    }
    const newestNote = noteRows[0].created_at as string;

    const { data: latest, error: latestError } = await admin
      .from("eos_rock_note_summaries")
      .select(SUMMARY_COLUMNS)
      .eq("rock_id", rockId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;

    // Nothing new since the last summary: return it rather than spend another AI call.
    if (latest && !force && new Date(latest.notes_through).getTime() >= new Date(newestNote).getTime()
        && latest.rocks_included === titleById.size) {
      return json(req, 200, { summary: latest, cached: true });
    }

    const [{ data: milestones, error: milestonesError }, { data: blockers, error: blockersError }] = await Promise.all([
      admin.from("eos_rock_milestones").select("status").eq("rock_id", rockId),
      admin.from("eos_rock_blockers").select("reason").eq("rock_id", rockId).is("resolved_at", null),
    ]);
    if (milestonesError) throw milestonesError;
    if (blockersError) throw blockersError;
    const counted = (milestones ?? []).filter((m) => m.status !== "deferred");

    const notes = selectNotes(
      noteRows.map((n): PromptNote => ({
        rockTitle: titleById.get(n.rock_id) ?? "Rock",
        createdAt: n.created_at,
        status: n.rock_status,
        body: n.body,
      })),
    );

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: buildUserPrompt({
              rock: {
                title: rock.title,
                level: rock.rock_level,
                status: rock.status,
                dueDate: rock.due_date,
                description: rock.description,
                milestonesComplete: counted.filter((m) => m.status === "complete").length,
                milestonesTotal: counted.length,
                openBlockers: (blockers ?? []).map((b) => b.reason),
              },
              notes,
              previousSummary: latest?.summary ?? null,
              includesDescendants: titleById.size > 1,
            }),
          },
        ],
        tools: [SUMMARY_TOOL],
        tool_choice: { type: "function", function: { name: SUMMARY_TOOL.function.name } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return json(req, 429, { error: "Rate limit exceeded. Please try again shortly." });
      if (response.status === 402) return json(req, 402, { error: "AI credits exhausted. Please add credits in workspace settings." });
      console.error("[summarise-rock-notes] AI gateway error:", response.status, await response.text());
      return json(req, 502, { error: "The AI service could not write a summary right now." });
    }

    const result = await response.json();
    const args = result.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let parsed = null;
    try {
      parsed = args ? parseSummary(JSON.parse(args)) : null;
    } catch {
      parsed = null;
    }
    if (!parsed) {
      console.error("[summarise-rock-notes] AI returned no usable summary");
      return json(req, 502, { error: "The AI service did not return a usable summary. Please try again." });
    }

    const { data: saved, error: saveError } = await admin
      .from("eos_rock_note_summaries")
      .insert({
        tenant_id: rock.tenant_id,
        rock_id: rockId,
        summary: parsed.summary,
        status_signal: parsed.statusSignal,
        suggested_todos: parsed.todos,
        notes_through: newestNote,
        note_count: noteRows.length,
        rocks_included: titleById.size,
        model: MODEL,
        generated_by: caller.user.id,
      })
      .select(SUMMARY_COLUMNS)
      .single();
    if (saveError) throw saveError;

    return json(req, 200, { summary: saved, cached: false });
  } catch (error) {
    console.error("[summarise-rock-notes] failure:", error instanceof Error ? error.message : String(error));
    return json(req, 500, { error: "The summary could not be written. Please try again." });
  }
});

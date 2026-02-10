/**
 * Emit Timeline Event Utility
 * 
 * Inserts a timeline event into client_timeline_events and an audit log entry.
 * Used by Microsoft integration edge functions to surface activity in the client timeline.
 * 
 * IMPORTANT: Never store raw Microsoft message bodies or transcript text in metadata.
 * Only store identifiers, counts, and timing information.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Canonical event types – must match the CHECK constraint on
 * client_timeline_events.event_type in the database.
 */
const VALID_EVENT_TYPES = new Set([
  'microsoft_connected','microsoft_disconnected','microsoft_sync_failed',
  'sharepoint_root_configured','sharepoint_root_invalid','sharepoint_doc_linked',
  'document_shared_to_client','document_uploaded','document_downloaded',
  'meeting_synced','meeting_attendance_imported','meeting_artifacts_captured',
  'minutes_draft_created','minutes_draft_updated','minutes_published_pdf',
  'tasks_created_from_minutes','task_completed_team','task_completed_client',
  'action_item_created','action_item_updated','action_item_completed',
  'email_linked','email_attachment_saved','email_sent','email_failed',
  'note_added','note_created','note_pinned','note_unpinned',
  'time_posted','time_ignored',
] as const);

type ValidEventType = typeof VALID_EVENT_TYPES extends Set<infer T> ? T : never;

const VALID_SOURCES = new Set(['unicorn', 'microsoft', 'system', 'user'] as const);
const VALID_VISIBILITIES = new Set(['internal', 'client'] as const);

export interface TimelineEventInput {
  tenant_id: number;
  client_id: string;
  event_type: string;
  title: string;
  body?: string | null;
  source: "microsoft" | "unicorn" | "system" | "user";
  visibility?: "internal" | "client"; // defaults to 'internal'
  entity_type?: string | null;
  entity_id?: string | null;
  package_id?: number | null;
  metadata?: Record<string, unknown>;
  created_by?: string | null;
  occurred_at?: string; // ISO timestamp, defaults to now
  dedupe_key?: string | null; // Prevents duplicate events when not null
}

/**
 * Validate an event before insertion.
 * Throws on invalid data so callers can catch and log.
 */
function validateEvent(event: TimelineEventInput): void {
  if (!VALID_EVENT_TYPES.has(event.event_type as ValidEventType)) {
    throw new Error(`Invalid event_type: "${event.event_type}". Must be one of the canonical types.`);
  }
  if (!VALID_SOURCES.has(event.source as any)) {
    throw new Error(`Invalid source: "${event.source}".`);
  }
  const vis = event.visibility || "internal";
  if (!VALID_VISIBILITIES.has(vis as any)) {
    throw new Error(`Invalid visibility: "${vis}".`);
  }
  // Business rules
  if (event.source === "microsoft" && vis !== "internal") {
    throw new Error("Microsoft-sourced events must have visibility='internal'.");
  }
  if (vis === "client" && event.source !== "unicorn") {
    throw new Error("Client-visible events must have source='unicorn'.");
  }
  // Dedupe key required for Microsoft events
  if (event.source === "microsoft" && !event.dedupe_key) {
    throw new Error("Microsoft-sourced events require a dedupe_key.");
  }
}

/**
 * Emit a timeline event and corresponding audit log.
 * 
 * @param supabase - Service role client (bypasses RLS)
 * @param event - The event to emit
 * @returns The created event ID, or null on failure (including dedupe conflicts)
 */
export async function emitTimelineEvent(
  supabase: SupabaseClient,
  event: TimelineEventInput,
): Promise<string | null> {
  try {
    // Validate before insert
    validateEvent(event);

    // Sanitise metadata: strip any raw content fields
    const safeMetadata = sanitiseMetadata(event.metadata || {});

    const { data, error } = await supabase
      .from("client_timeline_events")
      .insert({
        tenant_id: event.tenant_id,
        client_id: event.client_id,
        event_type: event.event_type,
        title: event.title,
        body: event.body || null,
        source: event.source,
        visibility: event.visibility || "internal",
        entity_type: event.entity_type || null,
        entity_id: event.entity_id || null,
        package_id: event.package_id || null,
        metadata: safeMetadata,
        created_by: event.created_by || null,
        occurred_at: event.occurred_at || new Date().toISOString(),
        dedupe_key: event.dedupe_key || null,
      })
      .select("id")
      .single();

    if (error) {
      // Dedupe conflict is expected — not an error
      if (error.code === "23505" && event.dedupe_key) {
        console.log("Timeline event deduped:", event.dedupe_key);
        return null;
      }
      console.error("Failed to emit timeline event:", error.message);
      return null;
    }

    // Audit log (fire and forget, don't block)
    supabase.from("audit_events").insert({
      entity: "client_timeline_events",
      entity_id: data.id,
      action: `timeline_${event.event_type}`,
      user_id: event.created_by || null,
      details: {
        tenant_id: event.tenant_id,
        client_id: event.client_id,
        event_type: event.event_type,
        source: event.source,
        visibility: event.visibility || "internal",
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        package_id: event.package_id,
        dedupe_key: event.dedupe_key || null,
      },
    }).then(() => {});

    return data.id;
  } catch (err) {
    console.error("emitTimelineEvent exception:", err);
    return null;
  }
}

/**
 * Emit both an internal and client-visible event for published outputs.
 * Used for actions like publishing minutes PDF where Vivacity sees the internal
 * event and clients see a sanitised client-visible event.
 */
export async function emitPublishEvents(
  supabase: SupabaseClient,
  event: Omit<TimelineEventInput, "visibility">,
  clientTitle?: string,
  clientBody?: string,
): Promise<{ internalId: string | null; clientId: string | null }> {
  const [internalId, clientId] = await Promise.all([
    emitTimelineEvent(supabase, {
      ...event,
      visibility: "internal",
      dedupe_key: event.dedupe_key ? `int_${event.dedupe_key}` : null,
    }),
    emitTimelineEvent(supabase, {
      ...event,
      visibility: "client",
      source: "unicorn", // Client events always show as Unicorn source
      title: clientTitle || event.title,
      body: clientBody || event.body,
      // Strip internal metadata for client event
      metadata: {
        entity_type: event.entity_type,
        entity_id: event.entity_id,
      },
      dedupe_key: event.dedupe_key ? `cli_${event.dedupe_key}` : null,
    }),
  ]);

  return { internalId, clientId };
}

/**
 * Emit multiple timeline events in a batch.
 */
export async function emitTimelineEvents(
  supabase: SupabaseClient,
  events: TimelineEventInput[],
): Promise<number> {
  let count = 0;
  for (const event of events) {
    const id = await emitTimelineEvent(supabase, event);
    if (id) count++;
  }
  return count;
}

/**
 * Remove potentially sensitive fields from metadata.
 * Never store raw message bodies, transcript text, or file contents.
 */
function sanitiseMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const BLOCKED_KEYS = [
    "body", "html_body", "text_body", "raw_content", "transcript",
    "recap_text", "message_body", "file_content", "raw_input",
  ];

  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (BLOCKED_KEYS.includes(key)) continue;
    // Truncate long string values
    if (typeof value === "string" && value.length > 500) {
      safe[key] = value.substring(0, 497) + "...";
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

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
}

/**
 * Emit a timeline event and corresponding audit log.
 * 
 * @param supabase - Service role client (bypasses RLS)
 * @param event - The event to emit
 * @returns The created event ID, or null on failure
 */
export async function emitTimelineEvent(
  supabase: SupabaseClient,
  event: TimelineEventInput,
): Promise<string | null> {
  try {
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
      })
      .select("id")
      .single();

    if (error) {
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
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        package_id: event.package_id,
      },
    }).then(() => {});

    return data.id;
  } catch (err) {
    console.error("emitTimelineEvent exception:", err);
    return null;
  }
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

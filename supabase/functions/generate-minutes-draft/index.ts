import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

// ── Helpers ──────────────────────────────────────────────────────────

interface GraphToken {
  access_token: string;
}

interface CalendarAttendee {
  display_name: string;
  email: string | null;
  is_external: boolean;
  attendance_status: string;
  source: string;
}

async function getUserGraphToken(
  supabase: ReturnType<typeof createClient>,
  userUuid: string
): Promise<GraphToken | null> {
  const { data, error } = await supabase
    .from("oauth_tokens")
    .select("access_token, expires_at")
    .eq("user_id", userUuid)
    .eq("provider", "microsoft")
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  return { access_token: data.access_token };
}

async function graphGet(token: string, path: string): Promise<any> {
  const res = await fetch(`${GRAPH_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Fetch Copilot recap from OneDrive files ─────────────────────────

const RECAP_NAME_PATTERNS = [
  /meeting\s*recap/i,
  /copilot\s*notes/i,
  /meeting\s*notes/i,
  /recap/i,
];

async function fetchCopilotRecap(
  token: string,
  meetingSubject: string | null,
  meetingStart: string | null,
  meetingEnd: string | null
): Promise<{ text: string | null; source: string | null; warning: string | null }> {
  try {
    // Strategy 1: Search OneDrive for recap files near the meeting time
    const searchQuery = meetingSubject
      ? `"${meetingSubject}" recap OR notes`
      : "meeting recap OR copilot notes";

    const searchResult = await graphGet(
      token,
      `/me/drive/root/search(q='${encodeURIComponent(searchQuery)}')?$top=10&$select=id,name,createdDateTime,lastModifiedDateTime,webUrl,file`
    );

    if (!searchResult?.value?.length) {
      return { text: null, source: null, warning: "Copilot recap not found in OneDrive." };
    }

    // Filter to files created around meeting time
    const candidates = searchResult.value.filter((file: any) => {
      if (!file.file) return false; // skip folders

      // Check name patterns
      const nameMatch = RECAP_NAME_PATTERNS.some((p) => p.test(file.name));
      if (!nameMatch) return false;

      // If we have meeting times, check proximity (within 24 hours after meeting end)
      if (meetingEnd) {
        const fileCreated = new Date(file.createdDateTime);
        const endTime = new Date(meetingEnd);
        const diffMs = fileCreated.getTime() - endTime.getTime();
        // File should be created within 24 hours after meeting end
        if (diffMs < -3600_000 || diffMs > 86_400_000) return false;
      }

      return true;
    });

    if (candidates.length === 0) {
      return { text: null, source: null, warning: "Copilot recap not found in OneDrive." };
    }

    // Pick the most recent candidate
    const bestFile = candidates.sort(
      (a: any, b: any) =>
        new Date(b.createdDateTime).getTime() - new Date(a.createdDateTime).getTime()
    )[0];

    // Download file content
    const contentRes = await fetch(
      `${GRAPH_BASE_URL}/me/drive/items/${bestFile.id}/content`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!contentRes.ok) {
      return { text: null, source: null, warning: "Could not download recap file." };
    }

    const contentType = contentRes.headers.get("content-type") || "";
    let text: string;

    if (contentType.includes("text") || contentType.includes("html")) {
      text = await contentRes.text();
      // Strip HTML tags if HTML
      if (contentType.includes("html")) {
        text = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    } else {
      // Binary file - can't parse
      return {
        text: null,
        source: null,
        warning: `Recap file found (${bestFile.name}) but format not supported for auto-extraction.`,
      };
    }

    return {
      text,
      source: `onedrive:${bestFile.id}`,
      warning: null,
    };
  } catch (err) {
    console.error("[generate-minutes-draft] Error fetching recap:", err);
    return { text: null, source: null, warning: "Error searching for Copilot recap." };
  }
}

// ── Fetch attendance report from OneDrive ───────────────────────────

async function fetchAttendanceReport(
  token: string,
  meetingSubject: string | null,
  meetingEnd: string | null
): Promise<{ attendees: CalendarAttendee[]; source: string; warning: string | null }> {
  try {
    const searchQuery = meetingSubject
      ? `"${meetingSubject}" attendance`
      : "attendance report";

    const searchResult = await graphGet(
      token,
      `/me/drive/root/search(q='${encodeURIComponent(searchQuery)}')?$top=10&$select=id,name,createdDateTime,file`
    );

    if (!searchResult?.value?.length) {
      return { attendees: [], source: "none", warning: "Attendance report not found." };
    }

    const candidates = searchResult.value.filter((file: any) => {
      if (!file.file) return false;
      if (!/attendance/i.test(file.name)) return false;
      if (meetingEnd) {
        const fileCreated = new Date(file.createdDateTime);
        const endTime = new Date(meetingEnd);
        const diffMs = fileCreated.getTime() - endTime.getTime();
        if (diffMs < -3600_000 || diffMs > 86_400_000) return false;
      }
      return true;
    });

    if (candidates.length === 0) {
      return { attendees: [], source: "none", warning: "Attendance report not found." };
    }

    const bestFile = candidates.sort(
      (a: any, b: any) =>
        new Date(b.createdDateTime).getTime() - new Date(a.createdDateTime).getTime()
    )[0];

    const contentRes = await fetch(
      `${GRAPH_BASE_URL}/me/drive/items/${bestFile.id}/content`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!contentRes.ok) {
      return { attendees: [], source: "none", warning: "Could not download attendance report." };
    }

    const text = await contentRes.text();
    const parsed = parseAttendanceCsv(text);

    return {
      attendees: parsed,
      source: `attendance_report:${bestFile.id}`,
      warning: null,
    };
  } catch (err) {
    console.error("[generate-minutes-draft] Error fetching attendance:", err);
    return { attendees: [], source: "none", warning: "Error searching for attendance report." };
  }
}

function parseAttendanceCsv(csvText: string): CalendarAttendee[] {
  const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Find header row (may have BOM or metadata rows before it)
  let headerIdx = lines.findIndex((l) =>
    /name/i.test(l) && /email/i.test(l)
  );
  if (headerIdx === -1) return [];

  const headers = lines[headerIdx].split(/[,\t]/).map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  const nameCol = headers.findIndex((h) => h === "name" || h === "full name" || h === "display name");
  const emailCol = headers.findIndex((h) => h === "email" || h === "email address");

  if (nameCol === -1) return [];

  const attendees: CalendarAttendee[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(/[,\t]/).map((c) => c.trim().replace(/"/g, ""));
    const name = cols[nameCol];
    if (!name) continue;
    const email = emailCol >= 0 ? cols[emailCol] || null : null;

    attendees.push({
      display_name: name,
      email,
      is_external: false, // will be resolved later
      attendance_status: "present",
      source: "attendance",
    });
  }

  return attendees;
}

// ── Extract minutes sections (same logic as extract-copilot-minutes) ─

const SECTION_PATTERNS: Record<string, RegExp[]> = {
  attendees: [
    /^#+\s*(?:attendees|participants|who attended)/i,
    /^(?:attendees|participants|who attended)\s*[:：]?\s*$/i,
  ],
  summary: [
    /^#+\s*(?:summary|recap|discussion|meeting summary|notes|meeting notes)/i,
    /^(?:summary|recap|discussion|meeting summary|notes|meeting notes)\s*[:：]?\s*$/i,
  ],
  decisions: [
    /^#+\s*(?:decisions|decisions made|agreed|resolutions)/i,
    /^(?:decisions|decisions made|agreed|resolutions)\s*[:：]?\s*$/i,
  ],
  actions: [
    /^#+\s*(?:action items?|actions|next steps|tasks|follow[- ]?ups?)/i,
    /^(?:action items?|actions|next steps|tasks|follow[- ]?ups?)\s*[:：]?\s*$/i,
  ],
};

function cleanBullet(line: string): string {
  return line.replace(/^[\s]*[-•*▪▸▹➤→>]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();
}

function parseActionLine(line: string): { action: string; owner: string; due_date: string } {
  const cleaned = cleanBullet(line);
  let owner = "TBD";
  let due_date = "";
  let action = cleaned;

  const ownerMatch = cleaned.match(/@(\w[\w\s]*?)(?:\s*[-–—]|\s*$)/);
  if (ownerMatch) {
    owner = ownerMatch[1].trim();
    action = action.replace(ownerMatch[0], " ").trim();
  }

  const dateMatch = cleaned.match(
    /(?:due|by|deadline|before)\s*:?\s*(\d{1,2}[\s/-]\w+[\s/-]\d{2,4}|\w+\s+\d{1,2},?\s*\d{2,4}|\d{4}-\d{2}-\d{2})/i
  );
  if (dateMatch) {
    due_date = dateMatch[1].trim();
    action = action.replace(dateMatch[0], " ").trim();
  }

  action = action.replace(/\s*[-–—]\s*$/, "").replace(/\s+/g, " ").trim();
  return { action: action || cleaned, owner, due_date };
}

function extractMinutesSections(text: string) {
  const lines = text.split("\n");
  const sections: Record<string, string[]> = {
    attendees: [], summary: [], decisions: [], actions: [],
  };

  let currentSection: string | null = null;
  for (const line of lines) {
    for (const [section, patterns] of Object.entries(SECTION_PATTERNS)) {
      if (patterns.some((p) => p.test(line.trim()))) {
        currentSection = section;
        break;
      }
    }
    if (currentSection && line.trim() && !Object.values(SECTION_PATTERNS).flat().some((p) => p.test(line.trim()))) {
      sections[currentSection].push(line);
    }
  }

  const attendees: string[] = [];
  for (const line of sections.attendees) {
    const cleaned = cleanBullet(line);
    if (cleaned) {
      const parts = cleaned.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      attendees.push(...parts);
    }
  }

  const summary = sections.summary.map((l) => cleanBullet(l) || l.trim()).filter(Boolean).join("\n");
  const decisions = sections.decisions.map((l) => cleanBullet(l)).filter(Boolean);
  const actions = sections.actions.map((l) => cleanBullet(l)).filter(Boolean).map((l) => {
    const parsed = parseActionLine(l);
    return { ...parsed, status: "Open" };
  });

  const confidence: Record<string, string> = {
    attendees: attendees.length > 0 ? "high" : "low",
    summary: summary.length > 20 ? "high" : summary.length > 0 ? "medium" : "low",
    decisions: decisions.length > 0 ? "high" : "low",
    actions: actions.length > 0 ? "high" : "low",
  };

  return { attendees: [...new Set(attendees)], summary, decisions, actions, confidence };
}

// ── Main handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify SuperAdmin
    const { data: userData } = await supabase
      .from("users")
      .select("role, full_name")
      .eq("user_uuid", user.id)
      .single();

    if (!userData || userData.role !== "SuperAdmin") {
      return new Response(JSON.stringify({ error: "Forbidden: Vivacity Team only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { meeting_id } = await req.json();
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: "meeting_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get meeting
    const { data: meeting, error: meetingErr } = await supabase
      .from("eos_meetings")
      .select("*")
      .eq("id", meeting_id)
      .single();

    if (meetingErr || !meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get feature flags
    const { data: settings } = await supabase
      .from("app_settings")
      .select("minutes_copilot_auto_fetch_enabled, minutes_copilot_auto_fetch_fallback_to_paste, minutes_store_raw_copilot_input")
      .single();

    const autoFetchEnabled = settings?.minutes_copilot_auto_fetch_enabled === true;
    const fallbackToPaste = settings?.minutes_copilot_auto_fetch_fallback_to_paste !== false;
    const storeRaw = settings?.minutes_store_raw_copilot_input === true;

    // Get Graph token
    const graphToken = await getUserGraphToken(supabase, user.id);
    const hasGraph = !!graphToken;

    const warnings: string[] = [];
    let graphSynced = false;
    let meetingSubject = meeting.title || null;
    let meetingStart = meeting.start_time || null;
    let meetingEnd = meeting.end_time || null;
    let msEventId = (meeting as any).ms_event_id || null;

    // ── Step 1: Sync meeting metadata from Graph ────────────────────
    if (hasGraph && msEventId) {
      const event = await graphGet(
        graphToken!.access_token,
        `/me/events/${encodeURIComponent(msEventId)}?$select=subject,start,end,organizer,attendees,onlineMeeting,webLink,location`
      );

      if (event) {
        meetingSubject = event.subject || meetingSubject;
        meetingStart = event.start?.dateTime || meetingStart;
        meetingEnd = event.end?.dateTime || meetingEnd;
        graphSynced = true;

        // Update meeting with synced metadata
        await supabase
          .from("eos_meetings")
          .update({
            ms_subject: event.subject,
            ms_start_at: event.start?.dateTime,
            ms_end_at: event.end?.dateTime,
            ms_organizer_email: event.organizer?.emailAddress?.address,
            ms_join_url: event.onlineMeeting?.joinUrl || event.webLink,
            ms_last_synced_at: new Date().toISOString(),
            ms_sync_status: "synced",
          })
          .eq("id", meeting_id);

        // Audit
        await supabase.from("audit_events").insert({
          entity: "eos_meetings",
          entity_id: meeting_id,
          action: "meeting_sync_metadata",
          user_id: user.id,
          details: { subject: event.subject, graph_synced: true },
        });
      }
    } else if (!hasGraph) {
      warnings.push("Microsoft Graph token not available. Using existing meeting data.");
    }

    // ── Step 2: Fetch attendees ─────────────────────────────────────
    let attendees: CalendarAttendee[] = [];
    let attendeeSource = "manual";

    // Try attendance report first (if Graph available)
    if (hasGraph && autoFetchEnabled) {
      const attendanceResult = await fetchAttendanceReport(
        graphToken!.access_token,
        meetingSubject,
        meetingEnd
      );

      if (attendanceResult.attendees.length > 0) {
        attendees = attendanceResult.attendees;
        attendeeSource = attendanceResult.source;

        await supabase.from("audit_events").insert({
          entity: "eos_meetings",
          entity_id: meeting_id,
          action: "attendance_report_auto_fetched",
          user_id: user.id,
          details: { count: attendees.length, source: attendeeSource },
        });
      } else {
        if (attendanceResult.warning) warnings.push(attendanceResult.warning);

        await supabase.from("audit_events").insert({
          entity: "eos_meetings",
          entity_id: meeting_id,
          action: "attendance_report_not_found",
          user_id: user.id,
          details: { warning: attendanceResult.warning },
        });
      }
    }

    // Fallback: calendar attendees from Graph event
    if (attendees.length === 0 && hasGraph && msEventId) {
      const event = await graphGet(
        graphToken!.access_token,
        `/me/events/${encodeURIComponent(msEventId)}?$select=attendees,organizer`
      );

      if (event?.attendees) {
        const organizerDomain = event.organizer?.emailAddress?.address
          ?.split("@")[1]
          ?.toLowerCase();

        for (const att of event.attendees) {
          const email = att.emailAddress?.address || null;
          const domain = email?.split("@")[1]?.toLowerCase();
          attendees.push({
            display_name: att.emailAddress?.name || email || "Unknown",
            email,
            is_external: organizerDomain && domain ? domain !== organizerDomain : false,
            attendance_status: att.status?.response === "accepted" ? "present" : "unknown",
            source: "calendar",
          });
        }
        attendeeSource = "calendar";
        warnings.push("Attendance report not available. Used calendar attendees.");
      }
    }

    // Final fallback: existing meeting participants
    if (attendees.length === 0) {
      const { data: participants } = await supabase
        .from("meeting_participants")
        .select("user_id, users!inner(full_name, email)")
        .eq("meeting_id", meeting_id);

      if (participants) {
        for (const p of participants) {
          const u = (p as any).users;
          attendees.push({
            display_name: u?.full_name || "Unknown",
            email: u?.email || null,
            is_external: false,
            attendance_status: "present",
            source: "participants",
          });
        }
        attendeeSource = "participants";
      }
    }

    // Deduplicate attendees by email
    const deduped = new Map<string, CalendarAttendee>();
    for (const att of attendees) {
      const key = att.email?.toLowerCase() || att.display_name.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, att);
      }
    }
    attendees = Array.from(deduped.values());

    // Log attendance sync
    await supabase.from("audit_events").insert({
      entity: "eos_meetings",
      entity_id: meeting_id,
      action: "meeting_sync_attendance",
      user_id: user.id,
      details: { count: attendees.length, source: attendeeSource },
    });

    // ── Step 3: Auto-fetch Copilot recap ────────────────────────────
    let recapText: string | null = null;
    let recapSource: string | null = null;
    let needsCopilotInput = true;

    if (hasGraph && autoFetchEnabled) {
      const recapResult = await fetchCopilotRecap(
        graphToken!.access_token,
        meetingSubject,
        meetingStart,
        meetingEnd
      );

      if (recapResult.text) {
        recapText = recapResult.text;
        recapSource = recapResult.source;
        needsCopilotInput = false;

        await supabase.from("audit_events").insert({
          entity: "eos_meetings",
          entity_id: meeting_id,
          action: "copilot_recap_auto_fetched",
          user_id: user.id,
          details: { source: recapSource, text_length: recapText.length },
        });
      } else {
        if (recapResult.warning) warnings.push(recapResult.warning);
        needsCopilotInput = fallbackToPaste;

        await supabase.from("audit_events").insert({
          entity: "eos_meetings",
          entity_id: meeting_id,
          action: "copilot_recap_not_found",
          user_id: user.id,
          details: { warning: recapResult.warning, fallback_to_paste: fallbackToPaste },
        });

        if (!fallbackToPaste) {
          warnings.push("Auto-fetch could not find recap and paste fallback is disabled by admin.");
        }
      }
    } else if (!autoFetchEnabled) {
      // Manual mode: always show paste modal
      needsCopilotInput = true;
    }

    // ── Step 4: Extract minutes if recap found ──────────────────────
    let extracted: ReturnType<typeof extractMinutesSections> | null = null;
    if (recapText) {
      extracted = extractMinutesSections(recapText);
    }

    // ── Step 5: Upsert minutes draft ────────────────────────────────
    const now = new Date().toISOString();
    const dateStr = meetingStart
      ? new Date(meetingStart).toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric" })
      : "";
    const timeStr = meetingStart
      ? new Date(meetingStart).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })
      : "";

    // Check for existing draft
    const { data: existingMinutes } = await supabase
      .from("meeting_minutes")
      .select("id, version, content")
      .eq("meeting_id", meeting_id)
      .order("version", { ascending: false })
      .limit(1);

    let minutesId: string;
    let version: number;

    const attendeeNames = attendees.map((a) => {
      const externalTag = a.is_external ? " (External)" : "";
      return a.email ? `${a.display_name} <${a.email}>${externalTag}` : `${a.display_name}${externalTag}`;
    });

    const contentPayload: Record<string, unknown> = {
      meeting_title: meetingSubject || meeting.title || "",
      meeting_date: dateStr,
      meeting_time: timeStr,
      meeting_type: (meeting as any).meeting_type || "",
      duration_minutes: 0,
      facilitator: userData.full_name || "",
      minute_taker: userData.full_name || "",
      attendees: attendeeNames,
      apologies: [],
      agenda_items: [],
      discussion_notes: extracted?.summary || "",
      decisions: extracted?.decisions || [],
      actions: extracted?.actions || [],
      next_meeting: "",
      source: recapText ? "copilot" : "manual",
      source_pasted_at: recapText ? now : null,
      source_pasted_by: recapText ? user.id : null,
    };

    if (extracted) {
      contentPayload.ai_notes = "Draft generated from Copilot. Review required.";
    }

    if (storeRaw && recapText) {
      contentPayload.raw_input = recapText;
    }

    if (existingMinutes && existingMinutes.length > 0) {
      const existing = existingMinutes[0];
      minutesId = existing.id;
      version = existing.version;

      // Merge: only overwrite sections that have new data
      const existingContent = typeof existing.content === "string"
        ? JSON.parse(existing.content)
        : existing.content || {};

      const mergedContent = { ...existingContent };

      // Always update attendees from sync
      mergedContent.attendees = attendeeNames;
      mergedContent.meeting_title = contentPayload.meeting_title || mergedContent.meeting_title;
      mergedContent.meeting_date = contentPayload.meeting_date || mergedContent.meeting_date;
      mergedContent.meeting_time = contentPayload.meeting_time || mergedContent.meeting_time;
      mergedContent.facilitator = contentPayload.facilitator || mergedContent.facilitator;

      // Only overwrite content sections if we extracted from recap
      if (extracted) {
        if (extracted.summary) mergedContent.discussion_notes = extracted.summary;
        if (extracted.decisions.length > 0) mergedContent.decisions = extracted.decisions;
        if (extracted.actions.length > 0) mergedContent.actions = extracted.actions;
        mergedContent.source = "copilot";
        mergedContent.source_pasted_at = now;
        mergedContent.source_pasted_by = user.id;
        mergedContent.ai_notes = "Draft generated from Copilot. Review required.";
      }

      if (storeRaw && recapText) {
        mergedContent.raw_input = recapText;
      }

      await supabase
        .from("meeting_minutes")
        .update({ content: mergedContent, updated_at: now })
        .eq("id", minutesId);
    } else {
      // Create new draft
      version = 1;
      const { data: newMinutes, error: insertErr } = await supabase
        .from("meeting_minutes")
        .insert({
          meeting_id,
          tenant_id: meeting.tenant_id,
          version: 1,
          status: "draft",
          title: `Minutes – ${meetingSubject || meeting.title || "Meeting"}`,
          content: contentPayload,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (insertErr || !newMinutes) {
        throw new Error(`Failed to create minutes draft: ${insertErr?.message}`);
      }
      minutesId = newMinutes.id;
    }

    return new Response(
      JSON.stringify({
        success: true,
        minutes_id: minutesId,
        version,
        attendees,
        attendees_count: attendees.length,
        graph_synced: graphSynced,
        auto_fetch_enabled: autoFetchEnabled,
        recap_found: !!recapText,
        recap_source: recapSource,
        extracted: extracted || null,
        needs_copilot_input: needsCopilotInput && !recapText,
        warnings,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-minutes-draft error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

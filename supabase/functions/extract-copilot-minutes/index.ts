import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Section detection patterns ──────────────────────────────────────
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

interface ExtractedMinutes {
  attendees: string[];
  summary: string;
  decisions: string[];
  actions: Array<{ action: string; owner: string; due_date: string; status: string }>;
  confidence: Record<string, string>;
}

function detectSection(line: string): string | null {
  for (const [section, patterns] of Object.entries(SECTION_PATTERNS)) {
    for (const p of patterns) {
      if (p.test(line.trim())) return section;
    }
  }
  return null;
}

function cleanBullet(line: string): string {
  return line.replace(/^[\s]*[-•*▪▸▹➤→>]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();
}

function parseActionLine(line: string): { action: string; owner: string; due_date: string } {
  const cleaned = cleanBullet(line);
  // Try patterns like "Do X - @Owner - Due: Jan 15"
  let owner = "TBD";
  let due_date = "";
  let action = cleaned;

  // Extract owner: @Name or "Owner: Name" or "- Name"
  const ownerMatch = cleaned.match(/@(\w[\w\s]*?)(?:\s*[-–—]|\s*$)/);
  if (ownerMatch) {
    owner = ownerMatch[1].trim();
    action = action.replace(ownerMatch[0], " ").trim();
  }

  // Extract due date patterns
  const dateMatch = cleaned.match(
    /(?:due|by|deadline|before)\s*:?\s*(\d{1,2}[\s/-]\w+[\s/-]\d{2,4}|\w+\s+\d{1,2},?\s*\d{2,4}|\d{4}-\d{2}-\d{2})/i
  );
  if (dateMatch) {
    due_date = dateMatch[1].trim();
    action = action.replace(dateMatch[0], " ").trim();
  }

  // Clean up leftover separators
  action = action.replace(/\s*[-–—]\s*$/, "").replace(/\s+/g, " ").trim();

  return { action: action || cleaned, owner, due_date };
}

function extractMinutes(text: string): ExtractedMinutes {
  const lines = text.split("\n");
  const sections: Record<string, string[]> = {
    attendees: [],
    summary: [],
    decisions: [],
    actions: [],
  };

  let currentSection: string | null = null;

  for (const line of lines) {
    const detected = detectSection(line);
    if (detected) {
      currentSection = detected;
      continue;
    }

    if (currentSection && line.trim()) {
      sections[currentSection].push(line);
    }
  }

  // Parse attendees
  const attendees: string[] = [];
  for (const line of sections.attendees) {
    const cleaned = cleanBullet(line);
    if (cleaned) {
      // Split by comma or semicolon if multiple on one line
      const parts = cleaned.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      attendees.push(...parts);
    }
  }
  const uniqueAttendees = [...new Set(attendees)];

  // Parse summary
  const summary = sections.summary
    .map((l) => cleanBullet(l) || l.trim())
    .filter(Boolean)
    .join("\n");

  // Parse decisions
  const decisions = sections.decisions
    .map((l) => cleanBullet(l))
    .filter(Boolean);

  // Parse actions
  const actions = sections.actions
    .map((l) => cleanBullet(l))
    .filter(Boolean)
    .map((l) => {
      const parsed = parseActionLine(l);
      return { ...parsed, status: "Open" };
    });

  // Confidence scoring
  const confidence: Record<string, string> = {
    attendees: uniqueAttendees.length > 0 ? "high" : "low",
    summary: summary.length > 20 ? "high" : summary.length > 0 ? "medium" : "low",
    decisions: decisions.length > 0 ? "high" : "low",
    actions: actions.length > 0 ? "high" : "low",
  };

  return { attendees: uniqueAttendees, summary, decisions, actions, confidence };
}

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check role is SuperAdmin (Vivacity team)
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("user_uuid", user.id)
      .single();

    if (!userData || userData.role !== "SuperAdmin") {
      return new Response(JSON.stringify({ error: "Forbidden: Vivacity Team only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { meeting_id, pasted_text } = await req.json();
    if (!meeting_id || !pasted_text || typeof pasted_text !== "string") {
      return new Response(JSON.stringify({ error: "meeting_id and pasted_text are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract structured data
    const extracted = extractMinutes(pasted_text);

    // Check if raw storage is enabled
    const { data: settings } = await supabase
      .from("app_settings")
      .select("minutes_store_raw_copilot_input")
      .single();

    const storeRaw = settings?.minutes_store_raw_copilot_input === true;

    // Audit log (do NOT log raw text)
    await supabase.from("audit_events").insert({
      entity: "meeting_minutes",
      entity_id: meeting_id,
      action: "minutes_copilot_extract_run",
      user_id: user.id,
      details: {
        meeting_id,
        counts: {
          attendees: extracted.attendees.length,
          decisions: extracted.decisions.length,
          actions: extracted.actions.length,
        },
        confidence: extracted.confidence,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        extracted,
        store_raw: storeRaw,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("extract-copilot-minutes error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

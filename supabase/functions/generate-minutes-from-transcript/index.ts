import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID')!;
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

interface TokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope?: string;
}

// ── Token refresh (shared with sync-meeting-artifacts) ───────────────

async function refreshTokenIfNeeded(
  supabaseAdmin: SupabaseClient,
  userId: string,
  token: TokenRecord
): Promise<string> {
  const expiresAt = new Date(token.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return token.access_token;
  }

  const resp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
      scope: token.scope || 'openid profile email offline_access Calendars.Read Files.Read.All',
    }),
  });

  if (!resp.ok) throw new Error('Token refresh failed');
  const tokens = await resp.json();
  const newExp = new Date(Date.now() + tokens.expires_in * 1000);

  await supabaseAdmin.from('oauth_tokens').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || token.refresh_token,
    expires_at: newExp.toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId).eq('provider', 'microsoft');

  return tokens.access_token;
}

// ── VTT/TXT parser ──────────────────────────────────────────────────

function normalizeTranscriptText(raw: string, format: string): string {
  if (format === 'vtt') {
    // Remove WEBVTT header, timestamps, and speaker labels
    return raw
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        if (trimmed === 'WEBVTT') return false;
        if (trimmed === 'NOTE') return false;
        if (/^\d+$/.test(trimmed)) return false; // sequence numbers
        if (/^\d{2}:\d{2}/.test(trimmed)) return false; // timestamps
        if (trimmed.startsWith('Kind:') || trimmed.startsWith('Language:')) return false;
        return true;
      })
      .map(line => line.replace(/<[^>]*>/g, '').trim()) // strip HTML tags
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  // Plain text: just normalize whitespace
  return raw.replace(/\s+/g, ' ').trim();
}

// ── Chunk text for context window ───────────────────────────────────

function chunkText(text: string, maxChars: number = 12000): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('. ', end);
      if (lastPeriod > start + maxChars * 0.5) end = lastPeriod + 2;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

// ── AI summarization ────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a professional meeting minutes assistant for Vivacity Coaching & Consulting, an RTO compliance consultancy.

Given a meeting transcript, extract structured minutes. Return a JSON object with these fields:

{
  "agenda_items": ["topic1", "topic2"],
  "discussion_notes": "Bullet-point summary of key discussion points, grouped by topic.",
  "decisions": ["decision1", "decision2"],
  "actions": [
    {"action": "description", "owner": "Name or TBD", "due_date": "YYYY-MM-DD or empty", "status": "Open"}
  ],
  "risks": ["risk1"],
  "open_questions": ["question1"],
  "confidence": {
    "agenda_items": "high|medium|low",
    "discussion_notes": "high|medium|low",
    "decisions": "high|medium|low",
    "actions": "high|medium|low"
  }
}

Rules:
- Never invent names. Use "TBD" or "Unassigned" if unclear.
- Never include raw transcript text. Summarize only.
- Be concise but capture all actionable items.
- If a section has no content, return an empty array or empty string.
- Set confidence to "low" if the transcript is unclear for that section.
- Focus on compliance, audit, and RTO-relevant content when present.`;

interface AiMinutesOutput {
  agenda_items: string[];
  discussion_notes: string;
  decisions: string[];
  actions: Array<{ action: string; owner: string; due_date: string; status: string }>;
  risks: string[];
  open_questions: string[];
  confidence: Record<string, string>;
}

async function generateMinutesFromTranscript(transcriptText: string): Promise<{ result: AiMinutesOutput; tokenUsage: any }> {
  const chunks = chunkText(transcriptText);

  // For multi-chunk, summarize chunks first then combine
  let combinedText = transcriptText;
  if (chunks.length > 1) {
    // Summarize each chunk, then combine
    const summaries: string[] = [];
    for (const chunk of chunks) {
      const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: 'Summarize this meeting transcript section concisely, preserving all decisions, actions, and key discussion points. Keep names and dates exact.' },
            { role: 'user', content: chunk },
          ],
        }),
      });
      if (!resp.ok) throw new Error(`AI chunk summary failed: ${resp.status}`);
      const data = await resp.json();
      summaries.push(data.choices[0].message.content);
    }
    combinedText = summaries.join('\n\n');
  }

  // Final structured extraction
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Extract structured meeting minutes from this transcript:\n\n${combinedText}` },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'extract_minutes',
          description: 'Extract structured meeting minutes from transcript',
          parameters: {
            type: 'object',
            properties: {
              agenda_items: { type: 'array', items: { type: 'string' } },
              discussion_notes: { type: 'string' },
              decisions: { type: 'array', items: { type: 'string' } },
              actions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    action: { type: 'string' },
                    owner: { type: 'string' },
                    due_date: { type: 'string' },
                    status: { type: 'string' },
                  },
                  required: ['action', 'owner', 'due_date', 'status'],
                },
              },
              risks: { type: 'array', items: { type: 'string' } },
              open_questions: { type: 'array', items: { type: 'string' } },
              confidence: {
                type: 'object',
                properties: {
                  agenda_items: { type: 'string', enum: ['high', 'medium', 'low'] },
                  discussion_notes: { type: 'string', enum: ['high', 'medium', 'low'] },
                  decisions: { type: 'string', enum: ['high', 'medium', 'low'] },
                  actions: { type: 'string', enum: ['high', 'medium', 'low'] },
                },
                required: ['agenda_items', 'discussion_notes', 'decisions', 'actions'],
              },
            },
            required: ['agenda_items', 'discussion_notes', 'decisions', 'actions', 'risks', 'open_questions', 'confidence'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'extract_minutes' } },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error('AI rate limited. Try again shortly.');
    if (response.status === 402) throw new Error('AI credits exhausted. Contact admin.');
    throw new Error(`AI extraction failed: ${response.status}`);
  }

  const data = await response.json();
  const tokenUsage = data.usage || null;

  // Extract from tool call
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error('AI did not return structured output');
  }

  const result = JSON.parse(toolCall.function.arguments) as AiMinutesOutput;
  return { result, tokenUsage };
}

// ── Main handler ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { meeting_id, minutes_id } = await req.json();
    if (!meeting_id || !minutes_id) {
      return new Response(JSON.stringify({ error: 'meeting_id and minutes_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify Vivacity team
    const { data: userRecord } = await supabaseAdmin
      .from('users')
      .select('is_vivacity_internal')
      .eq('user_uuid', user.id)
      .single();

    if (!userRecord?.is_vivacity_internal) {
      return new Response(JSON.stringify({ error: 'Vivacity team only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check AI enabled
    const { data: settings } = await supabaseAdmin
      .from('app_settings')
      .select('minutes_ai_enabled')
      .single();

    if (!settings?.minutes_ai_enabled) {
      return new Response(JSON.stringify({ error: 'AI minutes generation is disabled' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find transcript artifact
    const { data: artifacts } = await supabaseAdmin
      .from('meeting_artifacts')
      .select('*')
      .eq('meeting_id', meeting_id)
      .eq('artifact_type', 'transcript')
      .eq('visibility', 'internal');

    const transcript = artifacts?.find(a => a.drive_id && a.item_id);
    if (!transcript) {
      return new Response(JSON.stringify({ error: 'No transcript artifact found for this meeting' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get meeting for owner token
    const { data: meeting } = await supabaseAdmin
      .from('meetings')
      .select('owner_user_uuid, tenant_id')
      .eq('id', meeting_id)
      .single();

    if (!meeting) {
      return new Response(JSON.stringify({ error: 'Meeting not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create AI run record
    const { data: aiRun } = await supabaseAdmin
      .from('meeting_minutes_ai_runs')
      .insert({
        tenant_id: meeting.tenant_id,
        meeting_id,
        minutes_id,
        transcript_artifact_id: transcript.id,
        status: 'started',
        created_by: user.id,
      })
      .select('id')
      .single();

    const runId = aiRun?.id;

    // Audit: run started
    await supabaseAdmin.from('audit_events').insert({
      entity: 'meeting_minutes',
      entity_id: minutes_id,
      action: 'minutes_ai_run_started',
      user_id: user.id,
      details: { meeting_id, transcript_artifact_id: transcript.id, run_id: runId },
    });

    try {
      // Get OAuth token for meeting owner
      const { data: tokenRecord } = await supabaseAdmin
        .from('oauth_tokens')
        .select('*')
        .eq('user_id', meeting.owner_user_uuid)
        .eq('provider', 'microsoft')
        .single();

      if (!tokenRecord) throw new Error('Microsoft account not connected for meeting owner');

      const accessToken = await refreshTokenIfNeeded(supabaseAdmin, meeting.owner_user_uuid, tokenRecord as TokenRecord);

      // Download transcript content (transient, never stored)
      const driveUrl = `https://graph.microsoft.com/v1.0/drives/${transcript.drive_id}/items/${transcript.item_id}/content`;
      const fileResp = await fetch(driveUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!fileResp.ok) throw new Error(`Failed to download transcript: ${fileResp.status}`);

      const rawText = await fileResp.text();

      // Detect format from file extension in title or web_url
      const titleLower = (transcript.title || transcript.web_url || '').toLowerCase();
      const format = titleLower.endsWith('.vtt') ? 'vtt' : 'txt';

      // Normalize (remove timestamps etc)
      const normalizedText = normalizeTranscriptText(rawText, format);

      if (normalizedText.length < 50) {
        throw new Error('Transcript too short to generate meaningful minutes');
      }

      // Generate structured minutes via AI
      const { result, tokenUsage } = await generateMinutesFromTranscript(normalizedText);

      // Update AI run as success
      await supabaseAdmin.from('meeting_minutes_ai_runs').update({
        status: 'success',
        finished_at: new Date().toISOString(),
        token_usage: tokenUsage,
      }).eq('id', runId);

      // Audit: run success
      await supabaseAdmin.from('audit_events').insert({
        entity: 'meeting_minutes',
        entity_id: minutes_id,
        action: 'minutes_ai_run_success',
        user_id: user.id,
        details: {
          meeting_id,
          run_id: runId,
          sections_generated: Object.keys(result.confidence),
        },
      });

      // Return result for preview (do NOT auto-apply)
      return new Response(JSON.stringify({
        success: true,
        run_id: runId,
        proposed: result,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      // Do not log transcript text in error
      const safeError = errorMsg.substring(0, 200);

      await supabaseAdmin.from('meeting_minutes_ai_runs').update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: safeError,
      }).eq('id', runId);

      await supabaseAdmin.from('audit_events').insert({
        entity: 'meeting_minutes',
        entity_id: minutes_id,
        action: 'minutes_ai_run_failed',
        user_id: user.id,
        details: { meeting_id, run_id: runId, error: safeError },
      });

      console.error('[generate-minutes] AI run failed:', safeError);

      return new Response(JSON.stringify({ error: safeError }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('[generate-minutes] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

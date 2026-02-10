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

interface TokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  tenant_id: number;
  scope?: string;
}

export interface ArtifactResult {
  artifact_type: 'recording' | 'transcript' | 'shared_file';
  title: string;
  web_url: string;
  drive_id: string | null;
  item_id: string | null;
  metadata: Record<string, unknown>;
}

// ── File-type detection ──────────────────────────────────────────────

/** Known recording MIME types */
const RECORDING_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/x-matroska',
  'video/quicktime',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
]);

/** Known transcript MIME types */
const TRANSCRIPT_MIME_TYPES = new Set([
  'text/vtt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/plain',
  'application/json', // some transcript formats
]);

/** File extensions → artifact type */
const RECORDING_EXTENSIONS = new Set([
  '.mp4', '.webm', '.mkv', '.mov', '.m4a', '.mp3', '.ogg', '.wav',
]);

const TRANSCRIPT_EXTENSIONS = new Set([
  '.vtt', '.srt', '.txt',
]);

/**
 * Classify a file as recording, transcript, or shared_file
 * using mimeType first, then file extension, then name heuristics.
 */
export function classifyArtifact(
  fileName: string,
  mimeType?: string | null,
): 'recording' | 'transcript' | 'shared_file' {
  const nameLower = (fileName || '').toLowerCase();

  // 1. MIME type check (most reliable)
  if (mimeType) {
    const mime = mimeType.toLowerCase();
    if (RECORDING_MIME_TYPES.has(mime)) return 'recording';
    if (TRANSCRIPT_MIME_TYPES.has(mime)) {
      // .docx could be a transcript if name suggests it, otherwise shared_file
      if (mime.includes('wordprocessing') && !nameLower.includes('transcript')) {
        return 'shared_file';
      }
      return 'transcript';
    }
  }

  // 2. Extension check
  const dotIdx = nameLower.lastIndexOf('.');
  if (dotIdx >= 0) {
    const ext = nameLower.slice(dotIdx);
    if (RECORDING_EXTENSIONS.has(ext)) return 'recording';
    if (TRANSCRIPT_EXTENSIONS.has(ext)) return 'transcript';
  }

  // 3. Name heuristics
  if (nameLower.includes('transcript')) return 'transcript';
  if (nameLower.includes('recording') || nameLower.includes('meeting_recording')) return 'recording';

  return 'shared_file';
}

// ── Link extraction ──────────────────────────────────────────────────

/**
 * Parse SharePoint/OneDrive links from HTML body content.
 */
export function extractSharePointLinks(htmlBody: string): string[] {
  const links: string[] = [];
  const urlRegex = /https?:\/\/[a-zA-Z0-9.-]+\.sharepoint\.com\/[^\s"'<>]+|https?:\/\/[a-zA-Z0-9.-]+\-my\.sharepoint\.com\/[^\s"'<>]+|https?:\/\/onedrive\.live\.com\/[^\s"'<>]+/gi;

  let match;
  while ((match = urlRegex.exec(htmlBody)) !== null) {
    const url = match[0].replace(/[&;]amp;/g, '&');
    if (!links.includes(url)) {
      links.push(url);
    }
  }
  return links;
}

// ── Token refresh ────────────────────────────────────────────────────

async function refreshTokenIfNeeded(
  supabaseAdmin: SupabaseClient,
  userId: string,
  token: TokenRecord
): Promise<string> {
  const expiresAt = new Date(token.expires_at);
  const now = new Date();

  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return token.access_token;
  }

  const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
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

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('[sync-artifacts] Token refresh failed:', errorText);
    throw new Error('Failed to refresh token - user may need to reconnect');
  }

  const tokens = await tokenResponse.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await supabaseAdmin.from('oauth_tokens').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || token.refresh_token,
    expires_at: newExpiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId).eq('provider', 'microsoft');

  return tokens.access_token;
}

// ── Graph helpers ────────────────────────────────────────────────────

async function fetchEventDetails(accessToken: string, eventId: string) {
  const url = `https://graph.microsoft.com/v1.0/me/events/${eventId}?$select=id,iCalUId,subject,body,start,end,location,organizer,attendees,onlineMeeting,webLink,isCancelled,sensitivity`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Graph event fetch failed (${res.status}): ${errText}`);
  }

  return await res.json();
}

async function resolveShareLink(
  accessToken: string,
  shareUrl: string
): Promise<{
  driveId: string;
  itemId: string;
  name: string;
  webUrl: string;
  isFolder: boolean;
  mimeType?: string;
} | null> {
  try {
    const base64 = btoa(shareUrl);
    const shareId = 'u!' + base64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem?$select=id,name,webUrl,folder,parentReference,file`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      const _body = await res.text(); // consume body
      console.warn(`[sync-artifacts] Could not resolve share link: ${res.status}`);
      return null;
    }

    const item = await res.json();
    return {
      driveId: item.parentReference?.driveId || '',
      itemId: item.id,
      name: item.name,
      webUrl: item.webUrl,
      isFolder: !!item.folder,
      mimeType: item.file?.mimeType || undefined,
    };
  } catch (err) {
    console.warn('[sync-artifacts] Share link resolution error:', err);
    return null;
  }
}

/**
 * Discover recordings and transcripts from OneDrive Recordings folder.
 * Uses classifyArtifact for reliable type detection.
 */
export async function discoverRecordings(
  accessToken: string,
  meetingStart: string,
  meetingEnd: string
): Promise<ArtifactResult[]> {
  const artifacts: ArtifactResult[] = [];

  try {
    const recordingsUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/Recordings:/children?$select=id,name,webUrl,createdDateTime,parentReference,file&$orderby=createdDateTime desc&$top=20`;

    const res = await fetch(recordingsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 404) {
        const _body = await res.text();
        console.log('[sync-artifacts] No Recordings folder found in OneDrive');
        return artifacts;
      }
      const _body = await res.text();
      console.warn(`[sync-artifacts] Recordings folder fetch failed: ${res.status}`);
      return artifacts;
    }

    const data = await res.json();
    const items = data.value || [];

    // Expand window: 30 min before, 60 min after
    const windowStart = new Date(new Date(meetingStart).getTime() - 30 * 60 * 1000);
    const windowEnd = new Date(new Date(meetingEnd).getTime() + 60 * 60 * 1000);

    for (const item of items) {
      if (!item.createdDateTime || !item.file) continue;

      const created = new Date(item.createdDateTime);
      if (created >= windowStart && created <= windowEnd) {
        const artifactType = classifyArtifact(item.name, item.file?.mimeType);

        // Only capture recordings and transcripts from this folder
        if (artifactType === 'shared_file') continue;

        artifacts.push({
          artifact_type: artifactType,
          title: item.name,
          web_url: item.webUrl || '',
          drive_id: item.parentReference?.driveId || null,
          item_id: item.id || null,
          metadata: {
            created_at: item.createdDateTime,
            size: item.file?.size || null,
            mime_type: item.file?.mimeType || null,
            source: 'onedrive_recordings',
          },
        });
      }
    }
  } catch (err) {
    console.warn('[sync-artifacts] Recordings discovery error:', err);
  }

  return artifacts;
}

// ── Main handler ─────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[sync-artifacts] Request received');

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const meetingId: string = body?.meeting_id;

    if (!meetingId) {
      return new Response(
        JSON.stringify({ error: 'meeting_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the meeting
    const { data: meeting, error: meetingError } = await supabaseAdmin
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .single();

    if (meetingError || !meeting) {
      return new Response(
        JSON.stringify({ error: 'Meeting not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify access: must be owner or Vivacity staff
    const { data: userRecord } = await supabaseAdmin
      .from('users')
      .select('is_vivacity_internal, role')
      .eq('user_uuid', user.id)
      .single();

    const isOwner = meeting.owner_user_uuid === user.id;
    const isVivacity = userRecord?.is_vivacity_internal === true;

    if (!isOwner && !isVivacity) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get OAuth token for the meeting owner
    const tokenUserId = meeting.owner_user_uuid;
    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from('oauth_tokens')
      .select('*')
      .eq('user_id', tokenUserId)
      .eq('provider', 'microsoft')
      .single();

    if (tokenError || !tokenRecord) {
      await supabaseAdmin.from('meetings').update({
        ms_sync_status: 'error',
        ms_sync_error: 'Microsoft account not connected',
      }).eq('id', meetingId);

      return new Response(
        JSON.stringify({ error: 'Microsoft account not connected for meeting owner' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh token
    let accessToken: string;
    try {
      accessToken = await refreshTokenIfNeeded(supabaseAdmin, tokenUserId, tokenRecord as TokenRecord);
    } catch (refreshErr) {
      await supabaseAdmin.from('meetings').update({
        ms_sync_status: 'error',
        ms_sync_error: 'Token expired - reconnect Microsoft',
      }).eq('id', meetingId);

      return new Response(
        JSON.stringify({ error: 'Token expired. Please reconnect Microsoft.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch event details from Graph
    const eventId = meeting.external_event_id;
    if (!eventId) {
      await supabaseAdmin.from('meetings').update({
        ms_sync_status: 'error',
        ms_sync_error: 'No external event ID on meeting',
      }).eq('id', meetingId);

      return new Response(
        JSON.stringify({ error: 'Meeting has no external event ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[sync-artifacts] Fetching event details for:', eventId);

    let graphEvent: any;
    try {
      graphEvent = await fetchEventDetails(accessToken, eventId);
    } catch (fetchErr) {
      const errMsg = fetchErr instanceof Error ? fetchErr.message : 'Graph API error';
      await supabaseAdmin.from('meetings').update({
        ms_sync_status: 'error',
        ms_sync_error: errMsg,
      }).eq('id', meetingId);

      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert meeting MS fields (initially synced, may become warning below)
    const meetingUpdate: Record<string, unknown> = {
      ms_ical_uid: graphEvent.iCalUId || null,
      ms_join_url: graphEvent.onlineMeeting?.joinUrl || meeting.external_meeting_url,
      ms_organizer_email: graphEvent.organizer?.emailAddress?.address || null,
      ms_last_synced_at: new Date().toISOString(),
      ms_sync_status: 'synced',
      ms_sync_error: null,
      updated_at: new Date().toISOString(),
    };

    if (graphEvent.onlineMeeting?.joinUrl && !meeting.external_meeting_url) {
      meetingUpdate.external_meeting_url = graphEvent.onlineMeeting.joinUrl;
    }

    // Upsert attendees as participants
    const attendees = graphEvent.attendees || [];
    if (attendees.length > 0) {
      await supabaseAdmin.from('meeting_participants').delete().eq('meeting_id', meetingId);

      const participants = attendees.map((a: any) => ({
        meeting_id: meetingId,
        participant_email: a.emailAddress?.address || '',
        participant_name: a.emailAddress?.name || null,
        participant_type: a.type === 'required' ? 'required' : (a.type === 'optional' ? 'optional' : 'required'),
      }));

      if (graphEvent.organizer?.emailAddress?.address) {
        participants.unshift({
          meeting_id: meetingId,
          participant_email: graphEvent.organizer.emailAddress.address,
          participant_name: graphEvent.organizer.emailAddress.name || null,
          participant_type: 'organizer',
        });
      }

      await supabaseAdmin.from('meeting_participants').insert(participants);
    }

    // ── Discover artifacts ───────────────────────────────────────────

    const allArtifacts: ArtifactResult[] = [];

    // 1. Parse event body for SharePoint/OneDrive links
    const bodyContent = graphEvent.body?.content || '';
    const shareLinks = extractSharePointLinks(bodyContent);
    console.log('[sync-artifacts] Found', shareLinks.length, 'SharePoint links in body');

    for (const link of shareLinks) {
      const resolved = await resolveShareLink(accessToken, link);
      if (resolved && !resolved.isFolder) {
        // Classify the resolved file
        const artifactType = classifyArtifact(resolved.name, resolved.mimeType);
        allArtifacts.push({
          artifact_type: artifactType,
          title: resolved.name,
          web_url: resolved.webUrl || link,
          drive_id: resolved.driveId,
          item_id: resolved.itemId,
          metadata: {
            source: 'event_body',
            original_url: link,
            mime_type: resolved.mimeType || null,
          },
        });
      } else if (!resolved) {
        // Classify unresolved link by URL path
        const pathName = (() => {
          try { return new URL(link).pathname.split('/').pop() || 'Shared File'; }
          catch { return 'Shared File'; }
        })();
        const artifactType = classifyArtifact(pathName);
        allArtifacts.push({
          artifact_type: artifactType,
          title: pathName,
          web_url: link,
          drive_id: null,
          item_id: null,
          metadata: { source: 'event_body', resolved: false },
        });
      }
    }

    // 2. Check OneDrive Recordings folder for recordings/transcripts
    const recordings = await discoverRecordings(
      accessToken,
      meeting.starts_at,
      meeting.ends_at
    );
    allArtifacts.push(...recordings);
    console.log('[sync-artifacts] Found', recordings.length, 'recordings/transcripts');

    // ── Warning: recording found but transcript missing ──────────────

    const hasRecording = allArtifacts.some(a => a.artifact_type === 'recording');
    const hasTranscript = allArtifacts.some(a => a.artifact_type === 'transcript');

    if (hasRecording && !hasTranscript) {
      meetingUpdate.ms_sync_status = 'warning';
      meetingUpdate.ms_sync_error = 'Recording found but transcript is missing. Transcript may still be processing.';
    }

    // Apply the meeting update (now includes possible warning)
    await supabaseAdmin.from('meetings').update(meetingUpdate).eq('id', meetingId);

    // ── Upsert artifacts ─────────────────────────────────────────────

    let artifactsCreated = 0;
    const artifactErrors: string[] = [];

    for (const artifact of allArtifacts) {
      const { error: artError } = await supabaseAdmin.from('meeting_artifacts').upsert({
        tenant_id: meeting.tenant_id,
        meeting_id: meetingId,
        artifact_type: artifact.artifact_type,
        title: artifact.title,
        web_url: artifact.web_url,
        drive_id: artifact.drive_id,
        item_id: artifact.item_id,
        captured_by: user.id,
        metadata: artifact.metadata,
      }, {
        onConflict: 'meeting_id,artifact_type,COALESCE(item_id, web_url)',
        ignoreDuplicates: false,
      });

      if (artError) {
        console.error('[sync-artifacts] Artifact upsert error:', artError);
        artifactErrors.push(`${artifact.title}: ${artError.message}`);
      } else {
        artifactsCreated++;
      }
    }

    // ── Auto-create structured meeting_minutes draft ────────────────

    let minutesDraftCreated = false;
    try {
      // Check if minutes already exist
      const { data: existingMinutes } = await supabaseAdmin
        .from('meeting_minutes')
        .select('id')
        .eq('meeting_id', meetingId)
        .maybeSingle();

      if (!existingMinutes) {
        const startTime = graphEvent.start?.dateTime
          ? new Date(graphEvent.start.dateTime + 'Z')
          : new Date(meeting.starts_at);
        const endTime = graphEvent.end?.dateTime
          ? new Date(graphEvent.end.dateTime + 'Z')
          : new Date(meeting.ends_at);
        const durationMins = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

        const attendeeNames = (graphEvent.attendees || [])
          .map((a: any) => a.emailAddress?.name || a.emailAddress?.address)
          .filter(Boolean);

        const dateStr = startTime.toISOString().split('T')[0];
        const timeStr = startTime.toISOString().split('T')[1]?.substring(0, 5) || '';

        const structuredContent = {
          meeting_title: meeting.title,
          meeting_date: dateStr,
          meeting_time: timeStr,
          duration_minutes: durationMins,
          attendees: attendeeNames,
          apologies: [],
          agenda_items: [],
          discussion_notes: '',
          decisions: [],
          actions: [],
          next_meeting: '',
        };

        const { error: minutesError } = await supabaseAdmin
          .from('meeting_minutes')
          .insert({
            tenant_id: meeting.tenant_id,
            meeting_id: meetingId,
            title: `Meeting Minutes - ${meeting.title} - ${dateStr}`,
            content: structuredContent,
            created_by: user.id,
          });

        if (minutesError) {
          console.warn('[sync-artifacts] Minutes creation failed:', minutesError);
        } else {
          minutesDraftCreated = true;
          console.log('[sync-artifacts] Structured minutes draft auto-created');
        }
      }
    } catch (draftErr) {
      console.warn('[sync-artifacts] Minutes draft error:', draftErr);
    }

    // ── Audit log ────────────────────────────────────────────────────

    await supabaseAdmin.from('audit_events').insert({
      entity: 'meeting',
      entity_id: meetingId,
      action: 'sync_artifacts',
      user_id: user.id,
      details: {
        artifacts_found: allArtifacts.length,
        artifacts_created: artifactsCreated,
        errors: artifactErrors,
        body_links: shareLinks.length,
        recordings_found: recordings.length,
        has_recording: hasRecording,
        has_transcript: hasTranscript,
        sync_status: meetingUpdate.ms_sync_status,
        minutes_draft_created: minutesDraftCreated,
      },
    });

    console.log('[sync-artifacts] Complete:', {
      artifacts_found: allArtifacts.length,
      artifacts_created: artifactsCreated,
      errors: artifactErrors.length,
      has_recording: hasRecording,
      has_transcript: hasTranscript,
      minutes_draft_created: minutesDraftCreated,
    });

    return new Response(
      JSON.stringify({
        success: true,
        meeting_id: meetingId,
        artifacts_found: allArtifacts.length,
        artifacts_created: artifactsCreated,
        errors: artifactErrors,
        has_recording: hasRecording,
        has_transcript: hasTranscript,
        ms_sync_status: meetingUpdate.ms_sync_status as string,
        ms_sync_error: meetingUpdate.ms_sync_error as string | null,
        minutes_draft_created: minutesDraftCreated,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[sync-artifacts] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

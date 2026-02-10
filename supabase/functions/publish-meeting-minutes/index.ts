import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const draftId: string = body?.draft_id;

    if (!draftId) {
      return new Response(
        JSON.stringify({ error: 'draft_id is required' }),
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

    // Verify Vivacity team
    const { data: userRecord } = await supabaseAdmin
      .from('users')
      .select('is_vivacity_internal, first_name, last_name')
      .eq('user_uuid', user.id)
      .single();

    if (!userRecord?.is_vivacity_internal) {
      return new Response(
        JSON.stringify({ error: 'Only Vivacity team can publish minutes' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the draft
    const { data: draft, error: draftError } = await supabaseAdmin
      .from('meeting_minutes_drafts')
      .select('*')
      .eq('id', draftId)
      .single();

    if (draftError || !draft) {
      return new Response(
        JSON.stringify({ error: 'Draft not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (draft.status === 'published') {
      return new Response(
        JSON.stringify({ error: 'Minutes already published' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!draft.content || draft.content.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Cannot publish empty minutes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get meeting details for context
    const { data: meeting } = await supabaseAdmin
      .from('meetings')
      .select('title, starts_at, client_id, tenant_id')
      .eq('id', draft.meeting_id)
      .single();

    const tenantId = draft.tenant_id || meeting?.tenant_id;

    // Create portal document for client visibility
    const publisherName = [userRecord.first_name, userRecord.last_name].filter(Boolean).join(' ') || 'Vivacity Team';
    const docTitle = draft.title || `Meeting Minutes - ${meeting?.title || 'Meeting'}`;

    // Create a text-based document in portal_documents
    const { data: portalDoc, error: portalError } = await supabaseAdmin
      .from('portal_documents')
      .insert({
        tenant_id: tenantId,
        file_name: `${docTitle}.txt`,
        file_type: 'text/plain',
        file_size: new TextEncoder().encode(draft.content).length,
        description: `Meeting minutes published by ${publisherName}`,
        uploaded_by: user.id,
        direction: 'outbound',
        is_client_visible: true,
        storage_path: null, // Content stored in draft, not in storage
      })
      .select('id')
      .single();

    if (portalError) {
      console.error('[publish-minutes] Portal doc creation failed:', portalError);
      return new Response(
        JSON.stringify({ error: 'Failed to create portal document' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update draft status to published
    const now = new Date().toISOString();
    await supabaseAdmin.from('meeting_minutes_drafts').update({
      status: 'published',
      published_at: now,
      published_by: user.id,
      portal_document_id: portalDoc.id,
      updated_at: now,
    }).eq('id', draftId);

    // Audit log
    await supabaseAdmin.from('audit_events').insert({
      entity: 'meeting_minutes_draft',
      entity_id: draftId,
      action: 'minutes_published',
      user_id: user.id,
      details: {
        meeting_id: draft.meeting_id,
        portal_document_id: portalDoc.id,
        tenant_id: tenantId,
        title: docTitle,
      },
    });

    console.log('[publish-minutes] Published:', { draftId, portalDocId: portalDoc.id });

    return new Response(
      JSON.stringify({
        success: true,
        draft_id: draftId,
        portal_document_id: portalDoc.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[publish-minutes] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

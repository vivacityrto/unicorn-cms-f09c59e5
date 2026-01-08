import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WorkerResult {
  success: boolean
  events_processed: number
  drafts_created: number
  errors: string[]
  tenant_id?: number
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  console.log('[outlook-time-draft-worker] Starting worker run')

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse optional tenant_id from body
    let targetTenantId: number | null = null
    try {
      const body = await req.json()
      targetTenantId = body?.tenant_id || null
    } catch {
      // No body or invalid JSON, process all tenants
    }

    console.log('[outlook-time-draft-worker] Target tenant:', targetTenantId || 'all')

    // Get ended events from last 48 hours that are confirmed
    const cutoffTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    let eventsQuery = supabase
      .from('calendar_events')
      .select('*')
      .eq('status', 'confirmed')
      .lte('end_at', now)
      .gte('end_at', cutoffTime)
      .order('end_at', { ascending: false })
      .limit(500)

    if (targetTenantId) {
      eventsQuery = eventsQuery.eq('tenant_id', targetTenantId)
    }

    const { data: events, error: eventsError } = await eventsQuery

    if (eventsError) {
      console.error('[outlook-time-draft-worker] Error fetching events:', eventsError)
      return new Response(
        JSON.stringify({ success: false, error: eventsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[outlook-time-draft-worker] Found ${events?.length || 0} ended events to process`)

    const results: WorkerResult = {
      success: true,
      events_processed: 0,
      drafts_created: 0,
      errors: []
    }

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify(results),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process each event
    for (const event of events) {
      results.events_processed++
      
      try {
        // Calculate duration in minutes
        const startAt = new Date(event.start_at)
        const endAt = new Date(event.end_at)
        const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000)
        const workDate = startAt.toISOString().split('T')[0]

        // Extract attendee emails
        const attendees = event.attendees as { email?: string }[]
        const attendeeEmails = attendees
          ?.filter(a => a?.email)
          ?.map(a => a.email!.toLowerCase()) || []

        // Get current processed list
        const processedUsers = (event.processed_users || []) as string[]

        // Find eligible users for this tenant
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select(`
            user_uuid,
            email,
            tenant_id
          `)
          .eq('tenant_id', event.tenant_id)

        if (usersError) {
          console.error(`[outlook-time-draft-worker] Error fetching users for tenant ${event.tenant_id}:`, usersError)
          results.errors.push(`Failed to fetch users for tenant ${event.tenant_id}`)
          continue
        }

        // Get user settings for this tenant
        const { data: allSettings } = await supabase
          .from('user_time_capture_settings')
          .select('*')
          .eq('tenant_id', event.tenant_id)

        const settingsMap = new Map<string, {
          auto_create_meeting_drafts: boolean
          min_minutes: number
          max_minutes: number
          include_organizer_only: boolean
        }>()

        for (const s of (allSettings || [])) {
          settingsMap.set(s.user_id, {
            auto_create_meeting_drafts: s.auto_create_meeting_drafts,
            min_minutes: s.min_minutes,
            max_minutes: s.max_minutes,
            include_organizer_only: s.include_organizer_only
          })
        }

        const newlyProcessed: string[] = []

        for (const user of (users || [])) {
          // Skip if already processed
          if (processedUsers.includes(user.user_uuid)) {
            continue
          }

          const userEmail = user.email?.toLowerCase() || ''
          const isOrganizer = userEmail === event.organizer_email?.toLowerCase()
          const isAttendee = attendeeEmails.includes(userEmail)

          // Get user settings (defaults if not set)
          const settings = settingsMap.get(user.user_uuid) || {
            auto_create_meeting_drafts: true,
            min_minutes: 10,
            max_minutes: 240,
            include_organizer_only: false
          }

          // Skip if auto-create is disabled
          if (!settings.auto_create_meeting_drafts) {
            newlyProcessed.push(user.user_uuid)
            continue
          }

          // Check if user is eligible based on organizer/attendee settings
          if (settings.include_organizer_only && !isOrganizer) {
            continue
          }

          if (!isOrganizer && !isAttendee) {
            continue
          }

          // Check duration bounds
          if (durationMinutes < settings.min_minutes || durationMinutes > settings.max_minutes) {
            continue
          }

          // Check if draft already exists
          const { data: existingDraft } = await supabase
            .from('calendar_time_drafts')
            .select('id')
            .eq('tenant_id', event.tenant_id)
            .eq('created_by', user.user_uuid)
            .eq('calendar_event_id', event.id)
            .in('status', ['draft', 'posted'])
            .limit(1)
            .single()

          if (existingDraft) {
            newlyProcessed.push(user.user_uuid)
            continue
          }

          // Create draft
          const { error: insertError } = await supabase
            .from('calendar_time_drafts')
            .insert({
              tenant_id: event.tenant_id,
              created_by: user.user_uuid,
              calendar_event_id: event.id,
              minutes: durationMinutes,
              work_date: workDate,
              notes: `Meeting: ${event.title}`,
              confidence: 0.7,
              suggestion: {
                source: 'auto_worker',
                event_title: event.title,
                organizer: event.organizer_email,
                created_at: new Date().toISOString()
              },
              status: 'draft'
            })

          if (insertError) {
            console.error(`[outlook-time-draft-worker] Error creating draft for user ${user.user_uuid}:`, insertError)
            results.errors.push(`Failed to create draft for ${user.email}: ${insertError.message}`)
            continue
          }

          results.drafts_created++
          newlyProcessed.push(user.user_uuid)
          console.log(`[outlook-time-draft-worker] Created draft for user ${user.email} from event "${event.title}"`)
        }

        // Update processed_users on the event
        if (newlyProcessed.length > 0) {
          const updatedProcessed = [...processedUsers, ...newlyProcessed]
          const { error: updateError } = await supabase
            .from('calendar_events')
            .update({
              processed_users: updatedProcessed,
              processed_at: new Date().toISOString()
            })
            .eq('id', event.id)

          if (updateError) {
            console.error(`[outlook-time-draft-worker] Error updating processed_users for event ${event.id}:`, updateError)
          }
        }
      } catch (eventError) {
        console.error(`[outlook-time-draft-worker] Error processing event ${event.id}:`, eventError)
        results.errors.push(`Error processing event ${event.id}: ${String(eventError)}`)
      }
    }

    console.log(`[outlook-time-draft-worker] Completed: ${results.events_processed} events, ${results.drafts_created} drafts created`)

    return new Response(
      JSON.stringify(results),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[outlook-time-draft-worker] Unexpected error:', error)
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

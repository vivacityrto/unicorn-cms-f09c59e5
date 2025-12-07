import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RecurrenceRequest {
  meeting_id: string;
  tenant_id: number;
  recurrence_type: 'weekly' | 'quarterly' | 'annual';
  start_date: string;
  start_time: string;
  duration_minutes: number;
  until_date?: string;
  timezone?: string;
}

// Helper: Get last Monday of a month
function getLastMonday(year: number, month: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const dayOfWeek = lastDay.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return new Date(year, month, lastDay.getDate() - daysToSubtract);
}

// Generate RRULE and occurrences
function generateOccurrences(req: RecurrenceRequest): { rrule: string; occurrences: Array<{ starts_at: string; ends_at: string }> } {
  const timezone = req.timezone || 'Australia/Sydney';
  const startDate = new Date(req.start_date + 'T' + req.start_time);
  const untilDate = req.until_date ? new Date(req.until_date) : null;
  const occurrences: Array<{ starts_at: string; ends_at: string }> = [];

  if (req.recurrence_type === 'weekly') {
    const rrule = `FREQ=WEEKLY;BYDAY=MO;INTERVAL=1${untilDate ? ';UNTIL=' + untilDate.toISOString().split('T')[0].replace(/-/g, '') : ''}`;
    
    // Generate next 12 weeks
    let currentDate = new Date(startDate);
    const maxOccurrences = 12;
    let count = 0;

    while (count < maxOccurrences && (!untilDate || currentDate <= untilDate)) {
      const starts = new Date(currentDate);
      const ends = new Date(currentDate);
      ends.setMinutes(ends.getMinutes() + req.duration_minutes);
      
      occurrences.push({
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
      });

      currentDate.setDate(currentDate.getDate() + 7);
      count++;
    }

    return { rrule, occurrences };
  }

  if (req.recurrence_type === 'quarterly') {
    const rrule = 'FREQ=YEARLY;BYMONTH=3,6,9;BYDAY=-1MO';
    
    // Generate next 4 quarters (skip Q4)
    const startYear = startDate.getFullYear();
    const quarterMonths = [2, 5, 8]; // March, June, September (0-indexed)

    for (let i = 0; i < 4; i++) {
      for (const month of quarterMonths) {
        const lastMonday = getLastMonday(startYear + Math.floor(i / 3), month);
        
        if (untilDate && lastMonday > untilDate) break;
        if (lastMonday >= startDate) {
          const [hours, minutes] = req.start_time.split(':').map(Number);
          lastMonday.setHours(hours, minutes, 0, 0);
          
          const starts = new Date(lastMonday);
          const ends = new Date(lastMonday);
          ends.setMinutes(ends.getMinutes() + req.duration_minutes);
          
          occurrences.push({
            starts_at: starts.toISOString(),
            ends_at: ends.toISOString(),
          });
        }
      }
    }

    return { rrule, occurrences };
  }

  if (req.recurrence_type === 'annual') {
    const rrule = 'FREQ=YEARLY;BYMONTH=12;BYDAY=-1MO';
    
    // Generate next 1 year
    const startYear = startDate.getFullYear();
    const lastMonday = getLastMonday(startYear, 11); // December (0-indexed)

    const [hours, minutes] = req.start_time.split(':').map(Number);
    lastMonday.setHours(hours, minutes, 0, 0);

    if (lastMonday >= startDate && (!untilDate || lastMonday <= untilDate)) {
      const starts = new Date(lastMonday);
      const ends = new Date(lastMonday);
      ends.setMinutes(ends.getMinutes() + req.duration_minutes);
      
      occurrences.push({
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
      });
    }

    return { rrule, occurrences };
  }

  throw new Error('Invalid recurrence type');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const requestData: RecurrenceRequest = await req.json();

    console.log('Generating recurrence for:', requestData);

    // Generate RRULE and occurrences
    const { rrule, occurrences } = generateOccurrences(requestData);

    console.log('Generated RRULE:', rrule);
    console.log('Generated occurrences:', occurrences.length);

    // Create recurrence record
    const { data: recurrence, error: recurrenceError } = await supabase
      .from('eos_meeting_recurrences')
      .insert({
        meeting_id: requestData.meeting_id,
        tenant_id: requestData.tenant_id,
        recurrence_type: requestData.recurrence_type,
        rrule: rrule,
        start_date: requestData.start_date + 'T' + requestData.start_time,
        until_date: requestData.until_date || null,
        timezone: requestData.timezone || 'Australia/Sydney',
      })
      .select()
      .single();

    if (recurrenceError) {
      console.error('Error creating recurrence:', recurrenceError);
      throw recurrenceError;
    }

    console.log('Created recurrence:', recurrence.id);

    // Create occurrence records
    const occurrenceRecords = occurrences.map(occ => ({
      recurrence_id: recurrence.id,
      tenant_id: requestData.tenant_id,
      starts_at: occ.starts_at,
      ends_at: occ.ends_at,
      status: 'scheduled',
      is_generated: true,
    }));

    const { data: createdOccurrences, error: occurrencesError } = await supabase
      .from('eos_meeting_occurrences')
      .insert(occurrenceRecords)
      .select();

    if (occurrencesError) {
      console.error('Error creating occurrences:', occurrencesError);
      throw occurrencesError;
    }

    console.log('Created occurrences:', createdOccurrences.length);

    return new Response(
      JSON.stringify({
        success: true,
        recurrence_id: recurrence.id,
        occurrences_count: createdOccurrences.length,
        occurrences: createdOccurrences,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in generate-meeting-recurrence:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

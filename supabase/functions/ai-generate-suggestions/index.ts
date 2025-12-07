import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { meeting_id, tenant_id } = await req.json();
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Fetch meeting context data
    const { data: scorecardData } = await supabaseClient
      .from('eos_scorecard_entries')
      .select('*, metric:eos_scorecard_metrics(*)')
      .eq('tenant_id', tenant_id)
      .order('week_ending', { ascending: false })
      .limit(13);

    const { data: issues } = await supabaseClient
      .from('eos_issues')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('status', 'Open')
      .order('created_at', { ascending: false });

    const { data: rocks } = await supabaseClient
      .from('eos_rocks')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('status', 'off_track')
      .order('due_date', { ascending: true });

    const { data: todos } = await supabaseClient
      .from('eos_todos')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('status', 'Open')
      .order('due_date', { ascending: true });

    // Generate AI suggestions using Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const prompt = `You are an EOS (Entrepreneurial Operating System) meeting assistant. Analyze the following data and provide 3-5 actionable suggestions for the facilitator.

Scorecard Data (last 13 weeks):
${JSON.stringify(scorecardData, null, 2)}

Open Issues:
${JSON.stringify(issues, null, 2)}

Off-Track Rocks:
${JSON.stringify(rocks, null, 2)}

Overdue To-Dos:
${JSON.stringify(todos?.filter(t => t.due_date && new Date(t.due_date) < new Date()), null, 2)}

Provide suggestions in the following categories:
1. Issues to prioritize (suggest 2-3 top issues for IDS based on urgency and impact)
2. Potential new issues (identify patterns or anomalies in metrics that should become issues)
3. To-do suggestions (propose specific to-dos with owners and due dates)

Format your response as a JSON array of suggestion objects with: type (issue/priority/todo), title, description, priority (1-5), and suggested_owner_id.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a helpful EOS meeting assistant. Always respond with valid JSON.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API Error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const suggestions = JSON.parse(aiData.choices[0].message.content);

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating suggestions:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

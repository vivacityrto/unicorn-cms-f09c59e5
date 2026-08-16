import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const url = new URL(req.url);
    const searchText = (url.searchParams.get('searchText') ?? '').trim();

    if (searchText.length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: 'searchText must be at least 2 characters' }),
        { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const tgaUrl = new URL('https://training.gov.au/api/search/training');
    tgaUrl.searchParams.set('searchText', searchText);
    tgaUrl.searchParams.set('api-version', '1.0');
    tgaUrl.searchParams.set('includeTotalCount', 'true');
    tgaUrl.searchParams.set('pageSize', '25');

    const response = await fetch(tgaUrl.toString(), {
      headers: {
        'User-Agent': 'Unicorn/2.0',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return new Response(
        JSON.stringify({ success: false, error: `TGA returned ${response.status}`, detail: text.slice(0, 500) }),
        { status: response.status >= 500 ? 502 : response.status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const VIMEO_ACCESS_TOKEN = Deno.env.get('VIMEO_ACCESS_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!VIMEO_ACCESS_TOKEN) {
      throw new Error('VIMEO_ACCESS_TOKEN not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Same Super Admin gate as import-vimeo-training
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: userData, error: userError } = await supabase
      .from('users').select('unicorn_role').eq('user_uuid', user.id).single();
    if (userError || userData?.unicorn_role !== 'Super Admin') {
      return new Response(JSON.stringify({ error: 'Super Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { showcaseUrl, albumId: albumIdInput } = await req.json();
    let albumId = albumIdInput;
    if (!albumId && showcaseUrl) {
      const match = String(showcaseUrl).match(/showcase\/(\d+)/);
      if (match) albumId = match[1];
    }
    if (!albumId) {
      throw new Error('Provide albumId or a showcaseUrl containing /showcase/{id}');
    }

    const vHeaders = {
      'Authorization': `Bearer ${VIMEO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    };

    const albumResp = await fetch(`https://api.vimeo.com/albums/${albumId}`, { headers: vHeaders });
    const albumRespText = await albumResp.text();
    if (!albumResp.ok) {
      return new Response(JSON.stringify({ error: `Vimeo album lookup failed: ${albumResp.status}`, detail: albumRespText }), {
        status: albumResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const album = JSON.parse(albumRespText);

    let sections: any[] | null = null;
    const sectionsResp = await fetch(`https://api.vimeo.com/albums/${albumId}/sections`, { headers: vHeaders });
    if (sectionsResp.ok) {
      const sectionsData = await sectionsResp.json();
      sections = sectionsData.data ?? [];
    }

    const videos: any[] = [];
    let page = 1;
    const perPage = 100;
    while (true) {
      const vResp = await fetch(
        `https://api.vimeo.com/albums/${albumId}/videos?page=${page}&per_page=${perPage}&fields=uri,name,description,duration,link,created_time`,
        { headers: vHeaders }
      );
      if (!vResp.ok) {
        const t = await vResp.text();
        return new Response(JSON.stringify({ error: `Vimeo videos lookup failed: ${vResp.status}`, detail: t }), {
          status: vResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const vData = await vResp.json();
      videos.push(...vData.data);
      if (!vData.paging?.next) break;
      page++;
      if (page > 20) break;
    }

    let sectionVideos: any[] = [];
    if (sections && sections.length > 0) {
      for (const section of sections) {
        const secUri = section.uri as string;
        const secVidResp = await fetch(`https://api.vimeo.com${secUri}/videos?fields=uri,name`, { headers: vHeaders });
        if (secVidResp.ok) {
          const secVidData = await secVidResp.json();
          sectionVideos.push({
            section_uri: secUri,
            section_name: section.name,
            videos: secVidData.data?.map((v: any) => ({ uri: v.uri, name: v.name })) ?? [],
          });
        } else {
          sectionVideos.push({ section_uri: secUri, section_name: section.name, error: await secVidResp.text() });
        }
      }
    }

    return new Response(JSON.stringify({
      album: { uri: album.uri, name: album.name, description: album.description },
      has_sections: !!(sections && sections.length > 0),
      section_count: sections?.length ?? 0,
      sections: sectionVideos.length > 0 ? sectionVideos : sections,
      video_count: videos.length,
      videos: videos.map(v => ({ uri: v.uri, name: v.name, duration: v.duration, link: v.link })),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

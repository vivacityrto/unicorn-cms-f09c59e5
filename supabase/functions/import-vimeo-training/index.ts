import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VimeoVideo {
  uri: string;
  name: string;
  description: string | null;
  link: string;
  pictures?: {
    sizes: Array<{
      width: number;
      height: number;
      link: string;
    }>;
  };
  tags?: Array<{
    name: string;
  }>;
  duration?: number;
  created_time?: string;
}

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

    // Verify user is Super Admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is Super Admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('unicorn_role')
      .eq('user_uuid', user.id)
      .single();

    if (userError || userData?.unicorn_role !== 'Super Admin') {
      return new Response(JSON.stringify({ error: 'Super Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { albumId, page = 1, perPage = 50 } = await req.json();

    console.log(`Fetching Vimeo videos (page ${page}, per_page ${perPage})`);

    // Fetch videos from Vimeo
    // If albumId provided, fetch from that album, otherwise fetch from user's videos
    const vimeoEndpoint = albumId
      ? `https://api.vimeo.com/users/me/albums/${albumId}/videos`
      : 'https://api.vimeo.com/users/me/videos';

    const vimeoResponse = await fetch(`${vimeoEndpoint}?page=${page}&per_page=${perPage}`, {
      headers: {
        'Authorization': `Bearer ${VIMEO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!vimeoResponse.ok) {
      const errorText = await vimeoResponse.text();
      console.error('Vimeo API error:', errorText);
      throw new Error(`Vimeo API error: ${vimeoResponse.status}`);
    }

    const vimeoData = await vimeoResponse.json();
    const videos = vimeoData.data as VimeoVideo[];

    console.log(`Found ${videos.length} videos to import`);

    // Process each video
    const imported = [];
    const skipped = [];
    const errors = [];

    for (const video of videos) {
      try {
        // Check if already imported
        const { data: existing } = await supabase
          .from('resource_library')
          .select('id')
          .eq('video_url', video.link)
          .single();

        if (existing) {
          skipped.push({ title: video.name, reason: 'Already imported' });
          continue;
        }

        // Get best quality thumbnail
        const thumbnail = video.pictures?.sizes
          ?.sort((a, b) => b.width - a.width)[0]?.link || null;

        // Extract tags
        const tags = video.tags?.map(t => t.name) || [];

        // Add 'training' and 'webinar' tags if not present
        if (!tags.includes('training')) tags.push('training');
        if (!tags.includes('webinar')) tags.push('webinar');

        // Import to resource_library
        const { error: insertError } = await supabase
          .from('resource_library')
          .insert({
            title: video.name,
            description: video.description || `Training video from Vimeo`,
            category: 'training',
            video_url: video.link,
            file_url: thumbnail, // Store thumbnail URL in file_url for display
            tags: tags,
            version: 'v1.0',
            access_level: 'member',
          });

        if (insertError) {
          errors.push({ title: video.name, error: insertError.message });
          console.error(`Failed to import "${video.name}":`, insertError);
        } else {
          imported.push(video.name);
          console.log(`Imported: ${video.name}`);
        }
      } catch (err) {
        errors.push({ title: video.name, error: err instanceof Error ? err.message : 'Unknown error' });
        console.error(`Error processing "${video.name}":`, err);
      }
    }

    const result = {
      success: true,
      total: videos.length,
      imported: imported.length,
      skipped: skipped.length,
      errors: errors.length,
      details: {
        imported,
        skipped,
        errors,
      },
      pagination: {
        page,
        perPage,
        total: vimeoData.total,
        hasMore: vimeoData.paging?.next !== null,
      },
    };

    console.log('Import complete:', result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Import failed',
        details: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

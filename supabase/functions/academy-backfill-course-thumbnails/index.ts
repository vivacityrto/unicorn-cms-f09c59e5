import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function extractVimeoId(vimeoUrl: string | null): string | null {
  if (!vimeoUrl) return null;
  try {
    const url = new URL(vimeoUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    const idIndex = parts.findIndex((part) => /^\d{6,}$/.test(part));
    if (idIndex < 0) return null;
    const id = parts[idIndex];
    const nextPart = parts[idIndex + 1];
    const hash = nextPart && /^[a-zA-Z0-9]{4,}$/.test(nextPart) ? nextPart : null;
    return hash ? `${id}:${hash}` : id;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) });

  try {
    const VIMEO_ACCESS_TOKEN = Deno.env.get('VIMEO_ACCESS_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!VIMEO_ACCESS_TOKEN) return json(req, { error: 'VIMEO_ACCESS_TOKEN not configured' }, 500);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Super Admin only — mirrors import-vimeo-training's auth pattern.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(req, { error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json(req, { error: 'Invalid token' }, 401);

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('unicorn_role')
      .eq('user_uuid', user.id)
      .single();
    if (userError || userData?.unicorn_role !== 'Super Admin') {
      return json(req, { error: 'Super Admin access required' }, 403);
    }

    // Find courses missing a thumbnail; for each, walk its modules/lessons in order
    // to find the earliest linked video to use as the cover image.
    const { data: courses, error: coursesErr } = await supabase
      .from('academy_courses')
      .select('id, title')
      .is('thumbnail_url', null);
    if (coursesErr) return json(req, { error: coursesErr.message }, 500);

    const updated: Array<{ course_id: number; title: string; thumbnail_url: string }> = [];
    const skipped: Array<{ course_id: number; title: string; reason: string }> = [];
    const errors: Array<{ course_id: number; title: string; error: string }> = [];

    for (const course of courses ?? []) {
      try {
        const { data: modules } = await supabase
          .from('academy_modules')
          .select('id, sort_order')
          .eq('course_id', course.id)
          .order('sort_order', { ascending: true });

        let videoId: string | null = null;
        for (const mod of modules ?? []) {
          const { data: lessons } = await supabase
            .from('academy_lessons')
            .select('video_id, sort_order')
            .eq('module_id', mod.id)
            .not('video_id', 'is', null)
            .order('sort_order', { ascending: true })
            .limit(1);
          if (lessons && lessons.length > 0) {
            videoId = lessons[0].video_id;
            break;
          }
        }

        if (!videoId) {
          skipped.push({ course_id: course.id, title: course.title, reason: 'No linked video found' });
          continue;
        }

        const { data: video, error: videoErr } = await supabase
          .from('training_videos')
          .select('id, vimeo_url, thumbnail')
          .eq('id', videoId)
          .single();
        if (videoErr || !video) {
          skipped.push({ course_id: course.id, title: course.title, reason: 'Linked video record not found' });
          continue;
        }

        let thumbnail = video.thumbnail as string | null;

        if (!thumbnail) {
          const resource = extractVimeoId(video.vimeo_url);
          if (!resource) {
            skipped.push({ course_id: course.id, title: course.title, reason: `Could not parse Vimeo ID from ${video.vimeo_url}` });
            continue;
          }
          const vimeoResp = await fetch(`https://api.vimeo.com/videos/${resource}`, {
            headers: { Authorization: `Bearer ${VIMEO_ACCESS_TOKEN}`, Accept: 'application/vnd.vimeo.*+json;version=3.4' },
          });
          if (!vimeoResp.ok) {
            errors.push({ course_id: course.id, title: course.title, error: `Vimeo API ${vimeoResp.status} for video ${resource}` });
            continue;
          }
          const vimeoData = await vimeoResp.json();
          thumbnail = vimeoData?.pictures?.sizes
            ?.slice()
            .sort((a: { width?: number }, b: { width?: number }) => (b.width ?? 0) - (a.width ?? 0))[0]?.link ?? null;

          if (!thumbnail) {
            skipped.push({ course_id: course.id, title: course.title, reason: 'Vimeo returned no thumbnail for this video' });
            continue;
          }

          await supabase.from('training_videos').update({ thumbnail }).eq('id', video.id);
        }

        const { error: updateErr } = await supabase
          .from('academy_courses')
          .update({ thumbnail_url: thumbnail })
          .eq('id', course.id);
        if (updateErr) {
          errors.push({ course_id: course.id, title: course.title, error: updateErr.message });
          continue;
        }

        updated.push({ course_id: course.id, title: course.title, thumbnail_url: thumbnail });
      } catch (err) {
        errors.push({ course_id: course.id, title: course.title, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    return json(req, { updated, skipped, errors, total_considered: (courses ?? []).length });
  } catch (error) {
    console.error('academy-backfill-course-thumbnails failed', error);
    return json(req, { error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

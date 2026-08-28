/**
 * academy-import-vimeo-showcase
 *
 * Two modes, selected by whether `course_id` is present in the body:
 *
 * - With `course_id`: staff are importing into an existing Academy course.
 *   Paginates GET /albums/{id}/videos, parses "M{n} - Lesson {k} {title}"
 *   names, and additively creates missing academy_modules / training_videos /
 *   academy_lessons. Existing rows are never updated or deleted.
 * - Without `course_id`: preview mode, used by Add Course when drafting a
 *   brand-new course from a showcase (no course exists yet to import into).
 *   Read-only — no title-numbering convention is required here, every video
 *   becomes one lesson in showcase order using its own title. It reports the
 *   video list (flagging any Vimeo ids already used by another course) and
 *   writes nothing. The caller lets staff reorder the list, drafts AI content
 *   per video client-side, then creates the course and its module/lessons/
 *   videos directly.
 *
 * Auth: JWT + check_permission(caller, 'academy.builder.edit', 'full') —
 * same gate as the course-builder UI. Service-role writes only after that.
 *
 * verify_jwt: false — gateway JWT accepts the public anon key; auth is in-function.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildFallbackParse,
  classifyVideos,
  distinctModuleNumbers,
  extractAlbumId,
  extractVimeoVideoId,
  findExistingModule,
  type ExistingModule,
  type ShowcaseVideo,
} from "./parse.ts";

const VIDEO_FOLDER_NAME = "Course Lesson Videos";
const PER_PAGE = 100;
const MAX_PAGES = 20;
const VIMEO_FIELDS =
  "uri,name,description,duration,link,pictures.sizes,player_embed_url";

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("academy-import-vimeo-showcase missing Supabase configuration");
    return json(req, { error: "Server configuration error" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(req, { error: "Unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return json(req, { error: "Unauthorized" }, 401);
  }

  const { data: allowed } = await supabase.rpc("check_permission", {
    p_user_id: user.id,
    p_feature_key: "academy.builder.edit",
    p_min_level: "full",
  });
  if (!allowed) {
    return json(req, { error: "You don't have permission to import into Academy courses." }, 403);
  }

  let body: { course_id?: unknown; showcase_url?: unknown; album_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "A JSON body with a showcase URL is required" }, 400);
  }

  const hasCourseId = body.course_id !== undefined && body.course_id !== null && body.course_id !== "";
  let courseId = 0;
  if (hasCourseId) {
    courseId = Number(body.course_id);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return json(req, { error: "A valid course_id is required" }, 400);
    }
  }

  const albumId = extractAlbumId(
    typeof body.showcase_url === "string" ? body.showcase_url : null,
    body.album_id as string | number | null | undefined,
  );
  if (!albumId) {
    return json(req, {
      error: "Provide a Vimeo Showcase URL (vimeo.com/showcase/{id}) or a numeric album id",
    }, 400);
  }

  if (hasCourseId) {
    const { data: course, error: courseError } = await supabase
      .from("academy_courses")
      .select("id")
      .eq("id", courseId)
      .maybeSingle();
    if (courseError) {
      console.error("academy-import-vimeo-showcase course lookup failed", courseError);
      return json(req, { error: "Unable to load that course" }, 500);
    }
    if (!course) {
      return json(req, { error: "Course not found" }, 404);
    }
  }

  const vimeoToken = Deno.env.get("VIMEO_ACCESS_TOKEN");
  if (!vimeoToken) {
    console.error("academy-import-vimeo-showcase missing VIMEO_ACCESS_TOKEN");
    return json(req, { error: "Vimeo integration is not configured" }, 500);
  }

  const videos: ShowcaseVideo[] = [];
  try {
    const fetched = await fetchAlbumVideos(albumId, vimeoToken);
    videos.push(...fetched);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vimeo showcase fetch failed";
    console.error("academy-import-vimeo-showcase vimeo fetch failed", err);
    return json(req, { error: message }, 502);
  }

  if (!hasCourseId) {
    // Preview mode (drafting a brand-new course) never requires the
    // "M# - Lesson #" title convention — every video becomes one lesson,
    // sequenced in the showcase's own order, using each video's own title.
    // The Add Course review step lets staff reorder before drafting with AI.
    const { parsed: previewParsed, unmatched: previewUnmatched } = buildFallbackParse(videos);

    const { data: allVideos, error: videosLookupErr } = await supabase
      .from("training_videos")
      .select("id, vimeo_url");
    if (videosLookupErr) {
      console.error("academy-import-vimeo-showcase preview video lookup failed", videosLookupErr);
      return json(req, { error: "Unable to check for already-imported videos" }, 500);
    }
    const videoIdByVimeoId = new Map<string, string>();
    for (const row of allVideos ?? []) {
      const id = extractVimeoVideoId((row as { vimeo_url: string }).vimeo_url);
      if (id && !videoIdByVimeoId.has(id)) {
        videoIdByVimeoId.set(id, (row as { id: string }).id);
      }
    }

    const matchedVideoIds = [...new Set(
      previewParsed
        .map((item) => videoIdByVimeoId.get(item.vimeoId))
        .filter((id): id is string => !!id),
    )];

    const coursesByVideoId = new Map<string, Array<{ id: number; title: string; status: string | null }>>();
    if (matchedVideoIds.length > 0) {
      const { data: existingLessons, error: lessonsLookupErr } = await supabase
        .from("academy_lessons")
        .select("video_id, course_id")
        .in("video_id", matchedVideoIds);
      if (lessonsLookupErr) {
        console.error("academy-import-vimeo-showcase preview lesson lookup failed", lessonsLookupErr);
        return json(req, { error: "Unable to check for already-imported videos" }, 500);
      }
      const courseIds = [...new Set(
        (existingLessons ?? []).map((row: { course_id: number }) => row.course_id),
      )];
      const { data: courses, error: coursesLookupErr } = courseIds.length > 0
        ? await supabase.from("academy_courses").select("id, title, status").in("id", courseIds)
        : { data: [] as Array<{ id: number; title: string; status: string | null }>, error: null };
      if (coursesLookupErr) {
        console.error("academy-import-vimeo-showcase preview course lookup failed", coursesLookupErr);
        return json(req, { error: "Unable to check for already-imported videos" }, 500);
      }
      const courseById = new Map((courses ?? []).map((c) => [c.id, c]));
      for (const row of existingLessons ?? []) {
        const lessonRow = row as { video_id: string; course_id: number };
        const course = courseById.get(lessonRow.course_id);
        if (!course) continue;
        const list = coursesByVideoId.get(lessonRow.video_id) ?? [];
        list.push({ id: course.id, title: course.title, status: course.status });
        coursesByVideoId.set(lessonRow.video_id, list);
      }
    }

    return json(req, {
      album_id: albumId,
      video_count: videos.length,
      parsed: previewParsed.map((item) => {
        const existingVideoId = videoIdByVimeoId.get(item.vimeoId) ?? null;
        const existingCourses = existingVideoId ? coursesByVideoId.get(existingVideoId) ?? [] : [];
        return {
          module_number: item.moduleNumber,
          lesson_number: item.lessonNumber,
          title: item.title,
          vimeo_id: item.vimeoId,
          link: item.link,
          duration_seconds: item.duration,
          thumbnail_url: item.thumbnail,
          already_imported: existingCourses.length > 0,
          existing_courses: existingCourses,
        };
      }),
      unmatched: previewUnmatched,
    });
  }

  // Importing into an existing course still routes on the "M# - Lesson #"
  // convention, since something has to decide which of the course's existing
  // modules each video belongs to.
  const { parsed, unmatched } = classifyVideos(videos);

  const [{ data: existingModules, error: modulesErr }, { data: existingLessons, error: lessonsErr }, { data: existingVideos, error: videosErr }] =
    await Promise.all([
      supabase
        .from("academy_modules")
        .select("id, title")
        .eq("course_id", courseId),
      supabase
        .from("academy_lessons")
        .select("id, video_id")
        .eq("course_id", courseId),
      supabase
        .from("training_videos")
        .select("id, vimeo_url"),
    ]);

  if (modulesErr || lessonsErr || videosErr) {
    console.error("academy-import-vimeo-showcase existing-row lookup failed", {
      modulesErr, lessonsErr, videosErr,
    });
    return json(req, { error: "Unable to load existing Academy content" }, 500);
  }

  const modules = (existingModules ?? []) as ExistingModule[];
  const lessonVideoIds = new Set(
    (existingLessons ?? [])
      .map((row: { video_id: string | null }) => row.video_id)
      .filter((id: string | null): id is string => !!id),
  );
  const videoByVimeoId = new Map<string, string>();
  for (const row of existingVideos ?? []) {
    const id = extractVimeoVideoId((row as { vimeo_url: string }).vimeo_url);
    if (id && !videoByVimeoId.has(id)) {
      videoByVimeoId.set(id, (row as { id: string }).id);
    }
  }

  const modulesCreated: Array<{ id: number; title: string; module_number: number }> = [];
  const lessonsCreated: Array<{ id: number; title: string; module_number: number; lesson_number: number }> = [];
  const videosSkipped: Array<{ vimeo_id: string; title: string; reason: "already imported" }> = [];

  const moduleIdByNumber = new Map<number, number>();
  for (const moduleNumber of distinctModuleNumbers(parsed)) {
    const existing = findExistingModule(modules, moduleNumber);
    if (existing) {
      moduleIdByNumber.set(moduleNumber, existing.id);
      continue;
    }
    const title = `Module ${moduleNumber}`;
    const { data: created, error: insertErr } = await supabase
      .from("academy_modules")
      .insert({
        course_id: courseId,
        title,
        sort_order: moduleNumber,
        is_published: true,
        created_by: user.id,
      })
      .select("id, title")
      .single();
    if (insertErr || !created) {
      console.error("academy-import-vimeo-showcase module insert failed", insertErr);
      return json(req, { error: `Failed to create ${title}` }, 500);
    }
    moduleIdByNumber.set(moduleNumber, created.id as number);
    modules.push({ id: created.id as number, title: created.title as string });
    modulesCreated.push({
      id: created.id as number,
      title: created.title as string,
      module_number: moduleNumber,
    });
  }

  let folderId: string | null = null;
  const needsNewVideo = parsed.some((item) => !videoByVimeoId.has(item.vimeoId));
  if (needsNewVideo) {
    folderId = await ensureVideoFolder(supabase);
    if (!folderId) {
      return json(req, { error: "Failed to resolve the Course Lesson Videos folder" }, 500);
    }
  }

  for (const item of parsed) {
    const moduleId = moduleIdByNumber.get(item.moduleNumber);
    if (!moduleId) continue;

    let videoId = videoByVimeoId.get(item.vimeoId) ?? null;
    if (videoId) {
      videosSkipped.push({
        vimeo_id: item.vimeoId,
        title: item.vimeoName,
        reason: "already imported",
      });
    } else {
      const { data: createdVideo, error: videoErr } = await supabase
        .from("training_videos")
        .insert({
          folder_id: folderId,
          folder_name: VIDEO_FOLDER_NAME,
          video_name: item.vimeoName,
          vimeo_url: `https://vimeo.com/${item.vimeoId}`,
          duration_seconds: item.duration,
          thumbnail: item.thumbnail,
          added_by: user.id,
        })
        .select("id")
        .single();
      if (videoErr || !createdVideo) {
        console.error("academy-import-vimeo-showcase video insert failed", videoErr);
        return json(req, { error: `Failed to import video ${item.vimeoName}` }, 500);
      }
      videoId = createdVideo.id as string;
      videoByVimeoId.set(item.vimeoId, videoId);
    }

    if (lessonVideoIds.has(videoId)) {
      continue;
    }

    const { data: createdLesson, error: lessonErr } = await supabase
      .from("academy_lessons")
      .insert({
        module_id: moduleId,
        course_id: courseId,
        title: item.title,
        description: item.description,
        lesson_type: "video",
        video_id: videoId,
        estimated_minutes: item.duration != null ? Math.round(item.duration / 60) : null,
        sort_order: item.lessonNumber,
        is_published: true,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (lessonErr || !createdLesson) {
      console.error("academy-import-vimeo-showcase lesson insert failed", lessonErr);
      return json(req, { error: `Failed to create lesson ${item.title}` }, 500);
    }
    lessonVideoIds.add(videoId);
    lessonsCreated.push({
      id: createdLesson.id as number,
      title: item.title,
      module_number: item.moduleNumber,
      lesson_number: item.lessonNumber,
    });
  }

  return json(req, {
    album_id: albumId,
    video_count: videos.length,
    modules_created: modulesCreated,
    lessons_created: lessonsCreated,
    videos_skipped: videosSkipped,
    unmatched,
  });
});

async function fetchAlbumVideos(albumId: string, token: string): Promise<ShowcaseVideo[]> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.vimeo.*+json;version=3.4",
  };
  const videos: ShowcaseVideo[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await fetch(
      `https://api.vimeo.com/albums/${albumId}/videos?page=${page}&per_page=${PER_PAGE}&fields=${VIMEO_FIELDS}`,
      { headers },
    );
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Vimeo album lookup failed (${response.status})`);
    }
    const payload = JSON.parse(text) as {
      data?: ShowcaseVideo[];
      paging?: { next?: string | null };
    };
    if (Array.isArray(payload.data)) {
      videos.push(...payload.data);
    }
    if (!payload.paging?.next) break;
  }

  return videos;
}

async function ensureVideoFolder(
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  const { data: existing, error: lookupErr } = await supabase
    .from("training_folders")
    .select("id")
    .eq("folder_name", VIDEO_FOLDER_NAME)
    .maybeSingle();
  if (lookupErr) {
    console.error("academy-import-vimeo-showcase folder lookup failed", lookupErr);
    return null;
  }
  if (existing?.id) return existing.id as string;

  const { data: created, error: insertErr } = await supabase
    .from("training_folders")
    .insert({ folder_name: VIDEO_FOLDER_NAME })
    .select("id")
    .single();
  if (insertErr || !created) {
    console.error("academy-import-vimeo-showcase folder insert failed", insertErr);
    return null;
  }
  return created.id as string;
}

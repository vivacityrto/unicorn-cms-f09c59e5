import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  GraduationCap, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  Play, BookOpen, FileText, CheckCircle2, Clock, ArrowLeft, ArrowRight, Eye,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState, useEffect } from "react";

const ACCENT = "#23c0dd";

export default function AcademyLessonViewerPage() {
  const { slug, lessonId } = useParams<{ slug: string; lessonId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const numericLessonId = lessonId ? parseInt(lessonId, 10) : null;

  // Fetch course by slug
  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ["academy-course-detail", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_courses")
        .select("id, title, slug, description, estimated_minutes, status")
        .eq("slug", slug!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch current lesson
  const { data: lesson, isLoading: lessonLoading } = useQuery({
    queryKey: ["academy-lesson-detail", numericLessonId],
    enabled: !!numericLessonId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_lessons")
        .select("id, module_id, course_id, title, description, lesson_type, sort_order, is_published, is_preview, estimated_minutes, video_id, resource_id, content_markdown")
        .eq("id", numericLessonId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch video details if lesson has a video
  const { data: video } = useQuery({
    queryKey: ["academy-lesson-video", lesson?.video_id],
    enabled: !!lesson?.video_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_videos")
        .select("id, video_name, vimeo_url, thumbnail")
        .eq("id", lesson!.video_id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch all modules + lessons for sidebar navigation
  const { data: modules = [] } = useQuery({
    queryKey: ["academy-modules-lessons", course?.id],
    enabled: !!course?.id,
    queryFn: async () => {
      const [{ data: mods, error: mErr }, { data: lessons, error: lErr }] = await Promise.all([
        supabase.from("academy_modules").select("id, course_id, title, sort_order, is_published").eq("course_id", course!.id).order("sort_order"),
        supabase.from("academy_lessons").select("id, module_id, title, lesson_type, sort_order, is_published, estimated_minutes").eq("course_id", course!.id).order("sort_order"),
      ]);
      if (mErr) throw mErr;
      if (lErr) throw lErr;

      const byModule = new Map<number, any[]>();
      (lessons ?? []).forEach((l: any) => {
        const arr = byModule.get(l.module_id) || [];
        arr.push(l);
        byModule.set(l.module_id, arr);
      });
      return (mods ?? []).filter((m: any) => m.is_published !== false).map((m: any) => ({
        ...m,
        lessons: (byModule.get(m.id) || []).filter((l: any) => l.is_published !== false),
      }));
    },
  });

  // Fetch enrollment
  const { data: enrollment } = useQuery({
    queryKey: ["academy-enrollment-detail", course?.id],
    enabled: !!course?.id,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !course?.id) return null;
      const { data } = await supabase
        .from("v_academy_course_progress")
        .select("enrollment_id, enrollment_status, progress_percentage, completed_lessons, total_lessons")
        .eq("user_id", user.id)
        .eq("course_id", course.id)
        .maybeSingle();
      return data;
    },
  });

  // Completed lesson IDs
  const { data: completedLessonIds = [] } = useQuery({
    queryKey: ["academy-lesson-progress", enrollment?.enrollment_id],
    enabled: !!enrollment?.enrollment_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("academy_lesson_progress")
        .select("lesson_id")
        .eq("enrollment_id", enrollment!.enrollment_id)
        .eq("is_completed", true);
      return (data ?? []).map((r: any) => r.lesson_id as number);
    },
  });

  // Mark lesson complete mutation
  const markComplete = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !lesson || !course || !enrollment) throw new Error("Not ready");
      const { error } = await supabase.from("academy_lesson_progress").upsert(
        {
          user_id: user.id,
          course_id: course.id,
          lesson_id: lesson.id,
          enrollment_id: enrollment.enrollment_id,
          is_completed: true,
          completed_at: new Date().toISOString(),
          completion_percentage: 100,
        } as any,
        { onConflict: "enrollment_id,lesson_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lesson marked as complete!");
      qc.invalidateQueries({ queryKey: ["academy-lesson-progress"] });
      qc.invalidateQueries({ queryKey: ["academy-enrollment-detail"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update progress"),
  });

  // Compute prev/next lessons
  const allLessons = modules.flatMap((m: any) => m.lessons);
  const currentIdx = allLessons.findIndex((l: any) => l.id === numericLessonId);
  const prevLesson = currentIdx > 0 ? allLessons[currentIdx - 1] : null;
  const nextLesson = currentIdx >= 0 && currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null;

  const isCompleted = numericLessonId != null && completedLessonIds.includes(numericLessonId);

  const lessonIcon = (type: string | null) => {
    if (type === "video") return <Play className="h-3.5 w-3.5" />;
    if (type === "resource") return <FileText className="h-3.5 w-3.5" />;
    return <BookOpen className="h-3.5 w-3.5" />;
  };

  const isPreview = lesson?.is_preview === true;
  const isEnrolled = !!enrollment && enrollment.enrollment_status === "active";

  // Access gate: redirect if not preview and not enrolled
  useEffect(() => {
    if (courseLoading || lessonLoading) return;
    if (!course || !lesson) return;
    if (isPreview) return; // preview lessons are always accessible
    if (isEnrolled) return; // enrolled users can access
    // Not preview + not enrolled → redirect
    toast.error("Please enrol in this course to access this lesson.");
    navigate(`/academy/course/${slug}`, { replace: true });
  }, [courseLoading, lessonLoading, course, lesson, isPreview, isEnrolled, slug, navigate]);

  if (courseLoading || lessonLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-[400px] w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!course || !lesson) {
    return (
      <div className="text-center py-16">
        <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="font-medium text-foreground">Lesson not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(`/academy/course/${slug}`)}>
          Back to Course
        </Button>
      </div>
    );
  }

  // If not preview and not enrolled, don't render (effect will redirect)
  if (!isPreview && !isEnrolled) {
    return null;
  }

  // Build Vimeo embed URL
  const vimeoEmbedUrl = video?.vimeo_url
    ? video.vimeo_url.replace("vimeo.com/", "player.vimeo.com/video/").split("?")[0] + "?autoplay=0&title=0&byline=0&portrait=0"
    : null;

  return (
    <div className="flex gap-0 -mx-6 -mt-2">
      {/* Sidebar */}
      <div
        className={`flex-shrink-0 border-r transition-all duration-200 overflow-hidden ${sidebarOpen ? "w-72" : "w-0"}`}
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <div className="w-72 h-full overflow-y-auto p-4 space-y-3">
          <Link
            to={`/academy/course/${slug}`}
            className="flex items-center gap-1.5 text-xs font-medium hover:opacity-80 transition-opacity"
            style={{ color: ACCENT }}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to Course
          </Link>

          <h3 className="text-sm font-semibold text-foreground truncate">{course.title}</h3>

          {enrollment && (
            <div className="space-y-1">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${enrollment.progress_percentage ?? 0}%`, backgroundColor: ACCENT }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">{enrollment.progress_percentage ?? 0}% complete</p>
            </div>
          )}

          <div className="space-y-2">
            {modules.map((mod: any) => (
              <div key={mod.id}>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{mod.title}</p>
                <ul className="space-y-0.5">
                  {mod.lessons.map((l: any) => {
                    const active = l.id === numericLessonId;
                    const done = completedLessonIds.includes(l.id);
                    return (
                      <li key={l.id}>
                        <button
                          onClick={() => navigate(`/academy/course/${slug}/lesson/${l.id}`)}
                          className={`w-full text-left flex items-center gap-2 py-1.5 px-2 rounded text-xs transition-colors ${
                            active ? "bg-primary/10 font-semibold" : "hover:bg-muted/50"
                          }`}
                          style={active ? { color: ACCENT } : undefined}
                        >
                          {done ? (
                            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#22c55e" }} />
                          ) : (
                            <span className="text-muted-foreground">{lessonIcon(l.lesson_type)}</span>
                          )}
                          <span className="truncate">{l.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toggle sidebar */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="flex-shrink-0 self-start mt-4 p-1 rounded hover:bg-muted/50 transition-colors"
        aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
      >
        {sidebarOpen ? <ChevronLeft className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {/* Main content */}
      <div className="flex-1 min-w-0 p-6 space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
          <Link to="/academy" className="hover:opacity-80 transition-opacity" style={{ color: "#ed1878" }}>
            Academy
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link to={`/academy/course/${slug}`} className="hover:opacity-80 transition-opacity" style={{ color: ACCENT }}>
            {course.title}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-foreground">{lesson.title}</span>
        </nav>

        {/* Video Player */}
        {vimeoEmbedUrl && (
          <div className="relative w-full rounded-xl overflow-hidden" style={{ paddingBottom: "56.25%", background: "#000" }}>
            <iframe
              src={vimeoEmbedUrl}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              title={lesson.title}
            />
          </div>
        )}

        {/* No video placeholder */}
        {!vimeoEmbedUrl && lesson.lesson_type === "video" && (
          <div
            className="flex items-center justify-center rounded-xl"
            style={{ height: 300, background: `linear-gradient(135deg, ${ACCENT} 0%, #7130A0 100%)` }}
          >
            <div className="text-center text-white">
              <Play className="h-12 w-12 mx-auto mb-2 opacity-60" />
              <p className="text-sm opacity-80">Video not yet available</p>
            </div>
          </div>
        )}

        {/* Lesson header */}
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-foreground">{lesson.title}</h1>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {lesson.estimated_minutes && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {lesson.estimated_minutes} min
              </span>
            )}
            <span className="flex items-center gap-1 capitalize">
              {lessonIcon(lesson.lesson_type)} {lesson.lesson_type || "Content"}
            </span>
          </div>
        </div>

        {/* Description / Content */}
        {lesson.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{lesson.description}</p>
        )}

        {lesson.content_markdown && (
          <div className="prose prose-sm max-w-none text-foreground">
            <div dangerouslySetInnerHTML={{ __html: lesson.content_markdown }} />
          </div>
        )}

        {/* Mark Complete / Navigation */}
        <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: "hsl(var(--border))" }}>
          <div>
            {prevLesson && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/academy/course/${slug}/lesson/${prevLesson.id}`)}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Previous
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {enrollment && !isCompleted && (
              <Button
                size="sm"
                onClick={() => markComplete.mutate()}
                disabled={markComplete.isPending}
                style={{ backgroundColor: "#22c55e" }}
                className="text-white hover:opacity-90"
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                {markComplete.isPending ? "Saving…" : "Mark Complete"}
              </Button>
            )}
            {isCompleted && (
              <span className="text-xs font-medium flex items-center gap-1" style={{ color: "#22c55e" }}>
                <CheckCircle2 className="h-4 w-4" /> Completed
              </span>
            )}
          </div>

          <div>
            {nextLesson ? (
              <Button
                size="sm"
                onClick={() => navigate(`/academy/course/${slug}/lesson/${nextLesson.id}`)}
                style={{ backgroundColor: ACCENT }}
                className="text-white hover:opacity-90"
              >
                Next <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/academy/course/${slug}`)}
              >
                Back to Course
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

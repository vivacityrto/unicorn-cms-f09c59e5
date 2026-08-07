import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  GraduationCap, ChevronRight, ChevronLeft,
  Play, BookOpen, FileText, CheckCircle2, Clock, ArrowLeft, ArrowRight, Eye, Lock, AlertTriangle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState, useEffect, useRef, useCallback } from "react";
import VimeoPlayer from "@/components/academy/VimeoPlayer";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  AppModal, AppModalContent, AppModalHeader, AppModalTitle, AppModalDescription, AppModalBody, AppModalFooter,
} from "@/components/ui/modals";
import { useAcademyActingUserId } from "@/hooks/academy/useAcademyActingUserId";
import { useEnrolCourse } from "@/hooks/academy/useEnrolCourse";
import { useCompleteEnrollment } from "@/hooks/academy/useCompleteEnrollment";
import {
  useReadOnlyGuard,
  PREVIEW_BLOCKED_ERROR,
  isPreviewBlockedError,
} from "@/hooks/useReadOnlyGuard";
import { friendlyDbError } from "@/lib/friendlyDbError";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentCycle } from "@/features/pdp/hooks";
import { QuickReflectionDrawer } from "@/components/academy/pdp/QuickReflectionDrawer";

const ACCENT = "#23c0dd";
const PROGRESS_THROTTLE_MS = 10_000;

export default function AcademyLessonViewerPage() {
  const { slug, lessonId } = useParams<{ slug: string; lessonId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { userId: actingUserId, isLoading: actingUserLoading } = useAcademyActingUserId();
  const enrolCourseMutation = useEnrolCourse();
  const completeEnrollmentMutation = useCompleteEnrollment();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [livePercent, setLivePercent] = useState<number>(0);
  const [livePosition, setLivePosition] = useState<number>(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const autoCompletedRef = useRef<boolean>(false);
  const prevEnrollmentStatusRef = useRef<string | null>(null);
  const { isReadOnly, blockWrite } = useReadOnlyGuard();
  const { user, profile } = useAuth();
  const authUserId = user?.id ?? null;
  const tenantId = profile?.tenant_id ?? null;
  const { data: pdpCycle } = useCurrentCycle(authUserId, tenantId);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [reflectionLessonProgressId, setReflectionLessonProgressId] = useState<number | null>(null);
  const [reflectionLessonTitle, setReflectionLessonTitle] = useState<string | null>(null);
  const promptedLessonsRef = useRef<Set<number>>(new Set());
  const initialCompletedSnapshotRef = useRef<Set<number> | null>(null);

  const numericLessonId = lessonId ? parseInt(lessonId, 10) : null;

  // Fetch course by slug
  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ["academy-course-detail", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_courses")
        .select("id, title, slug, description, estimated_minutes, status, segment_start_seconds, segment_end_seconds")
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
        .select("id, module_id, course_id, title, description, lesson_type, sort_order, is_published, is_preview, estimated_minutes, video_id, resource_id, content_markdown, completion_threshold")
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

  // Fetch all modules + lessons for sidebar navigation (includes is_preview)
  const { data: modules = [] } = useQuery({
    queryKey: ["academy-modules-lessons", course?.id],
    enabled: !!course?.id,
    queryFn: async () => {
      const [{ data: mods, error: mErr }, { data: lessons, error: lErr }] = await Promise.all([
        supabase.from("academy_modules").select("id, course_id, title, sort_order, is_published").eq("course_id", course!.id).order("sort_order"),
        supabase.from("v_academy_lesson_outline").select("id, module_id, title, lesson_type, sort_order, is_published, is_preview, estimated_minutes").eq("course_id", course!.id).order("sort_order"),
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

  // Fetch enrollment summary (status / progress)
  const {
    data: enrollment,
    isLoading: enrollmentLoading,
    isFetching: enrollmentFetching,
  } = useQuery({
    queryKey: ["academy-enrollment-detail", course?.id, actingUserId],
    enabled: !!course?.id && !!actingUserId && !actingUserLoading,
    queryFn: async () => {
      if (!actingUserId || !course?.id) return null;
      const { data } = await supabase
        .from("v_academy_course_progress")
        .select("enrollment_id, enrollment_status, progress_percentage, completed_lessons, total_lessons")
        .eq("user_id", actingUserId)
        .eq("course_id", course.id)
        .maybeSingle();
      return data;
    },
  });

  // Fetch raw enrollment row for expires_at / revoked_at
  const {
    data: enrollmentRaw,
    isLoading: enrollmentRawLoading,
    isFetching: enrollmentRawFetching,
  } = useQuery({
    queryKey: ["academy-enrollment-raw", course?.id, actingUserId],
    enabled: !!course?.id && !!actingUserId && !actingUserLoading,
    queryFn: async () => {
      if (!actingUserId || !course?.id) return null;
      const { data } = await supabase
        .from("academy_enrollments")
        .select("id, status, expires_at, revoked_at")
        .eq("user_id", actingUserId)
        .eq("course_id", course.id)
        .order("enrolled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Completed lesson IDs + current-lesson progress row
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

  const { data: currentProgress } = useQuery({
    queryKey: ["academy-lesson-current-progress", enrollment?.enrollment_id, numericLessonId],
    enabled: !!enrollment?.enrollment_id && !!numericLessonId,
    queryFn: async () => {
      const { data } = await supabase
        .from("academy_lesson_progress")
        .select("last_position_seconds, completion_percentage, is_completed")
        .eq("enrollment_id", enrollment!.enrollment_id)
        .eq("lesson_id", numericLessonId!)
        .maybeSingle();
      return data;
    },
  });

  // Enrol via dispatch hook (preview banner)
  const enrolMutation = enrolCourseMutation;

  // Derived flags
  const isPreview = lesson?.is_preview === true;
  const isEnrolled = !!enrollment && enrollment.enrollment_status === "active";
  const isExpired = !!enrollmentRaw?.expires_at && new Date(enrollmentRaw.expires_at) < new Date();
  const isRevoked = !!enrollmentRaw?.revoked_at;
  const canTrackProgress = isEnrolled && !isPreview && !isExpired && !isRevoked && !isReadOnly;
  const completionThreshold = lesson?.completion_threshold ?? 90;

  // Upsert progress helper
  const upsertProgress = useCallback(
    async (fields: Record<string, any>) => {
      if (!canTrackProgress || !lesson || !course || !enrollment) return;
      if (!actingUserId) return;
      await supabase.from("academy_lesson_progress").upsert(
        {
          user_id: actingUserId,
          course_id: course.id,
          lesson_id: lesson.id,
          enrollment_id: enrollment.enrollment_id,
          ...fields,
        } as any,
        { onConflict: "enrollment_id,lesson_id" }
      );
    },
    [canTrackProgress, lesson, course, enrollment, actingUserId]
  );

  // Auto-complete (server-side flow + client refetch)
  const autoCompleteLesson = useCallback(async () => {
    if (autoCompletedRef.current) return;
    if (!canTrackProgress || !lesson || !course || !enrollment) return;
    if (!actingUserId) return;
    if (completedLessonIds.includes(lesson.id)) return;
    autoCompletedRef.current = true;

    await supabase.from("academy_lesson_progress").upsert(
      {
        user_id: actingUserId,
        course_id: course.id,
        lesson_id: lesson.id,
        enrollment_id: enrollment.enrollment_id,
        is_completed: true,
        completed_at: new Date().toISOString(),
        completion_percentage: 100,
      } as any,
      { onConflict: "enrollment_id,lesson_id" }
    );

    const { data: allLessons } = await supabase
      .from("academy_lessons")
      .select("id")
      .eq("course_id", course.id)
      .eq("is_published", true);
    const lessonIds = (allLessons ?? []).map((l: any) => l.id);
    if (lessonIds.length > 0) {
      const { count: completedCount } = await supabase
        .from("academy_lesson_progress")
        .select("id", { count: "exact", head: true })
        .eq("user_id", actingUserId)
        .eq("is_completed", true)
        .in("lesson_id", lessonIds);
      if ((completedCount ?? 0) >= lessonIds.length && enrollment.enrollment_id) {
        try {
          await completeEnrollmentMutation.mutateAsync(enrollment.enrollment_id);
        } catch {
          /* toast surfaced by hook */
        }
      }
    }

    qc.invalidateQueries({ queryKey: ["academy-lesson-progress"] });
    qc.invalidateQueries({ queryKey: ["academy-enrollment-detail"] });
  }, [canTrackProgress, lesson, course, enrollment, completedLessonIds, qc, actingUserId, completeEnrollmentMutation]);

  // Reset autocomplete latch when lesson changes
  useEffect(() => {
    autoCompletedRef.current = false;
    setLivePercent(currentProgress?.completion_percentage ?? 0);
    setLivePosition(currentProgress?.last_position_seconds ?? 0);
  }, [lesson?.id, currentProgress?.completion_percentage, currentProgress?.last_position_seconds]);

  // Course completion celebration
  useEffect(() => {
    const status = enrollment?.enrollment_status ?? null;
    if (
      prevEnrollmentStatusRef.current === "active" &&
      status === "completed"
    ) {
      setShowCelebration(true);
    }
    prevEnrollmentStatusRef.current = status;
  }, [enrollment?.enrollment_status]);

  // [Additive] Quick reflection drawer trigger — fires when a lesson transitions
  // to completed during this session. Does NOT alter completion logic.
  useEffect(() => {
    const lessonId = lesson?.id;
    if (!lessonId || !enrollment?.enrollment_id) return;
    if (!authUserId || actingUserId !== authUserId) return;
    if (!canTrackProgress) return;

    if (initialCompletedSnapshotRef.current === null) {
      initialCompletedSnapshotRef.current = new Set(completedLessonIds);
    }
    const initialSet = initialCompletedSnapshotRef.current;
    if (initialSet.has(lessonId)) return;
    if (promptedLessonsRef.current.has(lessonId)) return;

    const justCompleted =
      completedLessonIds.includes(lessonId) || currentProgress?.is_completed === true;
    if (!justCompleted) return;

    promptedLessonsRef.current.add(lessonId);
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("academy_lesson_progress")
        .select("id")
        .eq("enrollment_id", enrollment.enrollment_id)
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (cancelled || !data?.id) return;
      setReflectionLessonProgressId(data.id as number);
      setReflectionLessonTitle(lesson?.title ?? null);
      setReflectionOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    lesson?.id,
    lesson?.title,
    completedLessonIds,
    currentProgress?.is_completed,
    enrollment?.enrollment_id,
    authUserId,
    actingUserId,
    canTrackProgress,
  ]);


  // Mark lesson complete mutation (manual button)
  const markComplete = useMutation({
    mutationFn: async () => {
      if (blockWrite("Mark complete")) throw new Error(PREVIEW_BLOCKED_ERROR);
      if (!actingUserId || !lesson || !course || !enrollment) throw new Error("Not ready");
      const { error } = await supabase.from("academy_lesson_progress").upsert(
        {
          user_id: actingUserId,
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

      const { data: allLessonIds } = await supabase
        .from("academy_lessons")
        .select("id")
        .eq("course_id", course.id)
        .eq("is_published", true);
      const lessonIdList = (allLessonIds ?? []).map((l: any) => l.id);
      if (lessonIdList.length === 0) return { courseComplete: false };

      const { count: completedCount } = await supabase
        .from("academy_lesson_progress")
        .select("id", { count: "exact", head: true })
        .eq("user_id", actingUserId)
        .eq("is_completed", true)
        .in("lesson_id", lessonIdList);

      if ((completedCount ?? 0) >= lessonIdList.length && enrollment.enrollment_id) {
        try {
          await completeEnrollmentMutation.mutateAsync(enrollment.enrollment_id);
        } catch {
          /* toast surfaced by hook */
        }
        return { courseComplete: true };
      }
      return { courseComplete: false };
    },
    onSuccess: (result) => {
      toast.success("Lesson marked as complete!");
      qc.invalidateQueries({ queryKey: ["academy-lesson-progress"] });
      qc.invalidateQueries({ queryKey: ["academy-enrollment-detail"] });
      if (result?.courseComplete) {
        setShowCelebration(true);
      }
    },
    onError: (e: any) => {
      if (isPreviewBlockedError(e)) return;
      toast.error(friendlyDbError(e, "AcademyLessonViewer.markComplete"));
    },
  });

  // Compute prev/next lessons
  const allLessons = modules.flatMap((m: any) => m.lessons);
  const currentIdx = allLessons.findIndex((l: any) => l.id === numericLessonId);
  const prevLesson = currentIdx > 0 ? allLessons[currentIdx - 1] : null;
  const nextLesson = currentIdx >= 0 && currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null;

  const isCompleted = numericLessonId != null && completedLessonIds.includes(numericLessonId);
  const effectivePercent = Math.max(livePercent, currentProgress?.completion_percentage ?? 0);

  const lessonIcon = (type: string | null) => {
    if (type === "video") return <Play className="h-3.5 w-3.5" />;
    if (type === "resource") return <FileText className="h-3.5 w-3.5" />;
    return <BookOpen className="h-3.5 w-3.5" />;
  };

  // Flush position before navigating
  const flushAndNavigate = useCallback(
    async (path: string) => {
      if (canTrackProgress && livePosition > 0) {
        await upsertProgress({
          last_position_seconds: livePosition,
          watch_seconds: livePosition,
          completion_percentage: livePercent,
        });
      }
      navigate(path);
    },
    [canTrackProgress, livePosition, livePercent, upsertProgress, navigate]
  );

  // Access gate: redirect if not preview and not enrolled, or revoked
  useEffect(() => {
    if (courseLoading || lessonLoading) return;
    if (!course || !lesson) return;
    if (isPreview) return;
    if (actingUserLoading) return;
    if (!actingUserId) return; // wait for acting user; if still null after load, treat as unauth elsewhere
    if (enrollmentRawLoading || enrollmentRawFetching) return;
    if (isRevoked) {
      toast.error("Your access to this course has been revoked.");
      navigate(`/academy/course/${slug}`, { replace: true });
      return;
    }
    if (enrollmentLoading || enrollmentFetching) return;
    if (isEnrolled) return;
    toast.error("Please enrol in this course to access this lesson.");
    navigate(`/academy/course/${slug}`, { replace: true });
  }, [
    courseLoading,
    lessonLoading,
    course,
    lesson,
    isPreview,
    isEnrolled,
    isRevoked,
    actingUserLoading,
    actingUserId,
    enrollmentLoading,
    enrollmentFetching,
    enrollmentRawLoading,
    enrollmentRawFetching,
    slug,
    navigate,
  ]);

  const gatingInProgress =
    !!course &&
    !!lesson &&
    !isPreview &&
    (actingUserLoading ||
      enrollmentLoading ||
      enrollmentFetching ||
      enrollmentRawLoading ||
      enrollmentRawFetching);

  if (courseLoading || lessonLoading || gatingInProgress) {
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

  if (!isPreview && !isEnrolled) {
    return null;
  }

  function stripCourseSuffix(lessonTitle: string, courseTitle: string): string {
    if (!courseTitle) return lessonTitle;
    const escaped = courseTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return lessonTitle.replace(new RegExp(`[-\\s]+${escaped}$`, "i"), "").trim();
  }

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
                    const locked = !isEnrolled && !l.is_preview;
                    const stripped = stripCourseSuffix(l.title ?? "", course.title ?? "");
                    const prefixMatch = stripped.match(/^(M\d+-L?\d*)-?/i);
                    const codePrefix = prefixMatch ? prefixMatch[1] : "";
                    const readableTitle = prefixMatch ? stripped.slice(prefixMatch[0].length).trim() : stripped;
                    return (
                      <li key={l.id}>
                        <button
                          onClick={() => {
                            if (locked) return;
                            flushAndNavigate(`/academy/course/${slug}/lesson/${l.id}`);
                          }}
                          disabled={locked}
                          title={locked ? "Enrol to unlock" : undefined}
                          className={`w-full text-left flex items-center gap-2 py-1.5 px-2 rounded text-xs transition-colors ${
                            active ? "bg-primary/10 font-semibold" : locked ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50"
                          }`}
                          style={active ? { color: ACCENT } : undefined}
                        >
                          {locked ? (
                            <Lock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                          ) : done ? (
                            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#22c55e" }} />
                          ) : (
                            <span className="text-muted-foreground">{lessonIcon(l.lesson_type)}</span>
                          )}
                          <span className="truncate flex items-center gap-1.5">
                            {codePrefix && (
                              <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0 bg-muted px-1 rounded">
                                {codePrefix}
                              </span>
                            )}
                            <span className="truncate">{readableTitle || l.title}</span>
                          </span>
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

        {/* Preview banner */}
        {isPreview && !isEnrolled && (
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border"
            style={{ borderColor: `${ACCENT}55`, backgroundColor: `${ACCENT}10` }}
          >
            <div className="flex items-start gap-2">
              <Eye className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: ACCENT }} />
              <p className="text-sm text-foreground">
                You're viewing a preview. Enrol in this course to track your progress and earn your certificate.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => course && enrolMutation.mutate(course.id)}
              isLoading={enrolMutation.isPending}
              disabled={!enrolMutation.canMutate}
              style={{ backgroundColor: ACCENT }}
              className="text-white hover:opacity-90 flex-shrink-0"
            >
              Enrol now
            </Button>
          </div>
        )}

        {/* Expired banner */}
        {isExpired && (
          <div className="flex items-start gap-2 p-4 rounded-xl border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-yellow-600 dark:text-yellow-500" />
            <p className="text-sm text-yellow-900 dark:text-yellow-100">
              Your access to this course has expired. Contact your admin to restore access.
            </p>
          </div>
        )}

        {/* Video Player */}
        {(video?.vimeo_url || lesson.lesson_type === "video") && (
          <VimeoPlayer
            vimeoUrl={video?.vimeo_url ?? null}
            title={lesson.title}
            startPositionSeconds={currentProgress?.last_position_seconds ?? 0}
            segmentStartSeconds={(course as any)?.segment_start_seconds ?? null}
            segmentEndSeconds={(course as any)?.segment_end_seconds ?? null}
            completionThreshold={completionThreshold}
            onFirstPlay={() => {
              if (canTrackProgress) {
                upsertProgress({ started_at: new Date().toISOString() });
              }
            }}
            onProgress={({ percentInt, seconds }) => {
              setLivePercent(percentInt);
              setLivePosition(seconds);
              if (canTrackProgress) {
                upsertProgress({
                  last_position_seconds: seconds,
                  watch_seconds: seconds,
                  completion_percentage: percentInt,
                });
              }
            }}
            onCompletionThresholdReached={() => {
              if (canTrackProgress) autoCompleteLesson();
            }}
            onEnded={() => {
              if (canTrackProgress) autoCompleteLesson();
            }}
          />
        )}


        {/* Lesson header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{lesson.title}</h1>
            {isPreview && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-accent/15 text-accent-foreground border border-accent/30">
                <Eye className="h-3 w-3" /> Preview
              </span>
            )}
            {isCompleted && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: "#22c55e1a", color: "#16a34a" }}>
                <CheckCircle2 className="h-3 w-3" /> Completed
              </span>
            )}
          </div>
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
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(lesson.content_markdown) }} />
          </div>
        )}

        {/* Mark Complete / Navigation */}
        <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: "hsl(var(--border))" }}>
          <div>
            {prevLesson && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => flushAndNavigate(`/academy/course/${slug}/lesson/${prevLesson.id}`)}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Previous
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isEnrolled && !isCompleted && !isExpired && effectivePercent >= 50 && (
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
            {isEnrolled && !isCompleted && !isExpired && effectivePercent < 50 && (
              <span className="text-[11px] text-muted-foreground">
                Watch at least 50% to mark complete ({effectivePercent}%)
              </span>
            )}
          </div>

          <div>
            {nextLesson ? (
              <Button
                size="sm"
                onClick={() => flushAndNavigate(`/academy/course/${slug}/lesson/${nextLesson.id}`)}
                style={{ backgroundColor: ACCENT }}
                className="text-white hover:opacity-90"
              >
                Next <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => flushAndNavigate(`/academy/course/${slug}`)}
              >
                Back to Course
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Course completion celebration */}
      <AppModal open={showCelebration} onOpenChange={setShowCelebration}>
        <AppModalContent size="md">
          <AppModalHeader>
            <AppModalTitle>🎉 Course complete!</AppModalTitle>
            <AppModalDescription>
              You've finished {course.title}. Your certificate is being generated and will appear in your certificates page shortly.
            </AppModalDescription>
          </AppModalHeader>
          <AppModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCelebration(false);
                navigate("/academy");
              }}
            >
              Back to Academy
            </Button>
            <Button
              onClick={() => {
                setShowCelebration(false);
                navigate("/academy/certificates");
              }}
              style={{ backgroundColor: ACCENT }}
              className="text-white hover:opacity-90"
            >
              View certificates
            </Button>
          </AppModalFooter>
        </AppModalContent>
      </AppModal>

      <QuickReflectionDrawer
        open={reflectionOpen}
        onOpenChange={setReflectionOpen}
        lessonProgressId={reflectionLessonProgressId}
        cycleId={pdpCycle?.id ?? null}
        lessonTitle={reflectionLessonTitle}
      />
    </div>
  );
}

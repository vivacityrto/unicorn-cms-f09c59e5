import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap, ChevronRight, Clock, Video, Star, Play, BookOpen, FileText, CheckCircle2, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useModulesWithLessons } from "@/hooks/academy/useAcademyModulesLessons";
import { formatDuration } from "@/hooks/useAcademyCourses";
import { toast } from "sonner";

export default function AcademyCourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Fetch course by slug
  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ["academy-course-detail", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_courses")
        .select("id, title, slug, description, short_description, target_audience, estimated_minutes, difficulty_level, status, tags, thumbnail_url, certificate_enabled")
        .eq("slug", slug!)
        .eq("status", "published")
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch enrollment + progress for current user
  const { data: enrollment, isLoading: enrollmentLoading } = useQuery({
    queryKey: ["academy-enrollment-detail", course?.id],
    enabled: !!course?.id,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !course?.id) return null;
      const { data } = await supabase
        .from("v_academy_course_progress")
        .select("enrollment_id, enrollment_status, progress_percentage, completed_lessons, total_lessons, has_certificate, certificate_number")
        .eq("user_id", user.id)
        .eq("course_id", course.id)
        .maybeSingle();
      return data;
    },
  });

  // Fetch completed lesson IDs for current user
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

  // Modules + lessons
  const { data: modules = [], isLoading: modulesLoading } = useModulesWithLessons(course?.id ?? null);

  // Enrol mutation
  const enrolMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !course) throw new Error("Not authenticated");
      const { error } = await supabase.from("academy_enrollments").insert({
        course_id: course.id,
        user_id: user.id,
        status: "active",
        source: "self_enrol",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("You're enrolled! Start learning.");
      qc.invalidateQueries({ queryKey: ["academy-enrollment-detail", course?.id] });
      qc.invalidateQueries({ queryKey: ["academy-courses"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to enrol"),
  });

  const isLoading = courseLoading || enrollmentLoading;
  const isEnrolled = enrollment?.enrollment_status === "active" || enrollment?.enrollment_status === "completed";
  const totalLessons = modules.reduce((sum, m) => sum + m.lessons.length, 0);
  const publishedLessons = modules.reduce((sum, m) => sum + m.lessons.filter(l => l.is_published).length, 0);

  const ACCENT = "#23c0dd";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="text-center py-16">
        <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="font-medium text-foreground">Course not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/academy")}>
          Back to Academy
        </Button>
      </div>
    );
  }

  const lessonIcon = (type: string | null) => {
    if (type === "video") return <Play className="h-4 w-4" />;
    if (type === "resource") return <FileText className="h-4 w-4" />;
    return <BookOpen className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
        <Link
          to="/academy"
          className="hover:opacity-80 transition-opacity flex items-center gap-1 font-medium"
          style={{ color: "#ed1878" }}
        >
          <GraduationCap className="h-3.5 w-3.5" />
          Vivacity Academy
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium" style={{ color: "#44235F" }}>
          {course.title}
        </span>
      </nav>

      {/* Hero section */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid hsl(var(--border))" }}>
        <div
          className="relative flex items-center justify-center"
          style={{
            height: 180,
            background: `linear-gradient(135deg, ${ACCENT} 0%, #7130A0 100%)`,
          }}
        >
          <div className="h-16 w-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Play className="h-7 w-7 text-white fill-white ml-0.5" />
          </div>
          {enrollment && enrollment.progress_percentage != null && enrollment.progress_percentage > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/20">
              <div
                className="h-full rounded-r-full"
                style={{ width: `${Math.min(100, enrollment.progress_percentage)}%`, backgroundColor: ACCENT }}
              />
            </div>
          )}
        </div>

        <div className="p-6 space-y-4">
          <h1 className="text-2xl font-bold text-foreground">{course.title}</h1>

          {/* Meta row */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> {formatDuration(course.estimated_minutes)}
            </span>
            <span className="flex items-center gap-1.5">
              <Video className="h-4 w-4" /> {publishedLessons} lessons
            </span>
            <span className="flex items-center gap-1.5">
              <Star className="h-4 w-4" /> {course.difficulty_level ?? "Beginner"}
            </span>
            {course.certificate_enabled && (
              <span className="flex items-center gap-1.5 text-amber-600">
                <GraduationCap className="h-4 w-4" /> Certificate
              </span>
            )}
          </div>

          {course.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{course.description}</p>
          )}

          {/* Action area */}
          <div className="flex items-center gap-3">
            {!isEnrolled && (
              <Button
                onClick={() => enrolMutation.mutate()}
                disabled={enrolMutation.isPending}
                style={{ backgroundColor: ACCENT }}
                className="text-white hover:opacity-90"
              >
                {enrolMutation.isPending ? "Enrolling…" : "Enrol Now"}
              </Button>
            )}
            {isEnrolled && enrollment?.progress_percentage != null && (
              <div className="text-sm font-medium" style={{ color: ACCENT }}>
                {enrollment.progress_percentage}% complete · {enrollment.completed_lessons ?? 0} of {enrollment.total_lessons ?? totalLessons} lessons
              </div>
            )}
            {enrollment?.has_certificate && (
              <span className="text-sm font-medium text-amber-600 flex items-center gap-1">
                🏆 Certificate Earned ({enrollment.certificate_number})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Course Outline */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Course Outline</h2>

        {modulesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : modules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No modules have been published for this course yet.</p>
        ) : (
          <Accordion type="multiple" className="space-y-2">
            {modules
              .filter(m => m.is_published !== false)
              .map((mod, idx) => {
                const publishedModLessons = mod.lessons.filter(l => l.is_published !== false);
                const completedCount = publishedModLessons.filter(l => completedLessonIds.includes(l.id)).length;
                return (
                  <AccordionItem
                    key={mod.id}
                    value={`mod-${mod.id}`}
                    className="rounded-lg border px-4"
                    style={{ borderColor: "hsl(var(--border))" }}
                  >
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3 text-left">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white flex-shrink-0"
                          style={{ backgroundColor: ACCENT }}
                        >
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-semibold text-sm text-foreground">{mod.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {publishedModLessons.length} lessons
                            {isEnrolled && ` · ${completedCount} completed`}
                          </p>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="space-y-1 pl-10">
                        {publishedModLessons.map((lesson) => {
                          const done = completedLessonIds.includes(lesson.id);
                          return (
                            <li
                              key={lesson.id}
                              className="flex items-center gap-2 py-2 px-3 rounded-md text-sm hover:bg-muted/50 transition-colors"
                            >
                              {done ? (
                                <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: "#22c55e" }} />
                              ) : isEnrolled ? (
                                <span className="text-muted-foreground">{lessonIcon(lesson.lesson_type)}</span>
                              ) : (
                                <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                              )}
                              <span className={done ? "text-muted-foreground line-through" : "text-foreground"}>
                                {lesson.title}
                              </span>
                              {lesson.estimated_minutes && (
                                <span className="ml-auto text-xs text-muted-foreground">
                                  {lesson.estimated_minutes}m
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
          </Accordion>
        )}
      </div>
    </div>
  );
}

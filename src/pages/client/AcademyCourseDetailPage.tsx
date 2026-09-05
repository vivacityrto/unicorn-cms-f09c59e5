import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap, ChevronRight, Clock, Video, Star, Play, BookOpen, FileText, CheckCircle2, Lock, User, CalendarDays, ClipboardCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useModulesWithLessons } from "@/hooks/academy/useAcademyModulesLessons";
import { formatDuration } from "@/hooks/useAcademyCourses";
import { toast } from "sonner";
import AssessmentEntrySection from "@/components/academy/AssessmentEntrySection";
import WebinarSeriesSubtitle from "@/components/academy/WebinarSeriesSubtitle";
import { useAcademyActingUserId } from "@/hooks/academy/useAcademyActingUserId";
import { useEnrolCourse } from "@/hooks/academy/useEnrolCourse";
import { useFacilitatorNames } from "@/hooks/academy/useFacilitatorNames";
import { resolveCourseBannerImage } from "@/lib/academy/thumbnails";
import { formatDeliveryDate } from "@/lib/academy/formatDeliveryDate";

const MAX_VISIBLE_BADGES = 6;

export default function AcademyCourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { userId } = useAcademyActingUserId();

  // Fetch course by slug
  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ["academy-course-detail", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_courses")
        .select("id, title, slug, description, short_description, target_audience, estimated_minutes, difficulty_level, status, tags, thumbnail_url, banner_thumbnail_url, banner_thumbnail_position, banner_thumbnail_fit, banner_thumbnail_zoom, certificate_enabled, pass_score, webinar_series, facilitator_id, facilitator_display_name, delivery_date")
        .eq("slug", slug!)
        .eq("status", "published")
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch enrollment + progress for current user
  const { data: enrollment, isLoading: enrollmentLoading } = useQuery({
    queryKey: ["academy-enrollment-detail", course?.id, userId],
    enabled: !!course?.id,
    queryFn: async () => {
      if (!userId || !course?.id) return null;
      const { data } = await supabase
        .from("v_academy_course_progress")
        .select("enrollment_id, enrollment_status, progress_percentage, completed_lessons, total_lessons, has_certificate, certificate_number")
        .eq("user_id", userId)
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
      return (data ?? []).map((r) => r.lesson_id);
    },
  });

  // Modules + lessons
  const { data: modules = [], isLoading: modulesLoading } = useModulesWithLessons(course?.id ?? null);

  // Facilitator display name (manual historical entry wins over a resolved staff name)
  const facilitatorLookupIds = course?.facilitator_id ? [course.facilitator_id] : [];
  const { data: facilitatorNameById = {} } = useFacilitatorNames(facilitatorLookupIds);
  const facilitatorName = course?.facilitator_display_name?.trim() || (course?.facilitator_id ? facilitatorNameById[course.facilitator_id] : undefined);
  const deliveryDateLabel = formatDeliveryDate(course?.delivery_date);

  // Enrol via dispatch hook (handles impersonation routing)
  const enrolMutation = useEnrolCourse();

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

  const heroImage = resolveCourseBannerImage(course);

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

      {/* Hero + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid hsl(var(--border))" }}>
            <div
              className="relative flex items-center justify-center w-full aspect-video overflow-hidden"
              style={{
                background: heroImage
                  ? undefined
                  : `linear-gradient(135deg, ${ACCENT} 0%, #7130A0 100%)`,
              }}
            >
              {heroImage && (
                <img
                  src={heroImage.url}
                  alt={course.title}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    objectFit: heroImage.fit,
                    objectPosition: heroImage.position,
                    transform: `scale(${heroImage.zoom})`,
                    transformOrigin: heroImage.position,
                  }}
                />
              )}
              <div className="relative h-16 w-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
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
          </div>

          <div>
            <h1 className="text-2xl font-bold text-foreground">{course.title}</h1>
            <WebinarSeriesSubtitle series={course.webinar_series} />
          </div>

          {course.short_description && (
            <p className="text-base font-medium text-foreground leading-snug">{course.short_description}</p>
          )}

          {course.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{course.description}</p>
          )}
        </div>

        {/* Sidebar: at-a-glance, the action to take, then curriculum */}
        <div className="lg:col-span-1 space-y-4 rounded-xl border p-5" style={{ borderColor: "hsl(var(--border))" }}>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Clock className="h-4 w-4 flex-shrink-0" /> {formatDuration(course.estimated_minutes)}
            </p>
            <p className="flex items-center gap-2">
              <Video className="h-4 w-4 flex-shrink-0" /> {publishedLessons} lesson{publishedLessons === 1 ? "" : "s"}
            </p>
            <p className="flex items-center gap-2">
              <Star className="h-4 w-4 flex-shrink-0" /> {course.difficulty_level ?? "Beginner"}
            </p>
            {course.certificate_enabled && (
              <p className="flex items-center gap-2 text-amber-600">
                <GraduationCap className="h-4 w-4 flex-shrink-0" /> Certificate on completion
                {course.pass_score != null && ` · ${course.pass_score}% to pass`}
              </p>
            )}
          </div>

          {(facilitatorName || deliveryDateLabel) && (
            <div className="space-y-1.5 border-t pt-3 text-sm text-muted-foreground" style={{ borderColor: "hsl(var(--border))" }}>
              {facilitatorName && (
                <p className="flex items-center gap-2">
                  <User className="h-4 w-4 flex-shrink-0" />
                  <span><span className="font-medium text-foreground">Facilitator:</span> {facilitatorName}</span>
                </p>
              )}
              {deliveryDateLabel && (
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 flex-shrink-0" />
                  <span><span className="font-medium text-foreground">Delivered:</span> {deliveryDateLabel}</span>
                </p>
              )}
            </div>
          )}

          {/* Action */}
          <div className="space-y-2 border-t pt-3" style={{ borderColor: "hsl(var(--border))" }}>
            {!isEnrolled && (
              <Button
                onClick={() => course && enrolMutation.mutate(course.id)}
                disabled={enrolMutation.isPending || !enrolMutation.canMutate}
                style={{ backgroundColor: ACCENT }}
                className="w-full text-white hover:opacity-90"
              >
                {enrolMutation.isPending ? "Enrolling…" : "Start Now"}
              </Button>
            )}
            {isEnrolled && enrollment?.progress_percentage != null && (
              <div className="text-sm font-medium" style={{ color: ACCENT }}>
                {enrollment.progress_percentage}% complete · {enrollment.completed_lessons ?? 0} of {enrollment.total_lessons ?? totalLessons} lessons
              </div>
            )}
            {enrollment?.has_certificate && (
              <p className="text-sm font-medium text-amber-600 flex items-center gap-1">
                🏆 Certificate Earned ({enrollment.certificate_number})
              </p>
            )}
            {course.certificate_enabled && (
              <p className="flex items-center gap-2 text-xs" style={{ color: ACCENT }}>
                <ClipboardCheck className="h-3.5 w-3.5 flex-shrink-0" />
                Completing every lesson unlocks a short quiz for your certificate.
              </p>
            )}
          </div>

          {Array.isArray(course.target_audience) && course.target_audience.length > 0 && (
              <div className="space-y-1.5 border-t pt-3" style={{ borderColor: "hsl(var(--border))" }}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who it's for</p>
                <div className="flex flex-wrap gap-1.5">
                  {course.target_audience.slice(0, MAX_VISIBLE_BADGES).map((a: string) => (
                    <span key={a} className="text-xs px-2 py-1 rounded-full bg-muted text-foreground">
                      {a.replace(/_/g, " ")}
                    </span>
                  ))}
                  {course.target_audience.length > MAX_VISIBLE_BADGES && (
                    <span className="text-xs px-2 py-1 text-muted-foreground">
                      +{course.target_audience.length - MAX_VISIBLE_BADGES} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {Array.isArray(course.tags) && course.tags.length > 0 && (
              <div className="space-y-1.5 border-t pt-3" style={{ borderColor: "hsl(var(--border))" }}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Topics</p>
                <div className="flex flex-wrap gap-1.5">
                  {course.tags.slice(0, MAX_VISIBLE_BADGES).map((t: string) => (
                    <span
                      key={t}
                      className="text-xs px-2 py-1 rounded-full"
                      style={{ backgroundColor: `${ACCENT}1a`, color: "#44235F" }}
                    >
                      {t}
                    </span>
                  ))}
                  {course.tags.length > MAX_VISIBLE_BADGES && (
                    <span className="text-xs px-2 py-1 text-muted-foreground">
                      +{course.tags.length - MAX_VISIBLE_BADGES} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Course Outline */}
            <div className="space-y-2 border-t pt-3" style={{ borderColor: "hsl(var(--border))" }}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Course Outline</h2>

              {modulesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : modules.length === 0 ? (
                <p className="text-sm text-muted-foreground">No modules have been published for this course yet.</p>
              ) : (
                <Accordion
                  type="multiple"
                  className="space-y-2"
                  defaultValue={modules.filter(m => m.is_published !== false).map(m => `mod-${m.id}`)}
                >
                  {modules
                    .filter(m => m.is_published !== false)
                    .map((mod, idx) => {
                      const publishedModLessons = mod.lessons.filter(l => l.is_published !== false);
                      const completedCount = publishedModLessons.filter(l => completedLessonIds.includes(l.id)).length;
                      return (
                        <AccordionItem
                          key={mod.id}
                          value={`mod-${mod.id}`}
                          className="rounded-lg border px-3"
                          style={{ borderColor: "hsl(var(--border))" }}
                        >
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-2.5 text-left">
                              <span
                                className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white flex-shrink-0"
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
                            <ul className="space-y-1 pl-8">
                              {publishedModLessons.map((lesson) => {
                                const done = completedLessonIds.includes(lesson.id);
                                const canNavigate = isEnrolled;
                                return (
                                  <li
                                    key={lesson.id}
                                    className={`flex items-center gap-2 py-2 px-2 rounded-md text-sm hover:bg-muted/50 transition-colors ${canNavigate ? "cursor-pointer" : ""}`}
                                    onClick={canNavigate ? () => navigate(`/academy/course/${slug}/lesson/${lesson.id}`) : undefined}
                                    role={canNavigate ? "button" : undefined}
                                    tabIndex={canNavigate ? 0 : undefined}
                                    onKeyDown={canNavigate ? (e) => { if (e.key === "Enter") navigate(`/academy/course/${slug}/lesson/${lesson.id}`); } : undefined}
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
      </div>

      {/* Assessment Section */}
      {course && (
        <AssessmentEntrySection
          courseId={course.id}
          slug={course.slug}
          enrollmentStatus={enrollment?.enrollment_status ?? null}
          hasCertificate={enrollment?.has_certificate ?? false}
        />
      )}
    </div>
  );
}
